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

  // State, Theme, Settings, Accounts
  getState: () => invoke('state:get'),
  setTheme: (theme) => invoke('theme:set', theme),
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

  // Mods
  listMods: (profileId) => invoke('mods:list', profileId),
  toggleMod: (profileId, fileName, enabled) => invoke('mods:toggle', profileId, fileName, enabled),
  deleteMod: (profileId, fileName) => invoke('mods:delete', profileId, fileName),
  pickAndImportMods: (profileId) => invoke('mods:pickAndImport', profileId),
  importModPaths: (profileId, paths) => invoke('mods:importPaths', profileId, paths),
  searchModrinth: (params) => invoke('mods:search', params),
  installModrinthMod: (params) => invoke('mods:installModrinth', params),
  installPeakFpsPack: (profileId) => invoke('mods:installPeakFpsPack', profileId),
  openModsFolder: (profileId) => invoke('mods:openFolder', profileId),
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
