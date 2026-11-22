const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { downloadFile, fetchJson } = require('./download');
const { ensureDir, getProfileDirs } = require('./paths');

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';

const PEAK_FPS_PACK_IDS = [
  { id: 'P7dR8mSH', label: 'Fabric API' },
  { id: 'AANobbMI', label: 'Sodium' },
  { id: 'gvQqBUqZ', label: 'Lithium' },
  { id: 'uXXizFIs', label: 'FerriteCore' },
  { id: 'NNAgCjsB', label: 'Entity Culling' },
  { id: '5ZwdcRci', label: 'ImmediatelyFast' },
  { id: 'mOgUt4GM', label: 'Mod Menu' }
];

const PEAK_PACKS = {
  fps: {
    id: 'fps',
    title: 'Peak FPS Boost',
    items: PEAK_FPS_PACK_IDS
  },
  shaders: {
    id: 'shaders',
    title: 'Peak Shadery (Iris)',
    items: [
      { id: 'P7dR8mSH', label: 'Fabric API' },
      { id: 'AANobbMI', label: 'Sodium' },
      { id: 'YL57xq9U', label: 'Iris Shaders' },
      { id: 'mOgUt4GM', label: 'Mod Menu' }
    ]
  },
  qol: {
    id: 'qol',
    title: 'Peak Survival+ QoL',
    items: [
      { id: 'P7dR8mSH', label: 'Fabric API' },
      { id: 'mOgUt4GM', label: 'Mod Menu' },
      { id: 'EsAfCjCV', label: 'AppleSkin' },
      { id: 'nvQzSEkH', label: 'Jade' },
      { id: 'aC3cM3Vq', label: 'Mouse Tweaks' },
      { id: 'w7ThoJFB', label: 'Zoomify' },
      { id: '1bokaNcj', label: "Xaero's Minimap" }
    ]
  }
};

function normalizeProjectType(projectType) {
  if (projectType === 'shader' || projectType === 'resourcepack') return projectType;
  return 'mod';
}

function getContentDir(dataDir, profileId, projectType = 'mod') {
  const dirs = getProfileDirs(dataDir, profileId);
  const type = normalizeProjectType(projectType);
  const target =
    type === 'shader'
      ? dirs.shaderpacksDir
      : type === 'resourcepack'
        ? dirs.resourcepacksDir
        : dirs.modsDir;
  ensureDir(target);
  return target;
}

function getProfileModsDir(dataDir, profileId) {
  return getContentDir(dataDir, profileId, 'mod');
}

function getMetadataFilePath(dataDir, profileId) {
  const { instanceDir } = getProfileDirs(dataDir, profileId);
  ensureDir(instanceDir);
  return path.join(instanceDir, '.peak-mods.json');
}

function readModsMetadata(dataDir, profileId) {
  const metaPath = getMetadataFilePath(dataDir, profileId);
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
  } catch {
    // Ignore corrupted metadata
  }
  return {};
}

function writeModsMetadata(dataDir, profileId, metadata) {
  const metaPath = getMetadataFilePath(dataDir, profileId);
  const tmpPath = `${metaPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(metadata, null, 2), 'utf8');
  fs.renameSync(tmpPath, metaPath);
}

function updateModsMetadata(dataDir, profileId, mutator) {
  const current = readModsMetadata(dataDir, profileId);
  const next = mutator(current) || current;
  writeModsMetadata(dataDir, profileId, next);
  return next;
}

function normalizeJarKey(fileName) {
  return String(fileName || '').replace(/\.disabled$/i, '');
}

function safeParseJsonLenient(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    try {
      const sanitized = rawText.replace(/[\r\n]+/g, ' ');
      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
}

function readModMetadataFromJar(jarPath) {
  const fallbackName = path.basename(jarPath).replace(/(\.(jar|zip))(\.disabled)?$/i, '');
  const info = {
    modId: '',
    name: fallbackName,
    version: '',
    description: '',
    authors: []
  };

  if (!/\.jar(\.disabled)?$/i.test(jarPath)) {
    return info;
  }

  try {
    const zip = new AdmZip(jarPath);
    const fabricEntry = zip.getEntry('fabric.mod.json');
    if (fabricEntry) {
      const parsed = safeParseJsonLenient(fabricEntry.getData().toString('utf8'));
      if (parsed) {
        info.modId = parsed.id || '';
        info.name = parsed.name || parsed.id || fallbackName;
        info.version = parsed.version || '';
        info.description = parsed.description || '';
        if (Array.isArray(parsed.authors)) {
          info.authors = parsed.authors
            .map((a) => (typeof a === 'string' ? a : a && a.name))
            .filter(Boolean);
        }
        return info;
      }
    }

    const quiltEntry = zip.getEntry('quilt.mod.json');
    if (quiltEntry) {
      const parsed = safeParseJsonLenient(quiltEntry.getData().toString('utf8'));
      const meta = parsed?.quilt_loader?.metadata;
      if (meta) {
        info.modId = parsed.quilt_loader.id || '';
        info.name = meta.name || info.modId || fallbackName;
        info.version = parsed.quilt_loader.version || '';
        info.description = meta.description || '';
        return info;
      }
    }
  } catch {
    // Non-fatal: jar might be non-standard or locked
  }

  return info;
}

function isSupportedContentFile(fileName, projectType) {
  const lower = String(fileName || '').toLowerCase();
  if (projectType === 'mod') {
    return lower.endsWith('.jar') || lower.endsWith('.jar.disabled');
  }
  return (
    lower.endsWith('.zip') ||
    lower.endsWith('.zip.disabled') ||
    lower.endsWith('.jar') ||
    lower.endsWith('.jar.disabled')
  );
}

function listProfileContent(dataDir, profileId, projectType = 'mod') {
  const type = normalizeProjectType(projectType);
  const contentDir = getContentDir(dataDir, profileId, type);
  const sidecar = readModsMetadata(dataDir, profileId);
  const entries = fs.readdirSync(contentDir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isSupportedContentFile(entry.name, type)) continue;

    const lower = entry.name.toLowerCase();
    const isEnabled = !lower.endsWith('.disabled');
    const fullPath = path.join(contentDir, entry.name);
    const stat = fs.statSync(fullPath);
    const jarInfo = readModMetadataFromJar(fullPath);
    const key = normalizeJarKey(entry.name);
    const modrinthInfo = sidecar[key] || null;

    items.push({
      fileName: entry.name,
      baseFileName: key,
      filePath: fullPath,
      enabled: isEnabled,
      projectType: type,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      modId: jarInfo.modId,
      name: modrinthInfo?.title || jarInfo.name,
      version: jarInfo.version || modrinthInfo?.versionNumber || '',
      versionId: modrinthInfo?.versionId || null,
      description: jarInfo.description || modrinthInfo?.description || '',
      authors: jarInfo.authors,
      projectId: modrinthInfo?.projectId || null,
      iconUrl: modrinthInfo?.iconUrl || null
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

function listProfileMods(dataDir, profileId) {
  return listProfileContent(dataDir, profileId, 'mod');
}

function toggleContent(dataDir, profileId, fileName, enabled, projectType = 'mod') {
  const type = normalizeProjectType(projectType);
  const contentDir = getContentDir(dataDir, profileId, type);
  const safeName = path.basename(fileName);
  const currentPath = path.join(contentDir, safeName);
  if (!fs.existsSync(currentPath)) {
    throw new Error(`Nie znaleziono pliku: ${safeName}`);
  }

  const baseName = normalizeJarKey(safeName);
  if (!isSupportedContentFile(baseName, type)) {
    throw new Error('Nieprawidłowy plik.');
  }

  const targetName = enabled ? baseName : `${baseName}.disabled`;
  const targetPath = path.join(contentDir, targetName);
  if (currentPath !== targetPath) {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(currentPath, targetPath);
  }

  return listProfileContent(dataDir, profileId, type);
}

function toggleMod(dataDir, profileId, fileName, enabled) {
  return toggleContent(dataDir, profileId, fileName, enabled, 'mod');
}

function deleteContent(dataDir, profileId, fileName, projectType = 'mod') {
  const type = normalizeProjectType(projectType);
  const contentDir = getContentDir(dataDir, profileId, type);
  const safeName = path.basename(fileName);
  const targetPath = path.join(contentDir, safeName);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  const key = normalizeJarKey(safeName);
  updateModsMetadata(dataDir, profileId, (sidecar) => {
    if (sidecar[key]) delete sidecar[key];
    return sidecar;
  });
  return listProfileContent(dataDir, profileId, type);
}

function deleteMod(dataDir, profileId, fileName) {
  return deleteContent(dataDir, profileId, fileName, 'mod');
}

function importLocalContent(dataDir, profileId, filePaths, projectType = 'mod') {
  const type = normalizeProjectType(projectType);
  const contentDir = getContentDir(dataDir, profileId, type);
  const imported = [];

  for (const srcPath of filePaths || []) {
    if (!srcPath || typeof srcPath !== 'string') continue;
    const resolved = path.resolve(srcPath);
    if (!fs.existsSync(resolved)) continue;
    const base = path.basename(resolved);
    if (!isSupportedContentFile(base, type)) continue;
    const destPath = path.join(contentDir, base);
    if (resolved !== destPath) {
      fs.copyFileSync(resolved, destPath);
    }
    imported.push(base);
  }

  return {
    imported,
    mods: listProfileContent(dataDir, profileId, type)
  };
}

function importLocalMods(dataDir, profileId, filePaths) {
  return importLocalContent(dataDir, profileId, filePaths, 'mod');
}

function normalizeSortIndex(sort, query) {
  const valid = new Set(['downloads', 'relevance', 'updated', 'newest', 'follows']);
  if (sort && sort !== 'auto' && valid.has(sort)) return sort;
  return query && String(query).trim() ? 'relevance' : 'downloads';
}

function buildSearchFacets({ projectType, mcVersion, category, includeVersion }) {
  const type = normalizeProjectType(projectType);
  const facets = [[`project_type:${type}`]];
  if (type === 'mod') {
    facets.push(['categories:fabric']);
  }
  if (includeVersion && mcVersion) {
    facets.push([`versions:${mcVersion}`]);
  }
  if (category && category !== 'all') {
    facets.push([`categories:${category}`]);
  }
  return facets;
}

function mapSearchHit(hit, projectType) {
  return {
    projectId: hit.project_id,
    slug: hit.slug,
    projectType: normalizeProjectType(projectType),
    title: hit.title,
    description: hit.description,
    author: hit.author,
    iconUrl: hit.icon_url || '',
    downloads: hit.downloads || 0,
    follows: hit.follows || 0,
    categories: hit.categories || [],
    versions: hit.versions || []
  };
}

async function searchModrinth({
  query = '',
  mcVersion = '',
  category = '',
  projectType = 'mod',
  offset = 0,
  limit = 24,
  sort = 'auto'
} = {}) {
  const type = normalizeProjectType(projectType);
  const index = normalizeSortIndex(sort, query);
  const includeVersion = type !== 'shader';

  const runQuery = async (withVersion) => {
    const facets = buildSearchFacets({
      projectType: type,
      mcVersion,
      category,
      includeVersion: withVersion
    });
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      index,
      facets: JSON.stringify(facets)
    });
    if (query && query.trim()) {
      params.set('query', query.trim());
    }
    return fetchJson(`${MODRINTH_API_BASE}/search?${params.toString()}`);
  };

  let data = await runQuery(includeVersion);
  let fallbackAllVersions = false;

  if (type === 'resourcepack' && includeVersion && (!data.hits || data.hits.length === 0)) {
    data = await runQuery(false);
    fallbackAllVersions = true;
  }

  const hits = (data.hits || []).map((h) => mapSearchHit(h, type));
  const totalHits = typeof data.total_hits === 'number' ? data.total_hits : hits.length;

  return {
    hits,
    totalHits,
    offset,
    limit,
    hasMore: offset + hits.length < totalHits,
    fallbackAllVersions
  };
}

async function fetchCompatibleVersions({ projectId, mcVersion, projectType = 'mod' }) {
  const type = normalizeProjectType(projectType);
  if (type === 'mod') {
    const loadersParam = encodeURIComponent(JSON.stringify(['fabric']));
    const gvQuery = mcVersion
      ? `&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`
      : '';
    return fetchJson(
      `${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}/version?loaders=${loadersParam}${gvQuery}`
    );
  }

  if (type === 'resourcepack' && mcVersion) {
    const filtered = await fetchJson(
      `${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}/version?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`
    );
    if (Array.isArray(filtered) && filtered.length > 0) return filtered;
  }

  return fetchJson(`${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}/version`);
}

async function getModrinthProjectDetails(projectId, mcVersion = '', projectType = 'mod') {
  if (!projectId) throw new Error('Brak identyfikatora projektu Modrinth.');
  const type = normalizeProjectType(projectType);

  const [project, versions] = await Promise.all([
    fetchJson(`${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}`),
    fetchCompatibleVersions({ projectId, mcVersion, projectType: type }).catch(() => [])
  ]);

  let authorName = '';
  try {
    if (project.team) {
      const members = await fetchJson(
        `${MODRINTH_API_BASE}/team/${encodeURIComponent(project.team)}/members`
      );
      if (Array.isArray(members) && members.length > 0) {
        const owner = members.find((m) => /owner/i.test(m.role || '')) || members[0];
        authorName = owner?.user?.username || '';
      }
    }
  } catch {
    // Non-fatal team lookup
  }

  const mappedVersions = (Array.isArray(versions) ? versions : []).slice(0, 40).map((v) => ({
    id: v.id,
    name: v.name || v.version_number,
    versionNumber: v.version_number || '',
    versionType: v.version_type || 'release',
    datePublished: v.date_published || '',
    downloads: v.downloads || 0,
    gameVersions: v.game_versions || [],
    loaders: v.loaders || [],
    dependencies: (v.dependencies || []).filter((d) => d.dependency_type === 'required')
  }));

  return {
    projectId: project.id,
    slug: project.slug,
    projectType: type,
    title: project.title,
    description: project.description || '',
    body: project.body || '',
    author: authorName,
    iconUrl: project.icon_url || '',
    downloads: project.downloads || 0,
    followers: project.followers || 0,
    clientSide: project.client_side || '',
    serverSide: project.server_side || '',
    license: project.license?.id || project.license?.name || '',
    sourceUrl: project.source_url || '',
    projectUrl: `https://modrinth.com/${type}/${project.slug || project.id}`,
    categories: project.categories || [],
    versions: mappedVersions
  };
}

function removeDuplicateInstalledItems({ dataDir, profileId, projectType, projectId, newFileName, newModId }) {
  const existing = listProfileContent(dataDir, profileId, projectType);
  const newKey = normalizeJarKey(newFileName);

  for (const item of existing) {
    if (item.baseFileName === newKey) continue;
    const sameProject = Boolean(projectId && item.projectId === projectId);
    const sameModId = Boolean(newModId && item.modId && item.modId === newModId);
    if (sameProject || sameModId) {
      try {
        if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath);
      } catch {
        // Ignore deletion failure
      }
      updateModsMetadata(dataDir, profileId, (sidecar) => {
        if (sidecar[item.baseFileName]) delete sidecar[item.baseFileName];
        return sidecar;
      });
    }
  }
}

async function installModrinthContent({
  projectId,
  versionId = null,
  projectType = 'mod',
  mcVersion,
  dataDir,
  profileId,
  projectMeta = null,
  onProgress = null,
  visited = new Set()
}) {
  if (!projectId) throw new Error('Brak identyfikatora projektu Modrinth.');
  if (visited.has(projectId)) {
    return { installed: [], dependenciesInstalled: [] };
  }
  visited.add(projectId);

  const type = normalizeProjectType(projectType);
  const contentDir = getContentDir(dataDir, profileId, type);

  let meta = projectMeta;
  if (!meta) {
    try {
      const p = await fetchJson(`${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}`);
      meta = {
        projectId: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        iconUrl: p.icon_url || ''
      };
    } catch {
      meta = { projectId, title: projectId, description: '', iconUrl: '' };
    }
  }

  let chosenVersion = null;
  if (versionId) {
    chosenVersion = await fetchJson(`${MODRINTH_API_BASE}/version/${encodeURIComponent(versionId)}`);
  } else {
    const existingItems = listProfileContent(dataDir, profileId, type);
    if (existingItems.some((m) => m.projectId === projectId)) {
      return { installed: [], dependenciesInstalled: [], alreadyInstalled: true };
    }

    if (onProgress) {
      onProgress({
        stage: 'mods',
        projectId,
        message: `Szukanie ${meta.title || projectId} dla MC ${mcVersion}...`
      });
    }

    const versions = await fetchCompatibleVersions({ projectId, mcVersion, projectType: type });
    if (!Array.isArray(versions) || versions.length === 0) {
      throw new Error(
        `"${meta.title || projectId}" nie ma jeszcze wydania dla ${mcVersion}.`
      );
    }
    chosenVersion = versions.find((v) => v.version_type === 'release') || versions[0];
  }

  const files = Array.isArray(chosenVersion.files) ? chosenVersion.files : [];
  const primaryFile = files.find((f) => f.primary) || files[0];
  if (!primaryFile || !primaryFile.url) {
    throw new Error(`Brak pliku do pobrania dla ${meta.title || projectId}.`);
  }

  const safeFilename = path.basename(
    primaryFile.filename || `${projectId}.${type === 'mod' ? 'jar' : 'zip'}`
  );
  const destPath = path.join(contentDir, safeFilename);
  const hashAlgo = primaryFile.hashes?.sha512 ? 'sha512' : primaryFile.hashes?.sha1 ? 'sha1' : 'sha1';
  const expectedHash = primaryFile.hashes?.[hashAlgo] || null;

  await downloadFile(primaryFile.url, destPath, {
    expectedHash,
    hashAlgo,
    onProgress: ({ downloadedBytes, totalBytes }) => {
      if (onProgress) {
        onProgress({
          stage: 'mods',
          projectId,
          downloadedBytes,
          totalBytes,
          message: `Pobieranie ${meta.title || safeFilename}...`
        });
      }
    }
  });

  const downloadedInfo = readModMetadataFromJar(destPath);
  removeDuplicateInstalledItems({
    dataDir,
    profileId,
    projectType: type,
    projectId,
    newFileName: safeFilename,
    newModId: downloadedInfo.modId
  });

  updateModsMetadata(dataDir, profileId, (sidecar) => {
    sidecar[normalizeJarKey(safeFilename)] = {
      projectId,
      projectType: type,
      slug: meta.slug || '',
      title: meta.title || downloadedInfo.name || safeFilename,
      description: meta.description || downloadedInfo.description || '',
      iconUrl: meta.iconUrl || '',
      versionId: chosenVersion.id,
      versionNumber: chosenVersion.version_number || ''
    };
    return sidecar;
  });

  const installed = [{ projectId, title: meta.title || safeFilename, fileName: safeFilename }];
  const dependenciesInstalled = [];

  if (type === 'mod') {
    const deps = Array.isArray(chosenVersion.dependencies) ? chosenVersion.dependencies : [];
    for (const dep of deps) {
      if (dep.dependency_type !== 'required') continue;
      let depProjectId = dep.project_id || null;
      if (!depProjectId && dep.version_id) {
        try {
          const depVer = await fetchJson(
            `${MODRINTH_API_BASE}/version/${encodeURIComponent(dep.version_id)}`
          );
          depProjectId = depVer?.project_id || null;
        } catch {
          depProjectId = null;
        }
      }
      if (!depProjectId || visited.has(depProjectId)) continue;

      try {
        const subRes = await installModrinthContent({
          projectId: depProjectId,
          projectType: 'mod',
          mcVersion,
          dataDir,
          profileId,
          onProgress,
          visited
        });
        if (subRes.installed?.length) dependenciesInstalled.push(...subRes.installed);
        if (subRes.dependenciesInstalled?.length) {
          dependenciesInstalled.push(...subRes.dependenciesInstalled);
        }
      } catch {
        // Continue even if an optional/nested dependency fails lookup
      }
    }
  }

  return { installed, dependenciesInstalled };
}

async function installModrinthMod(params) {
  return installModrinthContent({ ...params, projectType: 'mod' });
}

async function installCuratedPack({ packId = 'fps', mcVersion, dataDir, profileId, onProgress = null }) {
  const pack = PEAK_PACKS[packId] || PEAK_PACKS.fps;
  const visited = new Set();
  const installed = [];
  const skipped = [];

  for (let i = 0; i < pack.items.length; i++) {
    const item = pack.items[i];
    if (onProgress) {
      onProgress({
        stage: 'mods',
        percent: Math.round((i / pack.items.length) * 100),
        message: `${pack.title} (${i + 1}/${pack.items.length}): ${item.label}...`
      });
    }
    try {
      const res = await installModrinthContent({
        projectId: item.id,
        projectType: 'mod',
        mcVersion,
        dataDir,
        profileId,
        onProgress,
        visited
      });
      if (res.installed) installed.push(...res.installed);
      if (res.dependenciesInstalled) installed.push(...res.dependenciesInstalled);
    } catch (err) {
      skipped.push({ id: item.id, label: item.label, reason: err.message });
    }
  }

  return {
    packId: pack.id,
    packTitle: pack.title,
    installed,
    skipped,
    mods: listProfileMods(dataDir, profileId)
  };
}

async function installPeakFpsPack(params) {
  return installCuratedPack({ ...params, packId: 'fps' });
}

async function checkAndUpdateProfileMods({
  mcVersion,
  dataDir,
  profileId,
  applyUpdates = false,
  onProgress = null
}) {
  const installed = listProfileMods(dataDir, profileId);
  const trackable = installed.filter((m) => m.projectId);
  const updatesAvailable = [];
  const updated = [];

  for (let i = 0; i < trackable.length; i++) {
    const mod = trackable[i];
    try {
      const versions = await fetchCompatibleVersions({
        projectId: mod.projectId,
        mcVersion,
        projectType: 'mod'
      });
      if (!Array.isArray(versions) || versions.length === 0) continue;
      const latest = versions.find((v) => v.version_type === 'release') || versions[0];
      if (!latest) continue;

      const isDifferentId = mod.versionId ? latest.id !== mod.versionId : false;
      const isDifferentVer =
        !mod.versionId && mod.version && latest.version_number !== mod.version;

      if (isDifferentId || isDifferentVer) {
        const entry = {
          projectId: mod.projectId,
          title: mod.name,
          currentVersion: mod.version || mod.versionId || '?',
          latestVersion: latest.version_number || latest.name,
          latestVersionId: latest.id
        };
        updatesAvailable.push(entry);

        if (applyUpdates) {
          if (onProgress) {
            onProgress({
              stage: 'mods',
              message: `Aktualizowanie ${mod.name} -> ${entry.latestVersion}...`
            });
          }
          await installModrinthContent({
            projectId: mod.projectId,
            versionId: latest.id,
            projectType: 'mod',
            mcVersion,
            dataDir,
            profileId,
            projectMeta: {
              projectId: mod.projectId,
              title: mod.name,
              description: mod.description,
              iconUrl: mod.iconUrl || ''
            },
            onProgress
          });
          updated.push(entry);
        }
      }
    } catch {
      // Skip transient API error for individual mod
    }
  }

  return {
    checked: trackable.length,
    updatesAvailable,
    updated,
    mods: listProfileMods(dataDir, profileId)
  };
}

module.exports = {
  MODRINTH_API_BASE,
  PEAK_FPS_PACK_IDS,
  PEAK_PACKS,
  getContentDir,
  getProfileModsDir,
  listProfileContent,
  listProfileMods,
  toggleContent,
  toggleMod,
  deleteContent,
  deleteMod,
  importLocalContent,
  importLocalMods,
  searchModrinth,
  getModrinthProjectDetails,
  installModrinthContent,
  installModrinthMod,
  installCuratedPack,
  installPeakFpsPack,
  checkAndUpdateProfileMods
};
