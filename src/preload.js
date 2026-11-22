const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function invoke(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (res && typeof res === 'object' && res.__peakEnvelope) {
    if (!res.ok) {
      throw new Error(res.error || 'Wystąpił nieoczekiwany błąd.');
    }
    return res.data;
  }
  return res;
}

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('peakAPI', {
  // Window controls
  minimizeWindow: () => invoke('window:minimize'),
  maximizeWindow: () => invoke('window:maximize'),
  closeWindow: () => invoke('window:close'),
  isMaximized: () => invoke('window:isMaximized'),
  onWindowMaximizedChanged: (cb) => subscribe('window:maximizedChanged', cb),

  // Drag & Drop file path resolution (Electron 32+ requires webUtils.getPathForFile)
  getFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },

  // State, Theme, Language, Settings, Accounts
  getState: () => invoke('state:get'),
  setTheme: (theme) => invoke('theme:set', theme),
  setLanguage: (lang) => invoke('language:set', lang),
  updateSettings: (patch) => invoke('settings:update', patch),
  saveAccount: (payload) => invoke('account:save', payload),
  selectAccount: (accountId) => invoke('account:select', accountId),
  deleteAccount: (accountId) => invoke('account:delete', accountId),

  // Profiles
  createProfile: (payload) => invoke('profile:create', payload),
  updateProfile: (profileId, patch) => invoke('profile:update', profileId, patch),
  selectProfile: (profileId) => invoke('profile:select', profileId),
  deleteProfile: (profileId) => invoke('profile:delete', profileId),
  enableFabricOnProfile: (profileId, fabricVersion) =>
    invoke('profile:enableFabric', profileId, fabricVersion),
  openProfileFolder: (profileId) => invoke('profile:openFolder', profileId),

  // Versions
  getManifest: (forceRefresh = false) => invoke('versions:manifest', forceRefresh),
  installVersionOnly: (versionId) => invoke('versions:installOnly', versionId),

  // Java
  detectJava: () => invoke('java:detect'),
  getAdoptiumInfo: (major) => invoke('java:adoptiumInfo', major),
  installJava: (major) => invoke('java:install', major),
  removeJava: (major) => invoke('java:remove', major),
  onJavaProgress: (cb) => subscribe('java:progress', cb),

  // Fabric
  getFabricVersions: (forceRefresh = false) => invoke('fabric:versions', forceRefresh),
  getFabricLoaders: (mcVersion) => invoke('fabric:loaders', mcVersion),
  installFabric: (mcVersion, loaderVersion) => invoke('fabric:install', mcVersion, loaderVersion),
  listInstalledFabric: () => invoke('fabric:listInstalled'),
  onFabricProgress: (cb) => subscribe('fabric:progress', cb),

  // Mods & Content (Mods / Shaders / Resource Packs)
  listMods: (profileId) => invoke('mods:list', profileId),
  listContent: (profileId, projectType) => invoke('mods:listContent', profileId, projectType),
  toggleMod: (profileId, fileName, enabled) => invoke('mods:toggle', profileId, fileName, enabled),
  toggleContent: (profileId, fileName, enabled, projectType) =>
    invoke('mods:toggleContent', profileId, fileName, enabled, projectType),
  deleteMod: (profileId, fileName) => invoke('mods:delete', profileId, fileName),
  deleteContent: (profileId, fileName, projectType) =>
    invoke('mods:deleteContent', profileId, fileName, projectType),
  pickAndImportMods: (profileId) => invoke('mods:pickAndImport', profileId),
  pickAndImportContent: (profileId, projectType) =>
    invoke('mods:pickAndImportContent', profileId, projectType),
  importModPaths: (profileId, paths) => invoke('mods:importPaths', profileId, paths),
  importContentPaths: (profileId, paths, projectType) =>
    invoke('mods:importContentPaths', profileId, paths, projectType),
  searchModrinth: (params) => invoke('mods:search', params),
  getModDetails: (params) => invoke('mods:details', params),
  installModrinthMod: (params) => invoke('mods:installModrinth', params),
  installPeakFpsPack: (profileId) => invoke('mods:installPeakFpsPack', profileId),
  installPack: (profileId, packId) => invoke('mods:installPack', profileId, packId),
  checkModUpdates: (profileId) => invoke('mods:checkUpdates', profileId),
  updateAllMods: (profileId) => invoke('mods:updateAll', profileId),
  openModsFolder: (profileId) => invoke('mods:openFolder', profileId),
  openContentFolder: (profileId, projectType) =>
    invoke('mods:openContentFolder', profileId, projectType),
  onModsProgress: (cb) => subscribe('mods:progress', cb),

  // Launch
  launchProfile: (profileId) => invoke('launcher:launch', profileId),
  stopGame: () => invoke('launcher:stop'),
  getLaunchStatus: () => invoke('launcher:status'),
  onLauncherProgress: (cb) => subscribe('launcher:progress', cb),
  onLauncherLog: (cb) => subscribe('launcher:log', cb),
  onLauncherStatus: (cb) => subscribe('launcher:status', cb),

  // System utilities
  openExternal: (url) => invoke('app:openExternal', url),
  openPath: (targetPath) => invoke('app:openPath', targetPath),
  pickDirectory: () => invoke('app:pickDirectory')
});
