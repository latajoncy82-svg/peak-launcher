const fs = require('fs');
const path = require('path');
const { downloadFile, fetchJson } = require('./download');
const { ensureDir, getPaths } = require('./paths');

const MOJANG_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

let memoryManifest = null;
let memoryManifestTime = 0;

function estimateJavaMajor(versionId, releaseTime) {
  const id = String(versionId || '');
  // New Mojang year-based scheme (26.x+) uses Java 25
  if (/^(2[6-9]|[3-9]\d)\./.test(id)) {
    return 25;
  }
  const ts = Date.parse(releaseTime || '');
  if (!Number.isNaN(ts)) {
    if (ts >= Date.parse('2026-01-01T00:00:00Z')) return 25;
    if (ts >= Date.parse('2024-04-20T00:00:00Z')) return 21;
    if (ts >= Date.parse('2021-06-01T00:00:00Z')) return 17;
  }
  const match = id.match(/^1\.(\d+)(?:\.(\d+))?/);
  if (match) {
    const minor = Number(match[1]);
    const patch = Number(match[2] || 0);
    if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
    if (minor >= 17) return 17;
  }
  return 8;
}

function listInstalledVersions(dataDir) {
  const { versionsDir } = getPaths(dataDir);
  if (!fs.existsSync(versionsDir)) return new Set();
  const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
  const installed = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const jsonFile = path.join(versionsDir, entry.name, `${entry.name}.json`);
    if (fs.existsSync(jsonFile)) {
      installed.add(entry.name);
    }
  }
  return installed;
}

async function getManifest(dataDir, forceRefresh = false) {
  const { cacheDir } = getPaths(dataDir);
  ensureDir(cacheDir);
  const cacheFile = path.join(cacheDir, 'version_manifest_v2.json');

  const now = Date.now();
  let rawManifest = null;

  if (!forceRefresh && memoryManifest && now - memoryManifestTime < 10 * 60 * 1000) {
    rawManifest = memoryManifest;
  } else {
    try {
      rawManifest = await fetchJson(MOJANG_MANIFEST_URL);
      memoryManifest = rawManifest;
      memoryManifestTime = now;
      fs.writeFileSync(cacheFile, JSON.stringify(rawManifest), 'utf8');
    } catch (err) {
      if (fs.existsSync(cacheFile)) {
        rawManifest = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } else {
        throw err;
      }
    }
  }

  const installedSet = listInstalledVersions(dataDir);
  const versions = (rawManifest.versions || []).map((v) => ({
    id: v.id,
    type: v.type,
    url: v.url,
    time: v.time,
    releaseTime: v.releaseTime,
    sha1: v.sha1,
    installed: installedSet.has(v.id),
    recommendedJava: estimateJavaMajor(v.id, v.releaseTime)
  }));

  return {
    latest: rawManifest.latest || { release: versions[0]?.id || '', snapshot: versions[0]?.id || '' },
    versions
  };
}

function readLocalVersionJson(versionId, dataDir) {
  const { versionsDir } = getPaths(dataDir);
  const jsonPath = path.join(versionsDir, versionId, `${versionId}.json`);
  if (!fs.existsSync(jsonPath)) return null;
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

async function ensureVersionJson(versionId, dataDir) {
  const { versionsDir } = getPaths(dataDir);
  const versionDir = path.join(versionsDir, versionId);
  const jsonPath = path.join(versionDir, `${versionId}.json`);

  const manifest = await getManifest(dataDir, false);
  const entry = manifest.versions.find((v) => v.id === versionId);

  if (!entry) {
    const existing = readLocalVersionJson(versionId, dataDir);
    if (existing) return existing;
    throw new Error(`Nie znaleziono wersji Minecraft "${versionId}" w manifeście Mojang.`);
  }

  ensureDir(versionDir);
  await downloadFile(entry.url, jsonPath, {
    expectedHash: entry.sha1 || null,
    hashAlgo: 'sha1'
  });

  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

module.exports = {
  MOJANG_MANIFEST_URL,
  estimateJavaMajor,
  listInstalledVersions,
  getManifest,
  readLocalVersionJson,
  ensureVersionJson
};
