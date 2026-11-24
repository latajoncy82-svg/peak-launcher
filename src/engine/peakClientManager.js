const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ensureDir, getProfileDirs } = require('./paths');

const MANAGED_MOD_FILENAME = 'peak-client-managed.jar';
const PACK_FILENAME = 'Peak-Alpine-UI.zip';
const PACK_SOURCE_NAME = 'peak-ui-pack.zip';
const PACK_OPTION_ENTRY = `file/${PACK_FILENAME}`;

function resolveBundledAssetPath(filename) {
  const clean = path.basename(String(filename || ''));
  if (!clean) return null;
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', clean));
    candidates.push(path.join(process.resourcesPath, 'assets', clean));
  }
  candidates.push(path.resolve(__dirname, '../../assets', clean));
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isPackSupportedVersion(mcVersion) {
  const s = String(mcVersion || '').trim();
  if (!s) return false;
  // Year-based releases (26.x+)
  if (/^(2[6-9]|[3-9]\d)\.\d+/.test(s)) return true;
  // Modern 1.20+ releases
  const minorMatch = s.match(/^1\.(\d+)(?:\.(\d+))?/);
  if (minorMatch && Number(minorMatch[1]) >= 20) return true;
  // Snapshots 23w+
  const snapMatch = s.match(/^(\d{2})w\d{2}/);
  if (snapMatch && Number(snapMatch[1]) >= 23) return true;
  return false;
}

function getPeakClientSupport(profile = {}) {
  const mcVersion = String(profile.mcVersion || '').trim();
  const loader = String(profile.loader || 'vanilla').toLowerCase();
  const packSupported = isPackSupportedVersion(mcVersion);

  let modAssetName = null;
  if (loader === 'fabric') {
    if (/^26\.3(\.|$)/.test(mcVersion)) {
      modAssetName = 'peak-client-mc26.jar';
    } else if (/^1\.21\.4$/.test(mcVersion)) {
      modAssetName = 'peak-client-mc1214.jar';
    }
  }

  return {
    mcVersion,
    loader,
    modSupported: Boolean(modAssetName),
    modAssetName,
    packSupported
  };
}

function filesAreIdentical(srcPath, destPath) {
  try {
    const sStat = fs.statSync(srcPath);
    const dStat = fs.statSync(destPath);
    if (sStat.size !== dStat.size) return false;
    const h1 = crypto.createHash('sha256').update(fs.readFileSync(srcPath)).digest('hex');
    const h2 = crypto.createHash('sha256').update(fs.readFileSync(destPath)).digest('hex');
    return h1 === h2;
  } catch {
    return false;
  }
}

function removeFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {}
  return false;
}

function parseOptionsResourcePacks(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v)).filter(Boolean);
    }
  } catch {}
  return trimmed
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^"+|"+$/g, ''))
    .filter(Boolean);
}

function syncOptionsResourcePack(optionsPath, enable, isFabric) {
  const hasFile = fs.existsSync(optionsPath);
  if (!hasFile && !enable) return false;

  const lines = hasFile ? fs.readFileSync(optionsPath, 'utf8').split(/\r?\n/) : [];
  let foundPacksLine = false;
  let foundIncompatibleLine = false;
  let changed = false;

  const updatedLines = lines.map((line) => {
    if (line.startsWith('resourcePacks:')) {
      foundPacksLine = true;
      const list = parseOptionsResourcePacks(line.slice('resourcePacks:'.length));
      if (!list.includes('vanilla')) list.unshift('vanilla');
      if (isFabric && !list.includes('fabric')) list.splice(1, 0, 'fabric');

      const nextList = enable
        ? list.includes(PACK_OPTION_ENTRY)
          ? list
          : [...list, PACK_OPTION_ENTRY]
        : list.filter((entry) => entry !== PACK_OPTION_ENTRY);

      const serialized = `resourcePacks:${JSON.stringify(nextList)}`;
      if (serialized !== line) changed = true;
      return serialized;
    }
    if (line.startsWith('incompatibleResourcePacks:')) {
      foundIncompatibleLine = true;
      const list = parseOptionsResourcePacks(line.slice('incompatibleResourcePacks:'.length));
      const nextList = list.filter((entry) => entry !== PACK_OPTION_ENTRY);
      const serialized = `incompatibleResourcePacks:${JSON.stringify(nextList)}`;
      if (serialized !== line) changed = true;
      return serialized;
    }
    return line;
  });

  if (!foundPacksLine && enable) {
    const initial = isFabric ? ['vanilla', 'fabric', PACK_OPTION_ENTRY] : ['vanilla', PACK_OPTION_ENTRY];
    updatedLines.push(`resourcePacks:${JSON.stringify(initial)}`);
    changed = true;
  }
  if (!foundIncompatibleLine && enable) {
    updatedLines.push('incompatibleResourcePacks:[]');
    changed = true;
  }

  if (changed || !hasFile) {
    ensureDir(path.dirname(optionsPath));
    const cleaned = updatedLines.filter((l, idx) => idx < updatedLines.length - 1 || l !== '').join('\n') + '\n';
    fs.writeFileSync(optionsPath, cleaned, 'utf8');
  }
  return changed || !hasFile;
}

function syncPeakClientConfigFile(configPath, { language = 'pl', settings = {} }) {
  ensureDir(path.dirname(configPath));
  const desired = {
    language: language === 'en' ? 'en' : 'pl',
    accentColor: /^#[0-9a-fA-F]{6}$/.test(String(settings.peakAccentColor || ''))
      ? String(settings.peakAccentColor).toUpperCase()
      : '#38BDF8',
    betterF3Enabled: settings.peakBetterF3 !== false,
    peakMainMenu: settings.peakMainMenu !== false,
    peakButtonStyle: settings.peakDarkButtons !== false,
    peakLoadingScreen: settings.peakMainMenu !== false
  };

  let existing = {};
  const exists = fs.existsSync(configPath);
  if (exists) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf8')) || {};
    } catch {
      existing = {};
    }
  }

  const prevSync = existing._launcherSync && typeof existing._launcherSync === 'object' ? existing._launcherSync : null;
  const merged = { ...existing };

  for (const [key, val] of Object.entries(desired)) {
    if (!exists || merged[key] === undefined) {
      merged[key] = val;
    } else if (!prevSync || prevSync[key] !== val) {
      // Launcher preference changed since last sync -> apply to in-game config cleanly
      merged[key] = val;
    }
  }
  merged._launcherSync = desired;

  const jsonOut = JSON.stringify(merged, null, 2);
  if (!exists || fs.readFileSync(configPath, 'utf8') !== jsonOut) {
    fs.writeFileSync(configPath, jsonOut, 'utf8');
    return true;
  }
  return false;
}

function syncPeakClientForProfile({ profile, settings = {}, language = 'pl', dataDir, onLog = null }) {
  const log = (level, text) => {
    if (typeof onLog === 'function') onLog({ level, text, ts: new Date().toISOString() });
  };

  const dirs = getProfileDirs(dataDir, profile.id);
  const support = getPeakClientSupport(profile);
  const wantMod = settings.peakClientEnabled !== false && support.modSupported;
  const wantPack = settings.peakResourcePack !== false && support.packSupported;

  let modInstalled = false;
  let packInstalled = false;
  let configSynced = false;

  const managedModPath = path.join(dirs.modsDir, MANAGED_MOD_FILENAME);
  const disabledManagedModPath = path.join(dirs.modsDir, `${MANAGED_MOD_FILENAME}.disabled`);

  if (wantMod) {
    const srcMod = resolveBundledAssetPath(support.modAssetName);
    if (srcMod) {
      ensureDir(dirs.modsDir);
      removeFileIfExists(disabledManagedModPath);
      if (!filesAreIdentical(srcMod, managedModPath)) {
        fs.copyFileSync(srcMod, managedModPath);
      }
      modInstalled = true;
      configSynced = syncPeakClientConfigFile(path.join(dirs.configDir, 'peak-client.json'), {
        language,
        settings
      });
      log(
        'SYSTEM',
        `Aktywowano Peak Client (${support.modAssetName}) — Lepsze F3, HUD, Menu Peak oraz Peak GUI pod klawiszem RShift.`
      );
    }
  } else {
    const removedA = removeFileIfExists(managedModPath);
    const removedB = removeFileIfExists(disabledManagedModPath);
    if ((removedA || removedB) && settings.peakClientEnabled === false) {
      log('SYSTEM', 'Peak Client w grze jest wyłączony w ustawieniach launchera.');
    }
  }

  const destPackPath = path.join(dirs.resourcepacksDir, PACK_FILENAME);
  const optionsPath = path.join(dirs.instanceDir, 'options.txt');
  if (wantPack) {
    const srcPack = resolveBundledAssetPath(PACK_SOURCE_NAME);
    if (srcPack) {
      ensureDir(dirs.resourcepacksDir);
      if (!filesAreIdentical(srcPack, destPackPath)) {
        fs.copyFileSync(srcPack, destPackPath);
      }
      syncOptionsResourcePack(optionsPath, true, support.loader === 'fabric');
      packInstalled = true;
      if (!modInstalled) {
        log('SYSTEM', 'Aktywowano paczkę Peak Alpine UI (ciemny alpejski motyw, panorama i przyciski).');
      }
    }
  } else {
    removeFileIfExists(destPackPath);
    syncOptionsResourcePack(optionsPath, false, support.loader === 'fabric');
  }

  return {
    modInstalled,
    modAssetName: modInstalled ? support.modAssetName : null,
    packInstalled,
    configSynced,
    support
  };
}

module.exports = {
  MANAGED_MOD_FILENAME,
  PACK_FILENAME,
  PACK_OPTION_ENTRY,
  resolveBundledAssetPath,
  isPackSupportedVersion,
  getPeakClientSupport,
  syncOptionsResourcePack,
  syncPeakClientConfigFile,
  syncPeakClientForProfile
};
