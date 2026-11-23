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

const SUPPORTED_LANGUAGES = ['pl', 'en', 'de', 'es', 'fr', 'uk'];

function sanitizePeakSlug(input) {
  const ascii = String(input || '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const slug = ascii
    .replace(/\.peak$/i, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
  return slug || 'szczyt';
}

function createDefaultConfig() {
  const { recommendedMb } = getSystemMemoryInfo();
  const defaultAccountId = 'acc-peak-player';
  const now = new Date().toISOString();

  return {
    version: 1,
    theme: 'alpine-dark',
    language: 'pl',
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
    activeServerId: 'srv-szczyt',
    peakOwnerId: crypto.randomBytes(8).toString('hex'),
    peakRoutes: [],
    servers: [
      {
        id: 'srv-szczyt',
        name: 'Szczyt Survival',
        slug: 'szczyt',
        peakDomain: 'szczyt.peak',
        mcVersion: '1.21.4',
        loader: 'fabric',
        fabricVersion: 'latest',
        port: 25565,
        ramMb: Math.max(1536, Math.min(4096, recommendedMb)),
        maxPlayers: 10,
        gamemode: 'survival',
        difficulty: 'normal',
        onlineMode: false,
        pvp: true,
        whitelist: false,
        commandBlocks: false,
        viewDistance: 10,
        motd: '§b§lPEAK§r §7· §fszczyt.peak',
        seed: '',
        eulaAccepted: false,
        createdAt: now,
        lastStartedAt: null
      }
    ],
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
        if (!Array.isArray(merged.servers) || merged.servers.length === 0) {
          merged.servers = defaults.servers;
          merged.activeServerId = defaults.activeServerId;
        }
        if (!merged.servers.some((s) => s.id === merged.activeServerId)) {
          merged.activeServerId = merged.servers[0].id;
        }
        if (!Array.isArray(merged.peakRoutes)) {
          merged.peakRoutes = [];
        }
        if (!merged.peakOwnerId) {
          merged.peakOwnerId = defaults.peakOwnerId;
          this._saveData(merged);
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

  setLanguage(lang) {
    const clean = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'pl';
    this.data.language = clean;
    this.save();
    return clean;
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
    const now = new Date().toISOString();
    if (id) {
      const existing = this.data.accounts.find((a) => a.id === id);
      if (existing) {
        if (existing.type === 'microsoft') {
          throw new Error('Nick konta Premium Microsoft jest zarządzany na minecraft.net.');
        }
        const conflict = this.data.accounts.find(
          (a) => a.id !== id && a.username.toLowerCase() === cleanName.toLowerCase()
        );
        if (conflict) {
          throw new Error(`Konto o nicku "${cleanName}" już istnieje.`);
        }
        existing.username = cleanName;
        existing.uuid = uuid;
        existing.lastUsedAt = now;
        this.data.activeAccountId = existing.id;
        this.save();
        return existing;
      }
    }

    const byName = this.data.accounts.find(
      (a) => a.type !== 'microsoft' && a.username.toLowerCase() === cleanName.toLowerCase()
    );
    if (byName) {
      byName.lastUsedAt = now;
      this.data.activeAccountId = byName.id;
      this.save();
      return byName;
    }

    const account = {
      id: `acc-${crypto.randomBytes(4).toString('hex')}`,
      username: cleanName,
      uuid,
      type: 'offline',
      createdAt: now,
      lastUsedAt: now
    };
    this.data.accounts.push(account);
    this.data.activeAccountId = account.id;
    this.save();
    return account;
  }

  saveMicrosoftAccount({
    uuid,
    username,
    xuid = '',
    mcAccessTokenEnc = '',
    msRefreshTokenEnc = '',
    mcTokenExpiresAt = null,
    skinFile = null,
    skinModel = 'classic',
    skinSource = null
  }) {
    const cleanUuid = String(uuid || '').trim().toLowerCase();
    const cleanName = String(username || '').trim();
    if (!cleanUuid || !cleanName) {
      throw new Error('Nieprawidłowe dane konta Premium Microsoft.');
    }

    const now = new Date().toISOString();
    const existing = this.data.accounts.find(
      (a) => a.type === 'microsoft' && String(a.uuid || '').toLowerCase() === cleanUuid
    );

    if (existing) {
      existing.username = cleanName;
      existing.uuid = cleanUuid;
      existing.xuid = String(xuid || existing.xuid || '');
      if (mcAccessTokenEnc) existing.mcAccessTokenEnc = mcAccessTokenEnc;
      if (msRefreshTokenEnc) existing.msRefreshTokenEnc = msRefreshTokenEnc;
      if (mcTokenExpiresAt !== null && mcTokenExpiresAt !== undefined) {
        existing.mcTokenExpiresAt = mcTokenExpiresAt;
      }
      if (skinFile !== null && skinFile !== undefined) existing.skinFile = skinFile;
      if (skinModel) existing.skinModel = skinModel === 'slim' ? 'slim' : 'classic';
      if (skinSource !== null && skinSource !== undefined) existing.skinSource = skinSource;
      existing.lastUsedAt = now;
      this.data.activeAccountId = existing.id;
      this.save();
      return existing;
    }

    let accId = `acc-ms-${cleanUuid.replace(/-/g, '').slice(0, 8)}`;
    while (this.data.accounts.some((a) => a.id === accId)) {
      accId = `acc-ms-${crypto.randomBytes(4).toString('hex')}`;
    }

    const account = {
      id: accId,
      username: cleanName,
      uuid: cleanUuid,
      type: 'microsoft',
      xuid: String(xuid || ''),
      mcAccessTokenEnc: String(mcAccessTokenEnc || ''),
      msRefreshTokenEnc: String(msRefreshTokenEnc || ''),
      mcTokenExpiresAt: mcTokenExpiresAt || null,
      skinFile: skinFile || null,
      skinModel: skinModel === 'slim' ? 'slim' : 'classic',
      skinSource: skinSource || null,
      createdAt: now,
      lastUsedAt: now
    };
    this.data.accounts.push(account);
    this.data.activeAccountId = account.id;
    this.save();
    return account;
  }

  updateMicrosoftTokens(accountId, patch = {}) {
    const acc = this.data.accounts.find((a) => a.id === accountId && a.type === 'microsoft');
    if (!acc) {
      throw new Error('Nie znaleziono konta Premium Microsoft.');
    }
    if (patch.username) acc.username = String(patch.username).trim();
    if (patch.xuid !== undefined) acc.xuid = String(patch.xuid || '');
    if (patch.mcAccessTokenEnc) acc.mcAccessTokenEnc = patch.mcAccessTokenEnc;
    if (patch.msRefreshTokenEnc) acc.msRefreshTokenEnc = patch.msRefreshTokenEnc;
    if (patch.mcTokenExpiresAt !== undefined) acc.mcTokenExpiresAt = patch.mcTokenExpiresAt;
    acc.lastUsedAt = new Date().toISOString();
    this.save();
    return acc;
  }

  selectAccount(accountId) {
    const acc = this.data.accounts.find((a) => a.id === accountId);
    if (!acc) {
      throw new Error('Nie znaleziono wybranego konta.');
    }
    this.data.activeAccountId = acc.id;
    acc.lastUsedAt = new Date().toISOString();
    this.save();
    return acc;
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

  updateAccountSkin(accountId, { skinFile, skinModel, skinSource } = {}) {
    const acc = this.data.accounts.find((a) => a.id === accountId);
    if (!acc) {
      throw new Error('Nie znaleziono wybranego konta.');
    }
    if (skinFile !== undefined) {
      acc.skinFile = skinFile || null;
    }
    if (skinModel !== undefined) {
      acc.skinModel = skinModel === 'slim' ? 'slim' : 'classic';
    }
    if (skinSource !== undefined) {
      acc.skinSource = skinSource || null;
    }
    this.save();
    return acc;
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

  listServers() {
    return this.data.servers || [];
  }

  getServer(serverId) {
    return (this.data.servers || []).find((s) => s.id === serverId) || null;
  }

  getActiveServer() {
    const list = this.data.servers || [];
    return list.find((s) => s.id === this.data.activeServerId) || list[0] || null;
  }

  _resolveUniqueServerSlug(rawSlug, excludeId = null) {
    const base = sanitizePeakSlug(rawSlug);
    const taken = new Set(
      (this.data.servers || [])
        .filter((s) => s.id !== excludeId)
        .map((s) => String(s.slug || '').toLowerCase())
    );
    if (!taken.has(base)) return base;
    let counter = 2;
    while (taken.has(`${base.slice(0, 20)}-${counter}`)) {
      counter++;
    }
    return `${base.slice(0, 20)}-${counter}`;
  }

  _resolveAvailablePort(requestedPort, excludeId = null) {
    const taken = new Set(
      (this.data.servers || [])
        .filter((s) => s.id !== excludeId)
        .map((s) => Number(s.port))
    );
    let port = Math.max(1024, Math.min(65535, Number(requestedPort) || 25565));
    while (taken.has(port) && port < 65535) {
      port++;
    }
    if (taken.has(port)) {
      port = 25565;
      while (taken.has(port) && port < 65535) port++;
    }
    return port;
  }

  createServer(payload = {}) {
    if (!Array.isArray(this.data.servers)) this.data.servers = [];
    const { recommendedMb } = getSystemMemoryInfo();
    const cleanName = String(payload.name || '').trim() || `Serwer ${payload.mcVersion || '1.21.4'}`;
    const cleanMc = String(payload.mcVersion || '1.21.4').trim() || '1.21.4';
    const loader = payload.loader === 'vanilla' ? 'vanilla' : 'fabric';
    const slug = this._resolveUniqueServerSlug(payload.slug || cleanName);
    const baseId = `srv-${slug}`;
    let uniqueId = baseId;
    let counter = 2;
    while (this.data.servers.some((s) => s.id === uniqueId)) {
      uniqueId = `${baseId}-${counter++}`;
    }

    const { maxSafeMb } = getSystemMemoryInfo();
    const ramMb = Math.max(
      1024,
      Math.min(maxSafeMb, Number(payload.ramMb) || Math.max(1536, Math.min(4096, recommendedMb)))
    );
    const port = this._resolveAvailablePort(payload.port || 25565);
    const peakDomain = `${slug}.peak`;

    const server = {
      id: uniqueId,
      name: cleanName,
      slug,
      peakDomain,
      mcVersion: cleanMc,
      loader,
      fabricVersion: loader === 'fabric' ? payload.fabricVersion || 'latest' : null,
      port,
      ramMb,
      maxPlayers: Math.max(1, Math.min(100, Number(payload.maxPlayers) || 10)),
      gamemode: ['survival', 'creative', 'adventure', 'spectator'].includes(payload.gamemode)
        ? payload.gamemode
        : 'survival',
      difficulty: ['peaceful', 'easy', 'normal', 'hard'].includes(payload.difficulty)
        ? payload.difficulty
        : 'normal',
      onlineMode: Boolean(payload.onlineMode),
      pvp: payload.pvp !== undefined ? Boolean(payload.pvp) : true,
      whitelist: Boolean(payload.whitelist),
      commandBlocks: Boolean(payload.commandBlocks),
      viewDistance: Math.max(4, Math.min(32, Number(payload.viewDistance) || 10)),
      motd: String(payload.motd || `§b§lPEAK§r §7· §f${peakDomain}`).trim() || `§b§lPEAK§r §7· §f${peakDomain}`,
      seed: String(payload.seed || '').trim(),
      eulaAccepted: Boolean(payload.eulaAccepted),
      createdAt: new Date().toISOString(),
      lastStartedAt: null
    };

    this.data.servers.unshift(server);
    this.data.activeServerId = server.id;
    this.save();
    return server;
  }

  updateServer(serverId, patch = {}) {
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error('Nie znaleziono wybranego serwera .peak.');
    }

    if (typeof patch.name === 'string' && patch.name.trim()) {
      server.name = patch.name.trim();
    }
    if (patch.slug !== undefined) {
      const oldDomain = server.peakDomain;
      const nextSlug = this._resolveUniqueServerSlug(patch.slug, server.id);
      server.slug = nextSlug;
      server.peakDomain = `${nextSlug}.peak`;
      if (patch.motd === undefined && server.motd && server.motd.includes(oldDomain)) {
        server.motd = server.motd.replace(oldDomain, server.peakDomain);
      }
    }
    if (typeof patch.mcVersion === 'string' && patch.mcVersion.trim()) {
      server.mcVersion = patch.mcVersion.trim();
    }
    if (patch.loader === 'fabric' || patch.loader === 'vanilla') {
      server.loader = patch.loader;
      server.fabricVersion =
        patch.loader === 'fabric' ? patch.fabricVersion || server.fabricVersion || 'latest' : null;
    } else if (patch.fabricVersion !== undefined && server.loader === 'fabric') {
      server.fabricVersion = patch.fabricVersion || 'latest';
    }
    if (patch.port !== undefined) {
      const requested = Math.max(1024, Math.min(65535, Number(patch.port) || 25565));
      const conflict = (this.data.servers || []).find(
        (s) => s.id !== server.id && Number(s.port) === requested
      );
      if (conflict) {
        throw new Error(`Port ${requested} jest już używany przez serwer "${conflict.name}".`);
      }
      server.port = requested;
    }
    if (patch.ramMb !== undefined) {
      const { maxSafeMb } = getSystemMemoryInfo();
      server.ramMb = Math.max(1024, Math.min(maxSafeMb, Number(patch.ramMb) || 2048));
    }
    if (patch.maxPlayers !== undefined) {
      server.maxPlayers = Math.max(1, Math.min(100, Number(patch.maxPlayers) || 10));
    }
    if (['survival', 'creative', 'adventure', 'spectator'].includes(patch.gamemode)) {
      server.gamemode = patch.gamemode;
    }
    if (['peaceful', 'easy', 'normal', 'hard'].includes(patch.difficulty)) {
      server.difficulty = patch.difficulty;
    }
    if (patch.onlineMode !== undefined) server.onlineMode = Boolean(patch.onlineMode);
    if (patch.pvp !== undefined) server.pvp = Boolean(patch.pvp);
    if (patch.whitelist !== undefined) server.whitelist = Boolean(patch.whitelist);
    if (patch.commandBlocks !== undefined) server.commandBlocks = Boolean(patch.commandBlocks);
    if (patch.viewDistance !== undefined) {
      server.viewDistance = Math.max(4, Math.min(32, Number(patch.viewDistance) || 10));
    }
    if (patch.motd !== undefined) {
      server.motd = String(patch.motd || '').trim() || `§b§lPEAK§r §7· §f${server.peakDomain}`;
    }
    if (patch.seed !== undefined) server.seed = String(patch.seed || '').trim();
    if (patch.eulaAccepted !== undefined) server.eulaAccepted = Boolean(patch.eulaAccepted);
    if (patch.lastStartedAt !== undefined) server.lastStartedAt = patch.lastStartedAt;

    this.save();
    return server;
  }

  selectServer(serverId) {
    if (!this.getServer(serverId)) {
      throw new Error('Nie znaleziono wybranego serwera .peak.');
    }
    this.data.activeServerId = serverId;
    this.save();
    return this.getActiveServer();
  }

  deleteServer(serverId) {
    if ((this.data.servers || []).length <= 1) {
      throw new Error('Musi pozostać przynajmniej jeden serwer .peak.');
    }
    this.data.servers = this.data.servers.filter((s) => s.id !== serverId);
    if (this.data.activeServerId === serverId) {
      this.data.activeServerId = this.data.servers[0].id;
    }
    this.save();
    return this.getState();
  }

  listPeakRoutes() {
    return Array.isArray(this.data.peakRoutes) ? this.data.peakRoutes : [];
  }

  getPeakOwnerId() {
    if (!this.data.peakOwnerId) {
      this.data.peakOwnerId = crypto.randomBytes(8).toString('hex');
      this.save();
    }
    return this.data.peakOwnerId;
  }

  savePeakRoute(payload = {}) {
    if (!Array.isArray(this.data.peakRoutes)) this.data.peakRoutes = [];

    const rawDomain = String(payload.domain || payload.peakDomain || '').trim().toLowerCase().replace(/\.+$/, '');
    const stripped = rawDomain.endsWith('.peak') ? rawDomain.slice(0, -5) : rawDomain;
    const slug = sanitizePeakSlug(stripped);
    const domain = `${slug}.peak`;

    let host = String(payload.targetHost || '').trim();
    let port = Number(payload.targetPort) || 25565;
    if (host.includes(':') && !host.startsWith('[')) {
      const idx = host.lastIndexOf(':');
      const maybePort = Number(host.slice(idx + 1));
      if (maybePort >= 1 && maybePort <= 65535) {
        port = maybePort;
        host = host.slice(0, idx).trim();
      }
    }
    if (!host) {
      throw new Error('Podaj docelowy adres IP lub hosta (np. 192.168.1.44:25565 lub tunnel.pinggy.link:12345).');
    }
    port = Math.max(1, Math.min(65535, Math.round(port)));

    const cleanName = String(payload.name || '').trim() || domain;
    const entry = {
      domain,
      slug,
      name: cleanName,
      targetHost: host,
      targetPort: port,
      updatedAt: new Date().toISOString()
    };

    const existingIdx = this.data.peakRoutes.findIndex(
      (r) => String(r.domain || '').toLowerCase() === domain
    );
    if (existingIdx >= 0) {
      this.data.peakRoutes[existingIdx] = { ...this.data.peakRoutes[existingIdx], ...entry };
    } else {
      this.data.peakRoutes.push(entry);
    }

    this.save();
    return entry;
  }

  deletePeakRoute(domain) {
    if (!Array.isArray(this.data.peakRoutes)) this.data.peakRoutes = [];
    const target = String(domain || '').trim().toLowerCase().replace(/\.+$/, '');
    this.data.peakRoutes = this.data.peakRoutes.filter(
      (r) => String(r.domain || '').toLowerCase() !== target
    );
    this.save();
    return this.listPeakRoutes();
  }
}

module.exports = {
  Store,
  SUPPORTED_LANGUAGES,
  sanitizePeakSlug,
  computeOfflineUuid,
  getSystemMemoryInfo,
  createDefaultConfig
};
