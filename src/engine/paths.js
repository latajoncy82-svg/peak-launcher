const fs = require('fs');
const os = require('os');
const path = require('path');

let electronApp = null;
try {
  electronApp = require('electron').app || null;
} catch {
  electronApp = null;
}

const USER_AGENT = 'PeakLauncher/1.2.0 (Windows x64)';

function ensureDir(dirPath) {
  if (!dirPath) return dirPath;
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getAppDataRoot() {
  if (electronApp && typeof electronApp.getPath === 'function') {
    try {
      return electronApp.getPath('appData');
    } catch {
      // Fallback below
    }
  }
  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

function getUserDataRoot() {
  if (process.env.PEAK_VERIFY_DIR) {
    return path.join(process.env.PEAK_VERIFY_DIR, 'user-data');
  }
  if (electronApp && typeof electronApp.getPath === 'function') {
    try {
      return electronApp.getPath('userData');
    } catch {
      // Fallback below
    }
  }
  return path.join(getAppDataRoot(), 'peak-launcher');
}

function getDefaultDataDir() {
  if (process.env.PEAK_DATA_DIR) {
    return path.resolve(process.env.PEAK_DATA_DIR);
  }
  if (process.env.PEAK_VERIFY_DIR) {
    return path.join(path.resolve(process.env.PEAK_VERIFY_DIR), 'peak-data');
  }
  return path.join(getAppDataRoot(), '.peak-launcher');
}

function sanitizeProfileId(id) {
  const cleaned = String(id || 'default')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\.\./g, '');
  return cleaned || 'profile';
}

function getPaths(dataDir) {
  const root = path.resolve(dataDir || getDefaultDataDir());
  return {
    root,
    versionsDir: path.join(root, 'versions'),
    librariesDir: path.join(root, 'libraries'),
    assetsDir: path.join(root, 'assets'),
    runtimesDir: path.join(root, 'runtimes'),
    instancesDir: path.join(root, 'instances'),
    cacheDir: path.join(root, 'cache'),
    tmpDir: path.join(root, 'tmp')
  };
}

function getProfileDirs(dataDir, profileId) {
  const paths = getPaths(dataDir);
  const safeId = sanitizeProfileId(profileId);
  const instanceDir = path.join(paths.instancesDir, safeId);
  return {
    instanceDir,
    modsDir: path.join(instanceDir, 'mods'),
    configDir: path.join(instanceDir, 'config'),
    savesDir: path.join(instanceDir, 'saves'),
    resourcepacksDir: path.join(instanceDir, 'resourcepacks'),
    shaderpacksDir: path.join(instanceDir, 'shaderpacks'),
    screenshotsDir: path.join(instanceDir, 'screenshots')
  };
}

function ensureDataTree(dataDir) {
  const paths = getPaths(dataDir);
  ensureDir(paths.root);
  ensureDir(paths.versionsDir);
  ensureDir(paths.librariesDir);
  ensureDir(paths.assetsDir);
  ensureDir(paths.runtimesDir);
  ensureDir(paths.instancesDir);
  ensureDir(paths.cacheDir);
  ensureDir(paths.tmpDir);
  return paths;
}

module.exports = {
  USER_AGENT,
  ensureDir,
  getAppDataRoot,
  getUserDataRoot,
  getDefaultDataDir,
  sanitizeProfileId,
  getPaths,
  getProfileDirs,
  ensureDataTree
};
