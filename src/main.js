const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');

const { Store, getSystemMemoryInfo } = require('./store');
const { ensureDataTree, ensureDir, getPaths, getProfileDirs } = require('./engine/paths');
const { getManifest, ensureVersionJson, listInstalledVersions } = require('./engine/versions');
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
  installCuratedPack,
  installPeakFpsPack,
  checkAndUpdateProfileMods
} = require('./engine/modsManager');
const {
  getLaunchStatus,
  launchProfile,
  stopGame
} = require('./engine/launcher');

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

function buildStatePayload() {
  const state = store.getState();
  const dataDir = store.getDataDir();
  return {
    ...state,
    dataDir,
    systemMemory: getSystemMemoryInfo(),
    launchStatus: getLaunchStatus(),
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
    return buildStatePayload();
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

  // 4. Dark Mode - Java & Fabric View
  await mainWindow.webContents.executeJavaScript("window.__peakTestNavigate('java', 'alpine-dark')");
  await wait(800);
  const javaShot = await mainWindow.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'screen-java.png'), javaShot.toPNG());

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

app.whenReady().then(() => {
  store = new Store();
  ensureDataTree(store.getDataDir());
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
