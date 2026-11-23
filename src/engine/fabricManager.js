const fs = require('fs');
const path = require('path');
const { downloadBatch, fetchJson } = require('./download');
const { ensureDir, getPaths } = require('./paths');

const FABRIC_META_BASE = 'https://meta.fabricmc.net/v2';

let cachedGames = null;
let cachedGamesTime = 0;

function mavenNameToRelativePath(mavenName) {
  const parts = String(mavenName || '').split(':');
  if (parts.length < 3) {
    throw new Error(`Nieprawidłowa nazwa biblioteki Maven: ${mavenName}`);
  }
  const [group, artifact, version, classifier] = parts;
  const groupPath = group.split('.').join('/');
  const suffix = classifier ? `-${classifier}` : '';
  return `${groupPath}/${artifact}/${version}/${artifact}-${version}${suffix}.jar`;
}

async function getFabricSupportedVersions(dataDir, forceRefresh = false) {
  const { cacheDir } = getPaths(dataDir);
  ensureDir(cacheDir);
  const cacheFile = path.join(cacheDir, 'fabric-game-versions.json');
  const now = Date.now();

  if (!forceRefresh && cachedGames && now - cachedGamesTime < 15 * 60 * 1000) {
    return cachedGames;
  }

  try {
    const list = await fetchJson(`${FABRIC_META_BASE}/versions/game`);
    cachedGames = list;
    cachedGamesTime = now;
    fs.writeFileSync(cacheFile, JSON.stringify(list), 'utf8');
    return list;
  } catch (err) {
    if (fs.existsSync(cacheFile)) {
      cachedGames = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return cachedGames;
    }
    throw err;
  }
}

async function getFabricLoadersForMc(mcVersion) {
  const url = `${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(mcVersion)}`;
  const rows = await fetchJson(url);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    version: row.loader?.version || '',
    stable: Boolean(row.loader?.stable),
    build: row.loader?.build || 0
  })).filter((r) => r.version);
}

function findInstalledFabricForMc(mcVersion, preferredLoader, dataDir) {
  const installed = listInstalledFabric(dataDir).filter((item) => item.inheritsFrom === mcVersion);
  if (installed.length === 0) return null;
  if (preferredLoader && preferredLoader !== 'latest') {
    const exact = installed.find((item) => item.loaderVersion === preferredLoader);
    if (exact) return exact;
  }
  return installed[0];
}

function listInstalledFabric(dataDir) {
  const { versionsDir } = getPaths(dataDir);
  if (!fs.existsSync(versionsDir)) return [];

  const results = [];
  for (const entry of fs.readdirSync(versionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('fabric-loader-')) continue;
    const jsonPath = path.join(versionsDir, entry.name, `${entry.name}.json`);
    if (!fs.existsSync(jsonPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const prefix = 'fabric-loader-';
      const suffix = parsed.inheritsFrom ? `-${parsed.inheritsFrom}` : '';
      let loaderVersion = entry.name;
      if (entry.name.startsWith(prefix) && suffix && entry.name.endsWith(suffix)) {
        loaderVersion = entry.name.slice(prefix.length, entry.name.length - suffix.length);
      }
      results.push({
        id: parsed.id || entry.name,
        inheritsFrom: parsed.inheritsFrom || '',
        loaderVersion,
        jsonPath,
        releaseTime: parsed.releaseTime || ''
      });
    } catch {
      // Skip malformed json
    }
  }
  return results;
}

async function installFabric(mcVersion, loaderVersion = 'latest', dataDir, onProgress = null) {
  if (!mcVersion) {
    throw new Error('Podaj wersję Minecraft do instalacji Fabric.');
  }

  if (onProgress) {
    onProgress({
      stage: 'fabric',
      percent: 10,
      message: `Sprawdzanie Fabric Loadera dla Minecraft ${mcVersion}...`
    });
  }

  let resolvedLoader = loaderVersion;
  if (!resolvedLoader || resolvedLoader === 'latest') {
    const loaders = await getFabricLoadersForMc(mcVersion);
    if (loaders.length === 0) {
      throw new Error(`Wersja Minecraft ${mcVersion} nie jest jeszcze obsługiwana przez Fabric.`);
    }
    const stable = loaders.find((l) => l.stable);
    resolvedLoader = (stable || loaders[0]).version;
  }

  const profileUrl = `${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(resolvedLoader)}/profile/json`;
  const profileJson = await fetchJson(profileUrl);

  const { versionsDir, librariesDir } = getPaths(dataDir);
  const versionId = profileJson.id || `fabric-loader-${resolvedLoader}-${mcVersion}`;
  const versionDir = path.join(versionsDir, versionId);
  ensureDir(versionDir);

  const jsonPath = path.join(versionDir, `${versionId}.json`);
  const tmpJsonPath = `${jsonPath}.tmp`;

  const libraries = Array.isArray(profileJson.libraries) ? profileJson.libraries : [];
  const tasks = libraries.map((lib) => {
    const relPath = mavenNameToRelativePath(lib.name);
    const baseUrl = (lib.url || 'https://maven.fabricmc.net/').replace(/\/+$/, '');
    return {
      url: `${baseUrl}/${relPath}`,
      destPath: path.join(librariesDir, relPath.split('/').join(path.sep)),
      expectedHash: lib.sha1 || null,
      hashAlgo: 'sha1'
    };
  });

  if (tasks.length > 0) {
    await downloadBatch(tasks, {
      concurrency: 8,
      onProgress: ({ completed, total, currentFile }) => {
        const pct = 20 + Math.round((completed / total) * 80);
        if (onProgress) {
          onProgress({
            stage: 'fabric',
            percent: pct,
            message: `Pobieranie bibliotek Fabric (${completed}/${total}): ${currentFile}`
          });
        }
      }
    });
  }

  fs.writeFileSync(tmpJsonPath, JSON.stringify(profileJson, null, 2), 'utf8');
  fs.renameSync(tmpJsonPath, jsonPath);

  if (onProgress) {
    onProgress({
      stage: 'fabric',
      percent: 100,
      message: `Zainstalowano Fabric ${resolvedLoader} dla Minecraft ${mcVersion}.`
    });
  }

  return {
    id: versionId,
    mcVersion,
    loaderVersion: resolvedLoader,
    jsonPath,
    profileJson
  };
}

module.exports = {
  FABRIC_META_BASE,
  mavenNameToRelativePath,
  getFabricSupportedVersions,
  getFabricLoadersForMc,
  findInstalledFabricForMc,
  listInstalledFabric,
  installFabric
};
