const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  ensureDir,
  getDefaultDataDir,
  getUserDataRoot,
  sanitizeProfileId
} = require('./engine/paths');

function computeOfflineUuid(username) {
  const name = String(username || 'PeakPlayer').trim() || 'PeakPlayer';
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function getSystemMemoryInfo() {
  const totalMb = Math.round(os.totalmem() / (1024 * 1024));
  const freeMb = Math.round(os.freemem() / (1024 * 1024));
  const maxSafeMb = Math.max(1024, Math.floor((totalMb * 0.75) / 256) * 256);
  const recommendedMb = Math.max(1024, Math.min(4096, Math.floor((totalMb * 0.5) / 512) * 512 || 2048));
  return { totalMb, freeMb, maxSafeMb, recommendedMb };
}

function createDefaultConfig() {
  const { recommendedMb } = getSystemMemoryInfo();
  const defaultAccountId = 'acc-peak-player';
  const now = new Date().toISOString();

  return {
    version: 1,
    theme: 'alpine-dark',
    dataDir: getDefaultDataDir(),
    activeAccountId: defaultAccountId,
    accounts: [
      {
        id: defaultAccountId,
        username: 'PeakPlayer',
        uuid: computeOfflineUuid('PeakPlayer'),
        type: 'offline',
        createdAt: now
      }
    ],
    activeProfileId: 'peak-fabric-latest',
    profiles: [
      {
        id: 'peak-fabric-latest',
        name: 'Szczyt Fabric (Najnowszy)',
        mcVersion: '26.3',
        loader: 'fabric',
        fabricVersion: 'latest',
        icon: 'summit',
        ramMb: null,
        createdAt: now,
        lastPlayedAt: null
      },
      {
        id: 'peak-fabric-1214',
        name: 'Alpejski Modpack 1.21.4',
        mcVersion: '1.21.4',
        loader: 'fabric',
        fabricVersion: 'latest',
        icon: 'glacier',
        ramMb: null,
        createdAt: now,
        lastPlayedAt: null
      },
      {
        id: 'peak-vanilla-latest',
        name: 'Czysty Szczyt (Vanilla)',
        mcVersion: '26.3',
        loader: 'vanilla',
        fabricVersion: null,
        icon: 'ridge',
        ramMb: null,
        createdAt: now,
        lastPlayedAt: null
      }
    ],
    settings: {
      ramMb: recommendedMb,
      width: 1280,
      height: 720,
      customResolution: false,
      jvmArgs: '',
      autoInstallJava: true,
      autoInstallFabric: true,
      closeOnLaunch: false
    }
  };
}

class Store {
  constructor(customConfigPath) {
    this.configPath = customConfigPath || path.join(getUserDataRoot(), 'config.json');
    this.data = this._load();
  }

  _load() {
    const defaults = createDefaultConfig();
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(raw);
        const merged = {
          ...defaults,
          ...parsed,
          settings: { ...defaults.settings, ...(parsed.settings || {}) }
        };
        if (!Array.isArray(merged.accounts) || merged.accounts.length === 0) {
          merged.accounts = defaults.accounts;
          merged.activeAccountId = defaults.activeAccountId;
        }
        if (!Array.isArray(merged.profiles) || merged.profiles.length === 0) {
          merged.profiles = defaults.profiles;
          merged.activeProfileId = defaults.activeProfileId;
        }
        if (!merged.accounts.some((a) => a.id === merged.activeAccountId)) {
          merged.activeAccountId = merged.accounts[0].id;
        }
        if (!merged.profiles.some((p) => p.id === merged.activeProfileId)) {
          merged.activeProfileId = merged.profiles[0].id;
        }
        return merged;
      }
    } catch {
      // Fall back to fresh defaults on corrupted JSON
    }
    this._saveData(defaults);
    return defaults;
  }

  _saveData(dataObj) {
    ensureDir(path.dirname(this.configPath));
    const tmpPath = `${this.configPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(dataObj, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.configPath);
  }

  save() {
    this._saveData(this.data);
  }

  getState() {
    return JSON.parse(JSON.stringify(this.data));
  }

  getDataDir() {
    return this.data.dataDir || getDefaultDataDir();
  }

  setTheme(theme) {
    this.data.theme = theme === 'alpine-light' ? 'alpine-light' : 'alpine-dark';
    this.save();
    return this.data.theme;
  }

  updateSettings(patch) {
    const { maxSafeMb } = getSystemMemoryInfo();
    const next = { ...this.data.settings, ...(patch || {}) };
    if (next.ramMb !== undefined) {
      next.ramMb = Math.max(512, Math.min(maxSafeMb, Number(next.ramMb) || 2048));
    }
    if (next.width !== undefined) {
      next.width = Math.max(640, Math.min(3840, Number(next.width) || 1280));
    }
    if (next.height !== undefined) {
      next.height = Math.max(480, Math.min(2160, Number(next.height) || 720));
    }
    if (patch && typeof patch.dataDir === 'string' && patch.dataDir.trim()) {
      this.data.dataDir = path.resolve(patch.dataDir.trim());
    }
    this.data.settings = next;
    this.save();
    return this.getState();
  }

  getActiveAccount() {
    return (
      this.data.accounts.find((a) => a.id === this.data.activeAccountId) ||
      this.data.accounts[0]
    );
  }

  saveAccount({ id, username }) {
    const cleanName = String(username || '')
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 16);
    if (cleanName.length < 3) {
      throw new Error('Nick musi mieć od 3 do 16 znaków (litery, cyfry lub _).');
    }

    const uuid = computeOfflineUuid(cleanName);
    if (id) {
      const existing = this.data.accounts.find((a) => a.id === id);
      if (existing) {
        existing.username = cleanName;
        existing.uuid = uuid;
        this.data.activeAccountId = existing.id;
        this.save();
        return existing;
      }
    }

    const byName = this.data.accounts.find(
      (a) => a.username.toLowerCase() === cleanName.toLowerCase()
    );
    if (byName) {
      this.data.activeAccountId = byName.id;
      this.save();
      return byName;
    }

    const account = {
      id: `acc-${crypto.randomBytes(4).toString('hex')}`,
      username: cleanName,
      uuid,
      type: 'offline',
      createdAt: new Date().toISOString()
    };
    this.data.accounts.push(account);
    this.data.activeAccountId = account.id;
    this.save();
    return account;
  }

  selectAccount(accountId) {
    if (!this.data.accounts.some((a) => a.id === accountId)) {
      throw new Error('Nie znaleziono wybranego konta.');
    }
    this.data.activeAccountId = accountId;
    this.save();
    return this.getActiveAccount();
  }

  deleteAccount(accountId) {
    if (this.data.accounts.length <= 1) {
      throw new Error('Musi pozostać co najmniej jeden profil gracza.');
    }
    this.data.accounts = this.data.accounts.filter((a) => a.id !== accountId);
    if (this.data.activeAccountId === accountId) {
      this.data.activeAccountId = this.data.accounts[0].id;
    }
    this.save();
    return this.getState();
  }

  getActiveProfile() {
    return (
      this.data.profiles.find((p) => p.id === this.data.activeProfileId) ||
      this.data.profiles[0]
    );
  }

  getProfile(profileId) {
    return this.data.profiles.find((p) => p.id === profileId) || null;
  }

  createProfile({ name, mcVersion, loader = 'fabric', fabricVersion = 'latest', icon = 'summit', ramMb = null }) {
    const cleanName = String(name || '').trim() || `Minecraft ${mcVersion}`;
    const cleanMc = String(mcVersion || '').trim();
    if (!cleanMc) {
      throw new Error('Wybierz wersję Minecraft dla profilu.');
    }

    const baseId = sanitizeProfileId(cleanName.toLowerCase().replace(/\s+/g, '-'));
    let uniqueId = baseId;
    let counter = 2;
    while (this.data.profiles.some((p) => p.id === uniqueId)) {
      uniqueId = `${baseId}-${counter++}`;
    }

    const profile = {
      id: uniqueId,
      name: cleanName,
      mcVersion: cleanMc,
      loader: loader === 'fabric' ? 'fabric' : 'vanilla',
      fabricVersion: loader === 'fabric' ? fabricVersion || 'latest' : null,
      icon: icon || 'summit',
      ramMb: ramMb ? Number(ramMb) : null,
      createdAt: new Date().toISOString(),
      lastPlayedAt: null
    };

    this.data.profiles.unshift(profile);
    this.data.activeProfileId = profile.id;
    this.save();
    return profile;
  }

  updateProfile(profileId, patch) {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error('Nie znaleziono profilu.');
    }
    if (typeof patch.name === 'string' && patch.name.trim()) {
      profile.name = patch.name.trim();
    }
    if (typeof patch.mcVersion === 'string' && patch.mcVersion.trim()) {
      profile.mcVersion = patch.mcVersion.trim();
    }
    if (patch.loader === 'fabric' || patch.loader === 'vanilla') {
      profile.loader = patch.loader;
      profile.fabricVersion =
        patch.loader === 'fabric' ? patch.fabricVersion || profile.fabricVersion || 'latest' : null;
    } else if (patch.fabricVersion !== undefined && profile.loader === 'fabric') {
      profile.fabricVersion = patch.fabricVersion || 'latest';
    }
    if (patch.icon !== undefined) {
      profile.icon = patch.icon || 'summit';
    }
    if (patch.ramMb !== undefined) {
      profile.ramMb = patch.ramMb ? Number(patch.ramMb) : null;
    }
    if (patch.lastPlayedAt !== undefined) {
      profile.lastPlayedAt = patch.lastPlayedAt;
    }
    this.save();
    return profile;
  }

  selectProfile(profileId) {
    if (!this.getProfile(profileId)) {
      throw new Error('Nie znaleziono wybranego profilu.');
    }
    this.data.activeProfileId = profileId;
    this.save();
    return this.getActiveProfile();
  }

  deleteProfile(profileId) {
    if (this.data.profiles.length <= 1) {
      throw new Error('Musi istnieć przynajmniej jeden profil.');
    }
    this.data.profiles = this.data.profiles.filter((p) => p.id !== profileId);
    if (this.data.activeProfileId === profileId) {
      this.data.activeProfileId = this.data.profiles[0].id;
    }
    this.save();
    return this.getState();
  }
}

module.exports = {
  Store,
  computeOfflineUuid,
  getSystemMemoryInfo,
  createDefaultConfig
};
