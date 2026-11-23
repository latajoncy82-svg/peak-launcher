const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');

const { Store, getSystemMemoryInfo } = require('./store');
const { ensureDataTree, ensureDir, getPaths, getProfileDirs, getServerDirs } = require('./engine/paths');
const { getManifest, ensureVersionJson, listInstalledVersions, estimateJavaMajor } = require('./engine/versions');
const { upsertServerEntry } = require('./engine/nbtServers');
const { lookupPublicPeakDomain } = require('./engine/peakDirectory');
const { peakRouter } = require('./engine/peakRouter');
const {
  MANAGED_MAJORS,
  detectInstalledJavas,
  getAdoptiumReleaseInfo,
  installJava,
  removeManagedJava
} = require('./engine/javaManager');
const {
  getFabricSupportedVersions,
  getFabricLoadersForMc,
  installFabric,
  listInstalledFabric
} = require('./engine/fabricManager');
const {
  getContentDir,
  getProfileModsDir,
  listModsInDirectory,
  listProfileContent,
  listProfileMods,
  toggleModInDirectory,
  toggleContent,
  toggleMod,
  deleteModInDirectory,
  deleteContent,
  deleteMod,
  importLocalModsToDirectory,
  importLocalContent,
  importLocalMods,
  searchModrinth,
  getModrinthProjectDetails,
  installModrinthModToDirectory,
  installModrinthContent,
  installServerPackToDirectory,
  installCuratedPack,
  installPeakFpsPack,
  copyProfileModsToServerDir,
  syncServerModsToProfile,
  checkAndUpdateProfileMods
} = require('./engine/modsManager');
const {
  getLocalLanIp,
  writeServerProperties,
  writeEulaFile,
  startServer,
  stopServer,
  restartServer,
  sendServerCommand,
  getServerRuntimeStatus,
  getAllServerStatuses,
  getServerLogs,
  startPublicTunnel,
  stopPublicTunnel,
  stopAllServers,
  buildPeakInvitePayload,
  parsePeakInviteFile
} = require('./engine/serverManager');
const {
  getLaunchStatus,
  launchProfile,
  stopGame
} = require('./engine/launcher');
const {
  setAccountSkinFromFile,
  setAccountSkinFromUsername,
  setAccountSkinFromPreset,
  setAccountSkinFromLibrary,
  clearAccountSkin,
  getAccountSkinInfo,
  listSkinCatalog
} = require('./engine/skinManager');

const APP_ID = 'com.peaklauncher.app';
const ROOT_DIR = path.resolve(__dirname, '..');
const ICON_ICO_PATH = path.join(ROOT_DIR, 'assets', 'icon.ico');
const CAPTURE_MODE = process.argv.includes('--capture-screenshots');

function getRuntimeIconPath() {
  if (app.isPackaged) {
    const unpackedIco = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'icon.ico');
    if (fs.existsSync(unpackedIco)) return unpackedIco;
    return process.execPath;
  }
  return ICON_ICO_PATH;
}

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

if (process.env.PEAK_VERIFY_DIR) {
  app.setPath('userData', path.join(process.env.PEAK_VERIFY_DIR, 'user-data'));
}

let mainWindow = null;
let store = null;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
}

function handleIpc(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const data = await handler(event, ...args);
      return { __peakEnvelope: true, ok: true, data };
    } catch (err) {
      return {
        __peakEnvelope: true,
        ok: false,
        error: err && err.message ? err.message : String(err)
      };
    }
  });
}

function syncPeakRouterRoutes() {
  if (!store) return;
  const localServers = store.listServers() || [];
  const takenDomains = new Set();
  const routes = [];

  for (const s of localServers) {
    const rt = getServerRuntimeStatus(s.id);
    const domain = String(s.peakDomain || '').toLowerCase();
    if (domain) takenDomains.add(domain);
    routes.push({
      domain,
      name: s.name || domain,
      serverId: s.id,
      targetHost: '127.0.0.1',
      targetPort: Number(rt.bindPort || s.port) || 25565,
      running: rt.state === 'online',
      starting: rt.state === 'preparing' || rt.state === 'starting',
      mcVersion: s.mcVersion,
      maxPlayers: Number(s.maxPlayers) || 10,
      isExternal: false,
      isDefault: Number(s.port) === 25565 && rt.state === 'online'
    });
  }

  for (const r of store.listPeakRoutes() || []) {
    const domain = String(r.domain || '').toLowerCase();
    if (!domain || takenDomains.has(domain)) continue;
    routes.push({
      domain,
      name: r.name || domain,
      targetHost: r.targetHost,
      targetPort: Number(r.targetPort) || 25565,
      running: true,
      starting: false,
      maxPlayers: 20,
      isExternal: true,
      isDefault: false
    });
  }

  peakRouter.setRoutes(routes);
}

function buildStatePayload() {
  const state = store.getState();
  const dataDir = store.getDataDir();
  const accounts = (state.accounts || []).map((acc) => {
    const skin = getAccountSkinInfo(dataDir, acc);
    return {
      ...acc,
      skinModel: skin.skinModel,
      skinSource: skin.skinSource,
      hasCustomSkin: skin.hasCustomSkin,
      skinDataUrl: skin.skinDataUrl
    };
  });
  return {
    ...state,
    accounts,
    dataDir,
    systemMemory: getSystemMemoryInfo(),
    launchStatus: getLaunchStatus(),
    serverStatuses: getAllServerStatuses(),
    peakRoutes: store.listPeakRoutes(),
    peakRouterStatus: peakRouter.getStatus(),
    lanIp: getLocalLanIp(),
    installedVersions: Array.from(listInstalledVersions(dataDir)),
    installedFabric: listInstalledFabric(dataDir)
  };
}

function registerIpcHandlers() {
  // Window controls
  handleIpc('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  handleIpc('window:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  handleIpc('window:close', () => {
    if (mainWindow) mainWindow.close();
  });
  handleIpc('window:isMaximized', () => Boolean(mainWindow && mainWindow.isMaximized()));

  // State, settings, theme, language, accounts
  handleIpc('state:get', () => buildStatePayload());
  handleIpc('theme:set', (_e, theme) => store.setTheme(theme));
  handleIpc('language:set', (_e, lang) => store.setLanguage(lang));
  handleIpc('settings:update', (_e, patch) => {
    store.updateSettings(patch);
    ensureDataTree(store.getDataDir());
    return buildStatePayload();
  });
  handleIpc('account:save', (_e, payload) => {
    const account = store.saveAccount(payload || {});
    return { account, state: buildStatePayload() };
  });
  handleIpc('account:select', (_e, accountId) => {
    const account = store.selectAccount(accountId);
    return { account, state: buildStatePayload() };
  });
  handleIpc('account:delete', (_e, accountId) => {
    store.deleteAccount(accountId);
    clearAccountSkin({ dataDir: store.getDataDir(), accountId });
    return buildStatePayload();
  });

  // Skins Studio
  const resolveTargetAccount = (accountId) =>
    (accountId ? store.getState().accounts.find((a) => a.id === accountId) : null) ||
    store.getActiveAccount();

  handleIpc('skins:list', () => listSkinCatalog(store.getDataDir()));
  handleIpc('skins:pickAndUpload', async (_e, { accountId, model = 'classic' } = {}) => {
    const acc = resolveTargetAccount(accountId);
    if (!acc) throw new Error('Nie znaleziono konta.');
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz plik skina Minecraft (.png)',
      filters: [{ name: 'Skin Minecraft PNG', extensions: ['png'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths[0]) {
      return { canceled: true };
    }
    const dataDir = store.getDataDir();
    const res = setAccountSkinFromFile({
      dataDir,
      accountId: acc.id,
      filePath: filePaths[0],
      model
    });
    store.updateAccountSkin(acc.id, res);
    return { canceled: false, skin: res, catalog: listSkinCatalog(dataDir), state: buildStatePayload() };
  });
  handleIpc('skins:uploadPath', (_e, { accountId, filePath, model = 'classic' } = {}) => {
    const acc = resolveTargetAccount(accountId);
    if (!acc) throw new Error('Nie znaleziono konta.');
    const dataDir = store.getDataDir();
    const res = setAccountSkinFromFile({
      dataDir,
      accountId: acc.id,
      filePath,
      model
    });
    store.updateAccountSkin(acc.id, res);
    return { skin: res, catalog: listSkinCatalog(dataDir), state: buildStatePayload() };
  });
  handleIpc('skins:fetchByNick', async (_e, { accountId, username, model = 'classic' } = {}) => {
    const acc = resolveTargetAccount(accountId);
    if (!acc) throw new Error('Nie znaleziono konta.');
    const dataDir = store.getDataDir();
    const res = await setAccountSkinFromUsername({
      dataDir,
      accountId: acc.id,
      username,
      model
    });
    store.updateAccountSkin(acc.id, res);
    return { skin: res, catalog: listSkinCatalog(dataDir), state: buildStatePayload() };
  });
  handleIpc('skins:applyPreset', (_e, { accountId, presetId } = {}) => {
    const acc = resolveTargetAccount(accountId);
    if (!acc) throw new Error('Nie znaleziono konta.');
    const dataDir = store.getDataDir();
    const res = setAccountSkinFromPreset({
      dataDir,
      accountId: acc.id,
      presetId
    });
    store.updateAccountSkin(acc.id, res);
    return { skin: res, catalog: listSkinCatalog(dataDir), state: buildStatePayload() };
  });
  handleIpc('skins:applyLibrary', (_e, { accountId, hash } = {}) => {
    const acc = resolveTargetAccount(accountId);
    if (!acc) throw new Error('Nie znaleziono konta.');
    const dataDir = store.getDataDir();
    const res = setAccountSkinFromLibrary({
      dataDir,
      accountId: acc.id,
      hash
    });
    store.updateAccountSkin(acc.id, res);
    return { skin: res, catalog: listSkinCatalog(dataDir), state: buildStatePayload() };
  });
  handleIpc('skins:setModel', (_e, { accountId, model } = {}) => {
    const acc = resolveTargetAccount(accountId);
    if (!acc) throw new Error('Nie znaleziono konta.');
    store.updateAccountSkin(acc.id, { skinModel: model === 'slim' ? 'slim' : 'classic' });
    return { state: buildStatePayload() };
  });
  handleIpc('skins:reset', (_e, { accountId } = {}) => {
    const acc = resolveTargetAccount(accountId);
    if (!acc) throw new Error('Nie znaleziono konta.');
    const dataDir = store.getDataDir();
    const res = clearAccountSkin({ dataDir, accountId: acc.id });
    store.updateAccountSkin(acc.id, res);
    return { catalog: listSkinCatalog(dataDir), state: buildStatePayload() };
  });

  // Profiles
  handleIpc('profile:create', (_e, payload) => {
    const profile = store.createProfile(payload || {});
    getProfileModsDir(store.getDataDir(), profile.id);
    return { profile, state: buildStatePayload() };
  });
  handleIpc('profile:update', (_e, profileId, patch) => {
    const profile = store.updateProfile(profileId, patch || {});
    return { profile, state: buildStatePayload() };
  });
  handleIpc('profile:select', (_e, profileId) => {
    const profile = store.selectProfile(profileId);
    return { profile, state: buildStatePayload() };
  });
  handleIpc('profile:delete', (_e, profileId) => {
    store.deleteProfile(profileId);
    return buildStatePayload();
  });
  handleIpc('profile:enableFabric', async (_e, profileId, fabricVersion = 'latest') => {
    const profile = store.getProfile(profileId);
    if (!profile) throw new Error('Nie znaleziono profilu.');
    const dataDir = store.getDataDir();
    const res = await installFabric(profile.mcVersion, fabricVersion || 'latest', dataDir, (p) =>
      sendToRenderer('fabric:progress', p)
    );
    const updated = store.updateProfile(profileId, {
      loader: 'fabric',
      fabricVersion: res.loaderVersion
    });
    return { profile: updated, installed: res, state: buildStatePayload() };
  });
  handleIpc('profile:openFolder', async (_e, profileId) => {
    const dirs = getProfileDirs(store.getDataDir(), profileId);
    ensureDir(dirs.instanceDir);
    await shell.openPath(dirs.instanceDir);
    return dirs.instanceDir;
  });

  // Versions
  handleIpc('versions:manifest', (_e, forceRefresh) =>
    getManifest(store.getDataDir(), Boolean(forceRefresh))
  );
  handleIpc('versions:installOnly', async (_e, versionId) => {
    const dataDir = store.getDataDir();
    const vj = await ensureVersionJson(versionId, dataDir);
    return { id: vj.id, state: buildStatePayload() };
  });

  // Java
  handleIpc('java:detect', () => detectInstalledJavas(store.getDataDir()));
  handleIpc('java:adoptiumInfo', async (_e, major) => {
    if (major) return getAdoptiumReleaseInfo(major);
    const entries = await Promise.all(
      MANAGED_MAJORS.map(async (m) => {
        try {
          return await getAdoptiumReleaseInfo(m);
        } catch (err) {
          return { major: m, error: err.message };
        }
      })
    );
    return entries;
  });
  handleIpc('java:install', async (_e, major) => {
    const res = await installJava(major, store.getDataDir(), (p) =>
      sendToRenderer('java:progress', p)
    );
    const detected = await detectInstalledJavas(store.getDataDir());
    return { installed: res, detected };
  });
  handleIpc('java:remove', async (_e, major) => {
    const removed = removeManagedJava(major, store.getDataDir());
    const detected = await detectInstalledJavas(store.getDataDir());
    return { removed, detected };
  });

  // Fabric
  handleIpc('fabric:versions', (_e, forceRefresh) =>
    getFabricSupportedVersions(store.getDataDir(), Boolean(forceRefresh))
  );
  handleIpc('fabric:loaders', (_e, mcVersion) => getFabricLoadersForMc(mcVersion));
  handleIpc('fabric:install', async (_e, mcVersion, loaderVersion) => {
    const res = await installFabric(mcVersion, loaderVersion, store.getDataDir(), (p) =>
      sendToRenderer('fabric:progress', p)
    );
    return {
      installed: res,
      allInstalled: listInstalledFabric(store.getDataDir()),
      state: buildStatePayload()
    };
  });
  handleIpc('fabric:listInstalled', () => listInstalledFabric(store.getDataDir()));

  // Mods & Content (Mods / Shaders / Resource Packs)
  handleIpc('mods:list', (_e, profileId) =>
    listProfileMods(store.getDataDir(), profileId || store.getActiveProfile().id)
  );
  handleIpc('mods:listContent', (_e, profileId, projectType = 'mod') =>
    listProfileContent(store.getDataDir(), profileId || store.getActiveProfile().id, projectType)
  );
  handleIpc('mods:toggle', (_e, profileId, fileName, enabled) =>
    toggleMod(store.getDataDir(), profileId || store.getActiveProfile().id, fileName, enabled)
  );
  handleIpc('mods:toggleContent', (_e, profileId, fileName, enabled, projectType = 'mod') =>
    toggleContent(
      store.getDataDir(),
      profileId || store.getActiveProfile().id,
      fileName,
      enabled,
      projectType
    )
  );
  handleIpc('mods:delete', (_e, profileId, fileName) =>
    deleteMod(store.getDataDir(), profileId || store.getActiveProfile().id, fileName)
  );
  handleIpc('mods:deleteContent', (_e, profileId, fileName, projectType = 'mod') =>
    deleteContent(store.getDataDir(), profileId || store.getActiveProfile().id, fileName, projectType)
  );
  handleIpc('mods:pickAndImport', async (_e, profileId) => {
    const targetId = profileId || store.getActiveProfile().id;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz pliki modów (.jar)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Mody Minecraft (.jar)', extensions: ['jar'] }]
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true, imported: [], mods: listProfileMods(store.getDataDir(), targetId) };
    }
    return {
      canceled: false,
      ...importLocalMods(store.getDataDir(), targetId, filePaths)
    };
  });
  handleIpc('mods:pickAndImportContent', async (_e, profileId, projectType = 'mod') => {
    const targetId = profileId || store.getActiveProfile().id;
    const extensions = projectType === 'mod' ? ['jar'] : ['zip', 'jar'];
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Pliki pakietów / modów', extensions }]
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return {
        canceled: true,
        imported: [],
        mods: listProfileContent(store.getDataDir(), targetId, projectType)
      };
    }
    return {
      canceled: false,
      ...importLocalContent(store.getDataDir(), targetId, filePaths, projectType)
    };
  });
  handleIpc('mods:importPaths', (_e, profileId, filePaths) => {
    const targetId = profileId || store.getActiveProfile().id;
    return importLocalMods(store.getDataDir(), targetId, filePaths);
  });
  handleIpc('mods:importContentPaths', (_e, profileId, filePaths, projectType = 'mod') => {
    const targetId = profileId || store.getActiveProfile().id;
    return importLocalContent(store.getDataDir(), targetId, filePaths, projectType);
  });
  handleIpc('mods:search', (_e, params) => searchModrinth(params || {}));
  handleIpc('mods:details', (_e, params) => {
    const { projectId, mcVersion, projectType = 'mod' } = params || {};
    const targetProfile = store.getActiveProfile();
    return getModrinthProjectDetails(
      projectId,
      mcVersion || targetProfile?.mcVersion || '',
      projectType
    );
  });
  handleIpc('mods:installModrinth', async (_e, params) => {
    const {
      projectId,
      versionId = null,
      projectType = 'mod',
      mcVersion,
      profileId,
      projectMeta
    } = params || {};
    const targetProfile = profileId ? store.getProfile(profileId) : store.getActiveProfile();
    const targetMc = mcVersion || targetProfile.mcVersion;
    const res = await installModrinthContent({
      projectId,
      versionId,
      projectType,
      mcVersion: targetMc,
      dataDir: store.getDataDir(),
      profileId: targetProfile.id,
      projectMeta,
      onProgress: (p) => sendToRenderer('mods:progress', p)
    });
    return {
      ...res,
      mods: listProfileContent(store.getDataDir(), targetProfile.id, projectType)
    };
  });
  handleIpc('mods:installPeakFpsPack', async (_e, profileId) => {
    const targetProfile = profileId ? store.getProfile(profileId) : store.getActiveProfile();
    return installPeakFpsPack({
      mcVersion: targetProfile.mcVersion,
      dataDir: store.getDataDir(),
      profileId: targetProfile.id,
      onProgress: (p) => sendToRenderer('mods:progress', p)
    });
  });
  handleIpc('mods:installPack', async (_e, profileId, packId = 'fps') => {
    const targetProfile = profileId ? store.getProfile(profileId) : store.getActiveProfile();
    return installCuratedPack({
      packId,
      mcVersion: targetProfile.mcVersion,
      dataDir: store.getDataDir(),
      profileId: targetProfile.id,
      onProgress: (p) => sendToRenderer('mods:progress', p)
    });
  });
  handleIpc('mods:checkUpdates', (_e, profileId) => {
    const targetProfile = profileId ? store.getProfile(profileId) : store.getActiveProfile();
    return checkAndUpdateProfileMods({
      mcVersion: targetProfile.mcVersion,
      dataDir: store.getDataDir(),
      profileId: targetProfile.id,
      applyUpdates: false
    });
  });
  handleIpc('mods:updateAll', (_e, profileId) => {
    const targetProfile = profileId ? store.getProfile(profileId) : store.getActiveProfile();
    return checkAndUpdateProfileMods({
      mcVersion: targetProfile.mcVersion,
      dataDir: store.getDataDir(),
      profileId: targetProfile.id,
      applyUpdates: true,
      onProgress: (p) => sendToRenderer('mods:progress', p)
    });
  });
  handleIpc('mods:openFolder', async (_e, profileId) => {
    const dir = getProfileModsDir(store.getDataDir(), profileId || store.getActiveProfile().id);
    await shell.openPath(dir);
    return dir;
  });
  handleIpc('mods:openContentFolder', async (_e, profileId, projectType = 'mod') => {
    const dir = getContentDir(
      store.getDataDir(),
      profileId || store.getActiveProfile().id,
      projectType
    );
    await shell.openPath(dir);
    return dir;
  });

  // Launcher
  handleIpc('launcher:launch', async (_e, profileId) => {
    const profile = profileId ? store.getProfile(profileId) : store.getActiveProfile();
    if (!profile) throw new Error('Nie znaleziono wybranego profilu.');
    const state = store.getState();
    const account = store.getActiveAccount();
    const dataDir = store.getDataDir();

    store.updateProfile(profile.id, { lastPlayedAt: new Date().toISOString() });

    const result = await launchProfile({
      profile,
      account,
      allAccounts: state.accounts,
      settings: state.settings,
      dataDir,
      onProgress: (p) => sendToRenderer('launcher:progress', p),
      onLog: (entry) => sendToRenderer('launcher:log', entry),
      onStatus: (status) => {
        sendToRenderer('launcher:status', status);
        if (status.state === 'idle' && state.settings.closeOnLaunch && mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
        }
      }
    });

    if (state.settings.closeOnLaunch && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }

    return { ...result, state: buildStatePayload() };
  });
  handleIpc('launcher:stop', () => stopGame());
  handleIpc('launcher:status', () => getLaunchStatus());

  // Hosting .peak (Self-hosted local Minecraft servers)
  const resolveServerTarget = (serverId) => {
    const srv = serverId ? store.getServer(serverId) : store.getActiveServer();
    if (!srv) throw new Error('Nie znaleziono wybranego serwera .peak.');
    return srv;
  };

  const syncServerConfigFiles = (server) => {
    const dirs = getServerDirs(store.getDataDir(), server.id);
    ensureDir(dirs.serverDir);
    ensureDir(dirs.modsDir);
    const rt = getServerRuntimeStatus(server.id);
    const propsOpts =
      rt.state !== 'offline' && rt.bindPort && rt.bindPort !== Number(server.port)
        ? { bindHost: '127.0.0.1', bindPort: rt.bindPort }
        : {};
    writeServerProperties(dirs.propertiesPath, server, propsOpts);
    writeEulaFile(dirs.eulaPath, Boolean(server.eulaAccepted));
    return dirs;
  };

  const findOrCreateMatchingClientProfile = ({ mcVersion, loader, fabricVersion, nameHint }) => {
    const state = store.getState();
    const existing = (state.profiles || []).find(
      (p) => p.mcVersion === mcVersion && p.loader === loader
    );
    if (existing) {
      store.selectProfile(existing.id);
      return existing;
    }
    return store.createProfile({
      name: nameHint || `${loader === 'fabric' ? 'Fabric' : 'Vanilla'} ${mcVersion}`,
      mcVersion,
      loader,
      fabricVersion: fabricVersion || 'latest',
      icon: 'summit'
    });
  };

  handleIpc('hosting:create', (_e, payload) => {
    const server = store.createServer(payload || {});
    syncServerConfigFiles(server);
    syncPeakRouterRoutes();
    return { server, state: buildStatePayload() };
  });

  handleIpc('hosting:update', (_e, { serverId, patch } = {}) => {
    const prev = resolveServerTarget(serverId);
    const server = store.updateServer(prev.id, patch || {});
    syncServerConfigFiles(server);
    syncPeakRouterRoutes();
    const runtimeStatus = getServerRuntimeStatus(server.id);
    return {
      server,
      restartRequired: runtimeStatus.state !== 'offline',
      state: buildStatePayload()
    };
  });

  handleIpc('hosting:select', (_e, serverId) => {
    const server = store.selectServer(serverId);
    return { server, state: buildStatePayload() };
  });

  handleIpc('hosting:delete', async (_e, payload) => {
    const serverId = typeof payload === 'string' ? payload : payload?.serverId;
    const deleteFiles = Boolean(typeof payload === 'object' && payload?.deleteFiles);
    const server = resolveServerTarget(serverId);
    const rt = getServerRuntimeStatus(server.id);
    if (rt.state !== 'offline') {
      await stopServer(server.id, {
        onStatus: (s) => {
          syncPeakRouterRoutes();
          sendToRenderer('hosting:status', s);
        },
        onLog: (entry) => sendToRenderer('hosting:log', entry)
      });
    }
    const nextState = store.deleteServer(server.id);
    if (deleteFiles) {
      const dirs = getServerDirs(store.getDataDir(), server.id);
      if (fs.existsSync(dirs.serverDir)) {
        fs.rmSync(dirs.serverDir, { recursive: true, force: true });
      }
    }
    syncPeakRouterRoutes();
    return buildStatePayload();
  });

  handleIpc('hosting:start', async (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    const state = store.getState();
    const dataDir = store.getDataDir();
    const updatedServer = store.updateServer(server.id, { lastStartedAt: new Date().toISOString() });
    const status = await startServer({
      server: updatedServer,
      settings: state.settings,
      dataDir,
      routerListeningOn25565: Boolean(peakRouter.getStatus().listening),
      onProgress: (p) => sendToRenderer('hosting:progress', p),
      onLog: (entry) => sendToRenderer('hosting:log', entry),
      onStatus: (s) => {
        syncPeakRouterRoutes();
        sendToRenderer('hosting:status', s);
      }
    });
    syncPeakRouterRoutes();
    return { status, state: buildStatePayload() };
  });

  handleIpc('hosting:stop', async (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    const status = await stopServer(server.id, {
      onStatus: (s) => {
        syncPeakRouterRoutes();
        sendToRenderer('hosting:status', s);
      },
      onLog: (entry) => sendToRenderer('hosting:log', entry)
    });
    syncPeakRouterRoutes();
    return status;
  });

  handleIpc('hosting:restart', async (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    const state = store.getState();
    const dataDir = store.getDataDir();
    const status = await restartServer({
      server,
      settings: state.settings,
      dataDir,
      routerListeningOn25565: Boolean(peakRouter.getStatus().listening),
      onProgress: (p) => sendToRenderer('hosting:progress', p),
      onLog: (entry) => sendToRenderer('hosting:log', entry),
      onStatus: (s) => {
        syncPeakRouterRoutes();
        sendToRenderer('hosting:status', s);
      }
    });
    syncPeakRouterRoutes();
    return { status, state: buildStatePayload() };
  });

  handleIpc('hosting:command', (_e, { serverId, command } = {}) => {
    const server = resolveServerTarget(serverId);
    return sendServerCommand(server.id, command, (entry) => sendToRenderer('hosting:log', entry));
  });

  handleIpc('hosting:status', (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    return getServerRuntimeStatus(server.id);
  });

  handleIpc('hosting:logs', (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    return getServerLogs(server.id);
  });

  handleIpc('hosting:startTunnel', async (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    return startPublicTunnel({
      server,
      ownerId: store.getPeakOwnerId(),
      routerPort: peakRouter.getStatus().port || 25565,
      onStatus: (s) => sendToRenderer('hosting:status', s),
      onLog: (entry) => sendToRenderer('hosting:log', entry),
      onTunnel: (t) => sendToRenderer('hosting:tunnel', t)
    });
  });

  handleIpc('hosting:stopTunnel', (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    return stopPublicTunnel(server.id, {
      onStatus: (s) => sendToRenderer('hosting:status', s),
      onLog: (entry) => sendToRenderer('hosting:log', entry)
    });
  });

  handleIpc('hosting:openFolder', async (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    const dirs = getServerDirs(store.getDataDir(), server.id);
    ensureDir(dirs.serverDir);
    await shell.openPath(dirs.serverDir);
    return dirs.serverDir;
  });

  handleIpc('hosting:openModsFolder', async (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    const dirs = getServerDirs(store.getDataDir(), server.id);
    ensureDir(dirs.modsDir);
    await shell.openPath(dirs.modsDir);
    return dirs.modsDir;
  });

  handleIpc('hosting:listMods', (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    const dirs = getServerDirs(store.getDataDir(), server.id);
    return listModsInDirectory(dirs.modsDir, dirs.modsMetaPath);
  });

  handleIpc('hosting:toggleMod', (_e, { serverId, fileName, enabled } = {}) => {
    const server = resolveServerTarget(serverId);
    const dirs = getServerDirs(store.getDataDir(), server.id);
    return toggleModInDirectory(dirs.modsDir, dirs.modsMetaPath, fileName, enabled);
  });

  handleIpc('hosting:deleteMod', (_e, { serverId, fileName } = {}) => {
    const server = resolveServerTarget(serverId);
    const dirs = getServerDirs(store.getDataDir(), server.id);
    return deleteModInDirectory(dirs.modsDir, dirs.modsMetaPath, fileName);
  });

  handleIpc('hosting:pickAndImportMods', async (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    const dirs = getServerDirs(store.getDataDir(), server.id);
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Dodaj mody serwerowe (.jar)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Mody Minecraft (.jar)', extensions: ['jar'] }]
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true, imported: [], mods: listModsInDirectory(dirs.modsDir, dirs.modsMetaPath) };
    }
    return {
      canceled: false,
      ...importLocalModsToDirectory(dirs.modsDir, dirs.modsMetaPath, filePaths)
    };
  });

  handleIpc('hosting:importModPaths', (_e, { serverId, filePaths } = {}) => {
    const server = resolveServerTarget(serverId);
    const dirs = getServerDirs(store.getDataDir(), server.id);
    return importLocalModsToDirectory(dirs.modsDir, dirs.modsMetaPath, filePaths);
  });

  handleIpc('hosting:searchModrinth', (_e, params) =>
    searchModrinth({ ...(params || {}), projectType: 'mod', serverCompatible: true })
  );

  handleIpc('hosting:installModrinthMod', async (_e, params) => {
    const { serverId, projectId, versionId = null, projectMeta = null } = params || {};
    const server = resolveServerTarget(serverId);
    const dirs = getServerDirs(store.getDataDir(), server.id);
    const res = await installModrinthModToDirectory({
      projectId,
      versionId,
      mcVersion: server.mcVersion,
      modsDir: dirs.modsDir,
      metaPath: dirs.modsMetaPath,
      projectMeta,
      onProgress: (p) => sendToRenderer('hosting:progress', { ...p, serverId: server.id })
    });
    return {
      ...res,
      mods: listModsInDirectory(dirs.modsDir, dirs.modsMetaPath)
    };
  });

  handleIpc('hosting:installServerPack', async (_e, { serverId, packId = 'server_perf' } = {}) => {
    const server = resolveServerTarget(serverId);
    const dirs = getServerDirs(store.getDataDir(), server.id);
    return installServerPackToDirectory({
      packId,
      mcVersion: server.mcVersion,
      modsDir: dirs.modsDir,
      metaPath: dirs.modsMetaPath,
      onProgress: (p) => sendToRenderer('hosting:progress', { ...p, serverId: server.id })
    });
  });

  handleIpc('hosting:copyFromProfile', (_e, { serverId, profileId } = {}) => {
    const server = resolveServerTarget(serverId);
    const dataDir = store.getDataDir();
    const dirs = getServerDirs(dataDir, server.id);
    const profile = profileId ? store.getProfile(profileId) : store.getActiveProfile();
    if (!profile) throw new Error('Nie znaleziono wybranego profilu.');
    return copyProfileModsToServerDir({
      dataDir,
      profileId: profile.id,
      serverModsDir: dirs.modsDir,
      serverMetaPath: dirs.modsMetaPath
    });
  });

  handleIpc('hosting:syncToProfile', (_e, { serverId, profileId } = {}) => {
    const server = resolveServerTarget(serverId);
    const dataDir = store.getDataDir();
    const dirs = getServerDirs(dataDir, server.id);
    const profile = profileId ? store.getProfile(profileId) : store.getActiveProfile();
    if (!profile) throw new Error('Nie znaleziono wybranego profilu.');
    return syncServerModsToProfile({
      dataDir,
      serverModsDir: dirs.modsDir,
      serverMetaPath: dirs.modsMetaPath,
      profileId: profile.id
    });
  });

  handleIpc('hosting:addToServersDat', (_e, { serverId, profileId, customAddress } = {}) => {
    const server = resolveServerTarget(serverId);
    const dataDir = store.getDataDir();
    const profile = profileId
      ? store.getProfile(profileId)
      : findOrCreateMatchingClientProfile({
          mcVersion: server.mcVersion,
          loader: server.loader,
          fabricVersion: server.fabricVersion,
          nameHint: `${server.name} (${server.peakDomain})`
        });
    if (!profile) throw new Error('Nie znaleziono profilu gry.');
    const profileDirs = getProfileDirs(dataDir, profile.id);
    const serversDatPath = path.join(profileDirs.instanceDir, 'servers.dat');
    const routerOn = Boolean(peakRouter.getStatus().listening);
    const ip = String(customAddress || (routerOn ? server.peakDomain : `127.0.0.1:${server.port}`)).trim();
    const entries = upsertServerEntry(serversDatPath, {
      name: `${server.name} (${server.peakDomain})`,
      ip,
      acceptTextures: 1
    });
    return { entries, serversDatPath, profileId: profile.id, state: buildStatePayload() };
  });

  handleIpc('hosting:joinServer', async (_e, { serverId, profileId } = {}) => {
    const server = resolveServerTarget(serverId);
    const state = store.getState();
    const dataDir = store.getDataDir();
    const profile = profileId
      ? store.getProfile(profileId)
      : findOrCreateMatchingClientProfile({
          mcVersion: server.mcVersion,
          loader: server.loader,
          fabricVersion: server.fabricVersion,
          nameHint: `${server.name} (${server.peakDomain})`
        });
    if (!profile) throw new Error('Nie znaleziono profilu gry.');

    const dirs = getServerDirs(dataDir, server.id);
    if (server.loader === 'fabric' && profile.loader === 'fabric') {
      const serverMods = listModsInDirectory(dirs.modsDir, dirs.modsMetaPath);
      if (serverMods.some((m) => m.enabled)) {
        syncServerModsToProfile({
          dataDir,
          serverModsDir: dirs.modsDir,
          serverMetaPath: dirs.modsMetaPath,
          profileId: profile.id
        });
      }
    }

    let profileJavaMajor = estimateJavaMajor(profile.mcVersion);
    try {
      const vjPath = path.join(getPaths(dataDir).versionsDir, profile.mcVersion, `${profile.mcVersion}.json`);
      if (fs.existsSync(vjPath)) {
        const vj = JSON.parse(fs.readFileSync(vjPath, 'utf8'));
        if (vj?.javaVersion?.majorVersion) profileJavaMajor = vj.javaVersion.majorVersion;
      }
    } catch {}

    const rt = getServerRuntimeStatus(server.id);
    const routerOn = Boolean(peakRouter.getStatus().listening);
    const targetAddr =
      routerOn && profileJavaMajor >= 18
        ? server.peakDomain
        : `127.0.0.1:${rt.bindPort || server.port}`;

    const profileDirs = getProfileDirs(dataDir, profile.id);
    const serversDatPath = path.join(profileDirs.instanceDir, 'servers.dat');
    upsertServerEntry(serversDatPath, {
      name: `${server.name} (${server.peakDomain})`,
      ip: targetAddr,
      acceptTextures: 1
    });

    store.selectProfile(profile.id);
    store.updateProfile(profile.id, { lastPlayedAt: new Date().toISOString() });
    const account = store.getActiveAccount();

    const result = await launchProfile({
      profile,
      account,
      allAccounts: state.accounts,
      settings: state.settings,
      dataDir,
      quickPlayServer: targetAddr,
      onProgress: (p) => sendToRenderer('launcher:progress', p),
      onLog: (entry) => sendToRenderer('launcher:log', entry),
      onStatus: (status) => {
        sendToRenderer('launcher:status', status);
        if (status.state === 'idle' && state.settings.closeOnLaunch && mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
        }
      }
    });

    if (state.settings.closeOnLaunch && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }

    return { ...result, profileId: profile.id, address: targetAddr, state: buildStatePayload() };
  });

  handleIpc('hosting:exportPeakFile', async (_e, serverId) => {
    const server = resolveServerTarget(serverId);
    const dataDir = store.getDataDir();
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: `Eksportuj zaproszenie ${server.peakDomain}`,
      defaultPath: `${server.slug || 'server'}.peak`,
      filters: [{ name: 'Peak Server Invite (.peak)', extensions: ['peak'] }]
    });
    if (canceled || !filePath) {
      return { canceled: true };
    }
    const payload = buildPeakInvitePayload({ server, dataDir });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { canceled: false, filePath, payload };
  });

  handleIpc('hosting:importPeakFile', async (_e, payload = {}) => {
    let chosenPath = payload?.filePath || '';
    if (!chosenPath) {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Importuj serwer znajomego (.peak)',
        properties: ['openFile'],
        filters: [{ name: 'Peak Server Invite (.peak)', extensions: ['peak'] }]
      });
      if (canceled || !filePaths || !filePaths[0]) {
        return { canceled: true };
      }
      chosenPath = filePaths[0];
    }

    const invite = parsePeakInviteFile(chosenPath);
    const dataDir = store.getDataDir();
    const profile = findOrCreateMatchingClientProfile({
      mcVersion: invite.mcVersion,
      loader: invite.loader,
      fabricVersion: invite.fabricVersion,
      nameHint: `${invite.serverName || invite.peakDomain} (${invite.mcVersion})`
    });

    const installedMods = [];
    const skippedMods = [];
    if (invite.loader === 'fabric' && Array.isArray(invite.mods)) {
      for (const mod of invite.mods) {
        if (!mod || !mod.projectId || mod.clientSide === 'unsupported') {
          if (mod?.title || mod?.fileName) skippedMods.push(mod.title || mod.fileName);
          continue;
        }
        try {
          await installModrinthContent({
            projectId: mod.projectId,
            versionId: mod.versionId || null,
            projectType: 'mod',
            mcVersion: invite.mcVersion,
            dataDir,
            profileId: profile.id,
            projectMeta: {
              projectId: mod.projectId,
              title: mod.title || mod.fileName || mod.projectId,
              clientSide: mod.clientSide || '',
              serverSide: mod.serverSide || ''
            },
            onProgress: (p) => sendToRenderer('hosting:progress', p)
          });
          installedMods.push(mod.title || mod.projectId);
        } catch {
          skippedMods.push(mod.title || mod.fileName || mod.projectId);
        }
      }
    }

    if (invite.peakDomain && invite.address) {
      let targetHost = String(invite.address).trim();
      let targetPort = Number(invite.port) || 25565;
      const colonIdx = targetHost.lastIndexOf(':');
      if (colonIdx > 0 && !targetHost.startsWith('[')) {
        const parsedPort = Number(targetHost.slice(colonIdx + 1));
        if (parsedPort >= 1 && parsedPort <= 65535) {
          targetPort = parsedPort;
          targetHost = targetHost.slice(0, colonIdx).trim();
        }
      }
      store.savePeakRoute({
        domain: invite.peakDomain,
        targetHost,
        targetPort,
        name: invite.serverName || invite.peakDomain
      });
      syncPeakRouterRoutes();
    }

    const profileDirs = getProfileDirs(dataDir, profile.id);
    const serversDatPath = path.join(profileDirs.instanceDir, 'servers.dat');
    const serverAddr =
      peakRouter.getStatus().listening && invite.peakDomain ? invite.peakDomain : invite.address;
    upsertServerEntry(serversDatPath, {
      name: `${invite.serverName || invite.peakDomain}`,
      ip: serverAddr,
      acceptTextures: 1
    });

    return {
      canceled: false,
      invite,
      profile,
      installedMods,
      skippedMods,
      state: buildStatePayload()
    };
  });

  handleIpc('hosting:savePeakRoute', (_e, payload) => {
    const route = store.savePeakRoute(payload || {});
    syncPeakRouterRoutes();
    return { route, state: buildStatePayload() };
  });

  handleIpc('hosting:deletePeakRoute', (_e, domain) => {
    store.deletePeakRoute(domain);
    syncPeakRouterRoutes();
    return buildStatePayload();
  });

  handleIpc('hosting:routerStatus', () => peakRouter.getStatus());

  // Utilities
  handleIpc('app:openExternal', (_e, url) => {
    if (/^https?:\/\//i.test(String(url || ''))) {
      return shell.openExternal(url);
    }
    return false;
  });
  handleIpc('app:openPath', (_e, targetPath) => {
    const resolved = targetPath || store.getDataDir();
    ensureDir(resolved);
    return shell.openPath(resolved);
  });
  handleIpc('app:pickDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Wybierz folder danych Peak Launcher',
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || !filePaths?.[0]) return null;
    return filePaths[0];
  });
}

async function runScreenshotCapture() {
  const outDir = path.join(ROOT_DIR, 'website', 'assets');
  ensureDir(outDir);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Wait up to 15s for renderer to finish loading manifest & Java
  for (let i = 0; i < 60; i++) {
    const ready = await mainWindow.webContents.executeJavaScript('Boolean(window.__peakReady)');
    if (ready) break;
    await wait(250);
  }
  await wait(800);

  // 1. Dark Mode (Nocny Szczyt) - Play View
  await mainWindow.webContents.executeJavaScript("window.__peakTestNavigate('play', 'alpine-dark')");
  await wait(700);
  const darkShot = await mainWindow.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'screen-dark.png'), darkShot.toPNG());

  // 2. Light Mode (Lodowcowy Dzień) - Play View
  await mainWindow.webContents.executeJavaScript("window.__peakTestNavigate('play', 'alpine-light')");
  await wait(700);
  const lightShot = await mainWindow.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'screen-light.png'), lightShot.toPNG());

  // 3. Dark Mode - Mods View (Modrinth Catalog)
  await mainWindow.webContents.executeJavaScript("window.__peakTestNavigate('mods', 'alpine-dark')");
  await wait(1800);
  const modsShot = await mainWindow.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'screen-mods.png'), modsShot.toPNG());

  // 4. Dark Mode - Skin Studio View (click preset to preview real 3D character + avatar update)
  await mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
    window.__peakTestNavigate('skins', 'alpine-dark').then(() => {
      setTimeout(() => {
        const card = document.querySelector('#skin-presets-grid .skin-preset-card');
        if (card) card.click();
        resolve(Boolean(card));
      }, 450);
    });
  })`);
  await wait(1100);
  const skinsShot = await mainWindow.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'screen-skins.png'), skinsShot.toPNG());

  // 5. Dark Mode - Java & Fabric View
  await mainWindow.webContents.executeJavaScript("window.__peakTestNavigate('java', 'alpine-dark')");
  await wait(800);
  const javaShot = await mainWindow.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'screen-java.png'), javaShot.toPNG());

  // 6. Dark Mode - Hosting .peak View
  await mainWindow.webContents.executeJavaScript("window.__peakTestNavigate('hosting', 'alpine-dark')");
  await wait(900);
  const hostingShot = await mainWindow.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'screen-hosting.png'), hostingShot.toPNG());

  console.log('Captured screenshots to:', outDir);
  app.exit(0);
}

function createWindow() {
  const initialTheme = store ? store.getState().theme : 'alpine-dark';
  const runtimeIconPath = getRuntimeIconPath();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 830,
    minWidth: 1040,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: initialTheme === 'alpine-light' ? '#EEF4FB' : '#070D17',
    icon: runtimeIconPath,
    title: 'Peak Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.platform === 'win32') {
    if (typeof mainWindow.setIcon === 'function') {
      mainWindow.setIcon(runtimeIconPath);
    }
    if (typeof mainWindow.setAppDetails === 'function') {
      const taskbarIconPath = app.isPackaged ? process.execPath : ICON_ICO_PATH;
      const relaunchCommand = app.isPackaged
        ? `"${process.execPath}"`
        : `"${process.execPath}" "${ROOT_DIR}"`;
      mainWindow.setAppDetails({
        appId: APP_ID,
        appIconPath: taskbarIconPath,
        appIconIndex: 0,
        relaunchDisplayName: 'Peak Launcher',
        relaunchCommand
      });
    }
  }

  mainWindow.on('maximize', () => sendToRenderer('window:maximizedChanged', true));
  mainWindow.on('unmaximize', () => sendToRenderer('window:maximizedChanged', false));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (CAPTURE_MODE) {
      runScreenshotCapture().catch((err) => {
        console.error('Screenshot capture failed:', err);
        app.exit(1);
      });
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  store = new Store();
  ensureDataTree(store.getDataDir());
  peakRouter.on('status', (st) => sendToRenderer('hosting:routerStatus', st));
  peakRouter.setRemoteResolver((domain) => lookupPublicPeakDomain(domain));
  syncPeakRouterRoutes();
  await peakRouter.start(25565, '127.0.0.1');
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

let quitCleanupDone = false;
app.on('before-quit', (e) => {
  if (quitCleanupDone) return;
  const statuses = Object.values(getAllServerStatuses());
  const anyRunning = statuses.some((s) => s.state !== 'offline' || s.tunnel?.active);
  const routerListening = peakRouter.getStatus().listening;
  if (!anyRunning && !routerListening) return;
  e.preventDefault();
  Promise.allSettled([stopAllServers(), peakRouter.stop()])
    .catch(() => {})
    .finally(() => {
      quitCleanupDone = true;
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
