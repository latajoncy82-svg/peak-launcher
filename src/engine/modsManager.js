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
  { id: 'mOgUt4GM', label: 'Mod Menu' }
];

function getProfileModsDir(dataDir, profileId) {
  const { modsDir } = getProfileDirs(dataDir, profileId);
  ensureDir(modsDir);
  return modsDir;
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
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
}

function normalizeJarKey(fileName) {
  return String(fileName || '').replace(/\.disabled$/i, '');
}

function safeParseJsonLenient(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    try {
      // Some older fabric.mod.json files contain trailing newlines in description strings
      const sanitized = rawText.replace(/[\r\n]+/g, ' ');
      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
}

function readModMetadataFromJar(jarPath) {
  const fallbackName = path.basename(jarPath).replace(/(\.jar)(\.disabled)?$/i, '');
  const info = {
    modId: '',
    name: fallbackName,
    version: '',
    description: '',
    authors: []
  };

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

function listProfileMods(dataDir, profileId) {
  const modsDir = getProfileModsDir(dataDir, profileId);
  const sidecar = readModsMetadata(dataDir, profileId);
  const entries = fs.readdirSync(modsDir, { withFileTypes: true });
  const mods = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    const isEnabled = lower.endsWith('.jar');
    const isDisabled = lower.endsWith('.jar.disabled');
    if (!isEnabled && !isDisabled) continue;

    const fullPath = path.join(modsDir, entry.name);
    const stat = fs.statSync(fullPath);
    const jarInfo = readModMetadataFromJar(fullPath);
    const key = normalizeJarKey(entry.name);
    const modrinthInfo = sidecar[key] || null;

    mods.push({
      fileName: entry.name,
      baseFileName: key,
      filePath: fullPath,
      enabled: isEnabled,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      modId: jarInfo.modId,
      name: modrinthInfo?.title || jarInfo.name,
      version: jarInfo.version || modrinthInfo?.versionNumber || '',
      description: jarInfo.description || modrinthInfo?.description || '',
      authors: jarInfo.authors,
      projectId: modrinthInfo?.projectId || null,
      iconUrl: modrinthInfo?.iconUrl || null
    });
  }

  mods.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return mods;
}

function toggleMod(dataDir, profileId, fileName, enabled) {
  const modsDir = getProfileModsDir(dataDir, profileId);
  const safeName = path.basename(fileName);
  const currentPath = path.join(modsDir, safeName);
  if (!fs.existsSync(currentPath)) {
    throw new Error(`Nie znaleziono pliku moda: ${safeName}`);
  }

  const baseName = normalizeJarKey(safeName);
  if (!baseName.toLowerCase().endsWith('.jar')) {
    throw new Error('Nieprawidłowy plik moda.');
  }

  const targetName = enabled ? baseName : `${baseName}.disabled`;
  const targetPath = path.join(modsDir, targetName);
  if (currentPath !== targetPath) {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(currentPath, targetPath);
  }

  return listProfileMods(dataDir, profileId);
}

function deleteMod(dataDir, profileId, fileName) {
  const modsDir = getProfileModsDir(dataDir, profileId);
  const safeName = path.basename(fileName);
  const targetPath = path.join(modsDir, safeName);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  const sidecar = readModsMetadata(dataDir, profileId);
  const key = normalizeJarKey(safeName);
  if (sidecar[key]) {
    delete sidecar[key];
    writeModsMetadata(dataDir, profileId, sidecar);
  }
  return listProfileMods(dataDir, profileId);
}

function importLocalMods(dataDir, profileId, filePaths) {
  const modsDir = getProfileModsDir(dataDir, profileId);
  const imported = [];

  for (const srcPath of filePaths || []) {
    if (!srcPath || typeof srcPath !== 'string') continue;
    const resolved = path.resolve(srcPath);
    if (!fs.existsSync(resolved)) continue;
    const base = path.basename(resolved);
    if (!base.toLowerCase().endsWith('.jar') && !base.toLowerCase().endsWith('.jar.disabled')) {
      continue;
    }
    const destPath = path.join(modsDir, base);
    if (resolved !== destPath) {
      fs.copyFileSync(resolved, destPath);
    }
    imported.push(base);
  }

  return {
    imported,
    mods: listProfileMods(dataDir, profileId)
  };
}

async function searchModrinth({
  query = '',
  mcVersion = '',
  category = '',
  offset = 0,
  limit = 20,
  sort = 'downloads'
} = {}) {
  const facets = [['project_type:mod'], ['categories:fabric']];
  if (mcVersion) {
    facets.push([`versions:${mcVersion}`]);
  }
  if (category && category !== 'all') {
    facets.push([`categories:${category}`]);
  }

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    index: sort || 'downloads',
    facets: JSON.stringify(facets)
  });
  if (query && query.trim()) {
    params.set('query', query.trim());
  }

  const data = await fetchJson(`${MODRINTH_API_BASE}/search?${params.toString()}`);
  const hits = (data.hits || []).map((hit) => ({
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    iconUrl: hit.icon_url || '',
    downloads: hit.downloads || 0,
    categories: hit.categories || [],
    versions: hit.versions || []
  }));

  return {
    hits,
    totalHits: data.total_hits || hits.length
  };
}

async function installModrinthMod({
  projectId,
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

  const modsDir = getProfileModsDir(dataDir, profileId);
  const sidecar = readModsMetadata(dataDir, profileId);

  // Skip if already installed for this project
  const existingMods = listProfileMods(dataDir, profileId);
  if (existingMods.some((m) => m.projectId === projectId)) {
    return { installed: [], dependenciesInstalled: [], alreadyInstalled: true };
  }

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

  if (onProgress) {
    onProgress({
      stage: 'mods',
      projectId,
      message: `Szukanie wersji moda ${meta.title || projectId} dla MC ${mcVersion}...`
    });
  }

  const loadersParam = encodeURIComponent(JSON.stringify(['fabric']));
  const gameVersionsParam = encodeURIComponent(JSON.stringify([mcVersion]));
  const versions = await fetchJson(
    `${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}/version?loaders=${loadersParam}&game_versions=${gameVersionsParam}`
  );

  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(
      `Mod "${meta.title || projectId}" nie ma jeszcze wydania dla Fabric ${mcVersion}.`
    );
  }

  const chosenVersion =
    versions.find((v) => v.version_type === 'release') || versions[0];
  const files = Array.isArray(chosenVersion.files) ? chosenVersion.files : [];
  const primaryFile = files.find((f) => f.primary) || files[0];
  if (!primaryFile || !primaryFile.url) {
    throw new Error(`Brak pliku JAR dla moda ${meta.title || projectId}.`);
  }

  const safeFilename = path.basename(primaryFile.filename || `${projectId}.jar`);
  const destPath = path.join(modsDir, safeFilename);
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

  sidecar[normalizeJarKey(safeFilename)] = {
    projectId,
    slug: meta.slug || '',
    title: meta.title || safeFilename,
    description: meta.description || '',
    iconUrl: meta.iconUrl || '',
    versionId: chosenVersion.id,
    versionNumber: chosenVersion.version_number || ''
  };
  writeModsMetadata(dataDir, profileId, sidecar);

  const installed = [{ projectId, title: meta.title || safeFilename, fileName: safeFilename }];
  const dependenciesInstalled = [];

  const deps = Array.isArray(chosenVersion.dependencies) ? chosenVersion.dependencies : [];
  for (const dep of deps) {
    if (dep.dependency_type !== 'required' || !dep.project_id) continue;
    if (visited.has(dep.project_id)) continue;

    try {
      const subRes = await installModrinthMod({
        projectId: dep.project_id,
        mcVersion,
        dataDir,
        profileId,
        onProgress,
        visited
      });
      if (subRes.installed && subRes.installed.length > 0) {
        dependenciesInstalled.push(...subRes.installed);
      }
      if (subRes.dependenciesInstalled && subRes.dependenciesInstalled.length > 0) {
        dependenciesInstalled.push(...subRes.dependenciesInstalled);
      }
    } catch {
      // Continue even if an optional/nested dependency fails lookup
    }
  }

  return { installed, dependenciesInstalled };
}

async function installPeakFpsPack({ mcVersion, dataDir, profileId, onProgress = null }) {
  const visited = new Set();
  const installed = [];
  const skipped = [];

  for (let i = 0; i < PEAK_FPS_PACK_IDS.length; i++) {
    const item = PEAK_FPS_PACK_IDS[i];
    if (onProgress) {
      onProgress({
        stage: 'mods',
        percent: Math.round((i / PEAK_FPS_PACK_IDS.length) * 100),
        message: `Instalowanie pakietu Peak FPS (${i + 1}/${PEAK_FPS_PACK_IDS.length}): ${item.label}...`
      });
    }
    try {
      const res = await installModrinthMod({
        projectId: item.id,
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
    installed,
    skipped,
    mods: listProfileMods(dataDir, profileId)
  };
}

module.exports = {
  MODRINTH_API_BASE,
  PEAK_FPS_PACK_IDS,
  getProfileModsDir,
  listProfileMods,
  toggleMod,
  deleteMod,
  importLocalMods,
  searchModrinth,
  installModrinthMod,
  installPeakFpsPack
};
