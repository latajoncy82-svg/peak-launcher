const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { downloadBatch, downloadFile, safeExtractZip } = require('./download');
const { findInstalledFabricForMc, installFabric, mavenNameToRelativePath } = require('./fabricManager');
const { findJavaForMajor, installJava } = require('./javaManager');
const { ensureDataTree, ensureDir, getPaths, getProfileDirs } = require('./paths');
const { syncPeakClientForProfile } = require('./peakClientManager');
const { getAccountSkinPath } = require('./skinManager');
const { ensureAuthlibInjector, startLocalSkinServer } = require('./skinServer');
const { ensureVersionJson } = require('./versions');

let activeGameProcess = null;
let activeProfileRunningId = null;

function resolvePeakDnsJarPath() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'peak-dns.jar'));
    candidates.push(path.join(process.resourcesPath, 'assets', 'peak-dns.jar'));
  }
  candidates.push(path.resolve(__dirname, '../../assets/peak-dns.jar'));
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function evaluateRules(rules, features = {}) {
  if (!Array.isArray(rules) || rules.length === 0) return true;

  let allowed = false;
  for (const rule of rules) {
    let matches = true;

    if (rule.os) {
      if (rule.os.name && rule.os.name !== 'windows') {
        matches = false;
      }
      if (rule.os.arch && rule.os.arch !== 'x64' && rule.os.arch !== 'amd64') {
        matches = false;
      }
      if (rule.os.version) {
        try {
          const osRelease = require('os').release();
          if (!new RegExp(rule.os.version).test(osRelease)) {
            matches = false;
          }
        } catch {
          // Ignore invalid regex
        }
      }
    }

    if (matches && rule.features) {
      for (const [featKey, featVal] of Object.entries(rule.features)) {
        if (Boolean(features[featKey]) !== Boolean(featVal)) {
          matches = false;
          break;
        }
      }
    }

    if (matches) {
      allowed = rule.action === 'allow';
    }
  }

  return allowed;
}

function getLibDedupKey(mavenName) {
  const parts = String(mavenName || '').split(':');
  if (parts.length < 3) return String(mavenName || '');
  const group = parts[0];
  const artifact = parts[1];
  const classifier = parts[3] || '';
  return `${group}:${artifact}:${classifier}`;
}

function resolveLibraryDownload(lib, librariesDir) {
  const items = [];

  if (lib.downloads && lib.downloads.artifact) {
    const art = lib.downloads.artifact;
    const rel = art.path || mavenNameToRelativePath(lib.name);
    items.push({
      kind: 'classpath',
      url: art.url,
      destPath: path.join(librariesDir, rel.split('/').join(path.sep)),
      expectedHash: art.sha1 || null,
      hashAlgo: 'sha1'
    });
  } else if (lib.name && !lib.natives) {
    const rel = mavenNameToRelativePath(lib.name);
    const baseUrl = (lib.url || 'https://libraries.minecraft.net/').replace(/\/+$/, '');
    items.push({
      kind: 'classpath',
      url: `${baseUrl}/${rel}`,
      destPath: path.join(librariesDir, rel.split('/').join(path.sep)),
      expectedHash: lib.sha1 || null,
      hashAlgo: 'sha1'
    });
  }

  // Legacy Minecraft natives (`natives.windows` -> `downloads.classifiers[key]`)
  if (lib.natives && lib.natives.windows) {
    const nativeKey = lib.natives.windows.replace('${arch}', '64');
    const classifier = lib.downloads?.classifiers?.[nativeKey];
    if (classifier && classifier.url) {
      const rel = classifier.path || `${mavenNameToRelativePath(lib.name).replace(/\.jar$/, '')}-${nativeKey}.jar`;
      items.push({
        kind: 'native',
        url: classifier.url,
        destPath: path.join(librariesDir, rel.split('/').join(path.sep)),
        expectedHash: classifier.sha1 || null,
        hashAlgo: 'sha1',
        exclude: lib.extract?.exclude || ['META-INF/']
      });
    }
  }

  return items;
}

function mergeVersionChain(parentJson, childJson) {
  if (!childJson) {
    return {
      ...parentJson,
      effectiveId: parentJson.id,
      parentId: parentJson.id
    };
  }

  const childLibs = Array.isArray(childJson.libraries) ? childJson.libraries : [];
  const parentLibs = Array.isArray(parentJson.libraries) ? parentJson.libraries : [];

  // Place child libraries first so Fabric's ASM overrides Mojang's older ASM
  const combinedRaw = [...childLibs, ...parentLibs];
  const seenKeys = new Set();
  const mergedLibs = [];

  for (const lib of combinedRaw) {
    if (!evaluateRules(lib.rules)) continue;
    const key = getLibDedupKey(lib.name);
    if (key && seenKeys.has(key)) continue;
    if (key) seenKeys.add(key);
    mergedLibs.push(lib);
  }

  const parentArgs = parentJson.arguments || {};
  const childArgs = childJson.arguments || {};

  return {
    ...parentJson,
    ...childJson,
    effectiveId: childJson.id || parentJson.id,
    parentId: parentJson.id,
    mainClass: childJson.mainClass || parentJson.mainClass,
    javaVersion: childJson.javaVersion || parentJson.javaVersion,
    assetIndex: childJson.assetIndex || parentJson.assetIndex,
    assets: childJson.assets || parentJson.assets,
    downloads: parentJson.downloads,
    libraries: mergedLibs,
    arguments: (parentJson.arguments || childJson.arguments)
      ? {
          jvm: [...(childArgs.jvm || []), ...(parentArgs.jvm || [])],
          game: [...(parentArgs.game || []), ...(childArgs.game || [])]
        }
      : undefined,
    minecraftArguments: childJson.minecraftArguments || parentJson.minecraftArguments
  };
}

function flattenArgumentItems(items, features, replacements) {
  const result = [];
  for (const item of items || []) {
    if (typeof item === 'string') {
      result.push(applyPlaceholders(item, replacements));
    } else if (item && typeof item === 'object') {
      if (!evaluateRules(item.rules, features)) continue;
      const values = Array.isArray(item.value) ? item.value : [item.value];
      for (const v of values) {
        if (typeof v === 'string') {
          result.push(applyPlaceholders(v, replacements));
        }
      }
    }
  }
  return result;
}

function applyPlaceholders(str, replacements) {
  return String(str).replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return replacements[key];
    }
    return match;
  });
}

function parseUserJvmArgs(rawArgs) {
  const text = String(rawArgs || '').trim();
  if (!text) return [];
  const matches = text.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return matches.map((token) =>
    token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token
  );
}

function supportsQuickPlay(mcVersion) {
  const s = String(mcVersion || '').trim();
  const yr = s.match(/^(\d+)\./);
  if (yr && Number(yr[1]) >= 20) return true;
  const snap = s.match(/^(\d{2})w/);
  if (snap && Number(snap[1]) >= 23) return true;
  const minor = s.match(/^1\.(\d+)/);
  if (minor && Number(minor[1]) >= 20) return true;
  return false;
}

function buildLaunchSpec({
  profile,
  account,
  settings = {},
  dataDir,
  javaPath,
  parentJson,
  childJson = null,
  assetIndexJson = null,
  skinAgent = null,
  quickPlayServer = null
}) {
  const paths = getPaths(dataDir);
  const profileDirs = getProfileDirs(dataDir, profile.id);
  const merged = mergeVersionChain(parentJson, childJson);

  const mcVersion = parentJson.id;
  const effectiveId = merged.effectiveId;
  const javaMajor = merged.javaVersion?.majorVersion || 8;
  const peakDnsJarPath = javaMajor >= 18 ? resolvePeakDnsJarPath() : null;
  const nativesDir = path.join(paths.versionsDir, effectiveId, 'natives');
  const clientJarPath = path.join(paths.versionsDir, mcVersion, `${mcVersion}.jar`);

  const librariesToDownload = [];
  const nativeJarsToExtract = [];
  const classpathEntries = [];
  const seenCp = new Set();

  for (const lib of merged.libraries || []) {
    if (!evaluateRules(lib.rules)) continue;
    const resolvedItems = resolveLibraryDownload(lib, paths.librariesDir);
    for (const item of resolvedItems) {
      librariesToDownload.push(item);
      if (item.kind === 'classpath') {
        const key = item.destPath.toLowerCase();
        if (!seenCp.has(key)) {
          seenCp.add(key);
          classpathEntries.push(item.destPath);
        }
      } else if (item.kind === 'native') {
        nativeJarsToExtract.push(item);
      }
    }
  }

  classpathEntries.push(clientJarPath);
  const classpath = classpathEntries.join(path.delimiter);

  const assetIndexId = merged.assetIndex?.id || merged.assets || 'legacy';
  const virtualAssetsRoot =
    assetIndexJson && (assetIndexJson.virtual || assetIndexJson.map_to_resources)
      ? path.join(paths.assetsDir, 'virtual', assetIndexId)
      : paths.assetsDir;

  const customResolution = Boolean(settings.customResolution);
  const features = {
    is_demo_user: false,
    has_custom_resolution: customResolution,
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: false,
    is_quick_play_realms: false
  };

  const uuidHex = (account?.uuid || '00000000-0000-3000-8000-000000000000').replace(/-/g, '');
  const isPremium = Boolean(account && account.type === 'microsoft' && account.mcAccessToken);
  const useSkinAgent = Boolean(!isPremium && skinAgent && skinAgent.jarPath && skinAgent.apiUrl);

  const replacements = {
    auth_player_name: account?.username || 'PeakPlayer',
    version_name: effectiveId,
    game_directory: profileDirs.instanceDir,
    assets_root: paths.assetsDir,
    assets_index_name: assetIndexId,
    game_assets: virtualAssetsRoot,
    auth_uuid: uuidHex,
    auth_access_token: isPremium ? account.mcAccessToken : useSkinAgent ? uuidHex : '0',
    auth_session: isPremium
      ? `token:${account.mcAccessToken}:${uuidHex}`
      : `token:${useSkinAgent ? uuidHex : '0'}:${uuidHex}`,
    clientid: '',
    auth_xuid: isPremium ? String(account.xuid || '') : '',
    user_type: isPremium ? 'msa' : useSkinAgent ? 'mojang' : 'legacy',
    user_properties: '{}',
    version_type: merged.type || 'release',
    natives_directory: nativesDir,
    library_directory: paths.librariesDir,
    classpath_separator: path.delimiter,
    classpath,
    launcher_name: 'PeakLauncher',
    launcher_version: '1.7.2',
    resolution_width: String(settings.width || 1280),
    resolution_height: String(settings.height || 720)
  };

  const ramMb = Number(profile.ramMb || settings.ramMb || 2048);
  const userJvmArgs = parseUserJvmArgs(settings.jvmArgs);
  const hasXmx = userJvmArgs.some((a) => a.startsWith('-Xmx'));
  const hasXms = userJvmArgs.some((a) => a.startsWith('-Xms'));

  const baseMemoryArgs = [];
  if (!hasXms) baseMemoryArgs.push(`-Xms${Math.min(512, ramMb)}M`);
  if (!hasXmx) baseMemoryArgs.push(`-Xmx${ramMb}M`);

  let jvmArgs = [];
  let gameArgs = [];

  if (merged.arguments && Array.isArray(merged.arguments.jvm)) {
    jvmArgs = flattenArgumentItems(merged.arguments.jvm, features, replacements);
  } else {
    jvmArgs = [
      `-Djava.library.path=${nativesDir}`,
      `-Dminecraft.launcher.brand=PeakLauncher`,
      `-Dminecraft.launcher.version=1.7.2`,
      '-cp',
      classpath
    ];
  }

  // Ensure -cp ${classpath} is present when child arguments had jvm args but parent was legacy
  if (!jvmArgs.includes('-cp') && !jvmArgs.includes('-classpath')) {
    jvmArgs.push(`-Djava.library.path=${nativesDir}`, '-cp', classpath);
  }

  if (merged.arguments && Array.isArray(merged.arguments.game)) {
    gameArgs = flattenArgumentItems(merged.arguments.game, features, replacements);
  } else if (merged.minecraftArguments) {
    const tokens = String(merged.minecraftArguments).trim().split(/\s+/);
    gameArgs = tokens.map((tok) => applyPlaceholders(tok, replacements));
    if (customResolution) {
      gameArgs.push('--width', replacements.resolution_width, '--height', replacements.resolution_height);
    }
  }

  if (quickPlayServer && String(quickPlayServer).trim()) {
    const target = String(quickPlayServer).trim();
    if (supportsQuickPlay(mcVersion)) {
      gameArgs.push('--quickPlayMultiplayer', target);
    } else {
      const colonIdx = target.lastIndexOf(':');
      const host = colonIdx > 0 ? target.slice(0, colonIdx) : target;
      const port = colonIdx > 0 ? target.slice(colonIdx + 1) : '25565';
      gameArgs.push('--server', host, '--port', port);
    }
  }

  const skinJvmArgs = useSkinAgent
    ? [
        `-javaagent:${skinAgent.jarPath}=${skinAgent.apiUrl}`,
        '-Dauthlibinjector.side=client',
        ...(skinAgent.prefetchedBase64
          ? [`-Dauthlibinjector.yggdrasil.prefetched=${skinAgent.prefetchedBase64}`]
          : [])
      ]
    : [];

  const peakDnsJvmArgs = peakDnsJarPath ? [`-Xbootclasspath/a:${peakDnsJarPath}`] : [];

  const allArgs = [
    ...baseMemoryArgs,
    ...userJvmArgs,
    ...peakDnsJvmArgs,
    ...jvmArgs,
    ...skinJvmArgs,
    merged.mainClass,
    ...gameArgs
  ];

  const clientDownload = merged.downloads?.client;
  const clientJarTask = clientDownload
    ? {
        url: clientDownload.url,
        destPath: clientJarPath,
        expectedHash: clientDownload.sha1 || null,
        hashAlgo: 'sha1'
      }
    : null;

  return {
    command: javaPath,
    args: allArgs,
    cwd: profileDirs.instanceDir,
    effectiveId,
    mcVersion,
    javaMajor,
    peakDnsJarPath,
    peakDnsActive: Boolean(peakDnsJarPath),
    nativesDir,
    clientJarPath,
    clientJarTask,
    librariesToDownload,
    nativeJarsToExtract,
    assetIndexMeta: merged.assetIndex || null,
    assetIndexId
  };
}

function ensureNativesTree(nativesDir) {
  ensureDir(nativesDir);
  ensureDir(path.join(nativesDir, 'java'));
  ensureDir(path.join(nativesDir, 'jna'));
  ensureDir(path.join(nativesDir, 'lwjgl'));
  ensureDir(path.join(nativesDir, 'netty'));
}

async function prepareAssets({ assetIndexMeta, assetIndexId, dataDir, gameDir, emitProgress }) {
  if (!assetIndexMeta || !assetIndexMeta.url) return null;

  const { assetsDir } = getPaths(dataDir);
  const indexesDir = path.join(assetsDir, 'indexes');
  const objectsDir = path.join(assetsDir, 'objects');
  ensureDir(indexesDir);
  ensureDir(objectsDir);

  const indexPath = path.join(indexesDir, `${assetIndexId}.json`);
  emitProgress('assets', 5, `Pobieranie indeksu zasobów (${assetIndexId})...`);

  await downloadFile(assetIndexMeta.url, indexPath, {
    expectedHash: assetIndexMeta.sha1 || null,
    hashAlgo: 'sha1'
  });

  const assetIndexJson = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const objects = assetIndexJson.objects || {};
  const tasks = [];
  const seenHashes = new Set();

  for (const [, obj] of Object.entries(objects)) {
    if (!obj || !obj.hash) continue;
    const hash = obj.hash;
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    const prefix = hash.slice(0, 2);
    const destPath = path.join(objectsDir, prefix, hash);
    if (fs.existsSync(destPath) && fs.statSync(destPath).size === obj.size) {
      continue;
    }
    tasks.push({
      url: `https://resources.download.minecraft.net/${prefix}/${hash}`,
      destPath,
      expectedHash: hash,
      hashAlgo: 'sha1'
    });
  }

  if (tasks.length > 0) {
    emitProgress('assets', 15, `Pobieranie brakujących zasobów (${tasks.length} plików)...`);
    await downloadBatch(tasks, {
      concurrency: 16,
      onProgress: ({ completed, total }) => {
        const pct = Math.round((completed / total) * 100);
        emitProgress('assets', pct, `Pobieranie zasobów gry (${completed}/${total})...`);
      }
    });
  } else {
    emitProgress('assets', 100, 'Wszystkie zasoby gry są aktualne.');
  }

  // Materialize legacy virtual/resources assets if required (pre-1.6 / Beta / Alpha)
  if (assetIndexJson.virtual || assetIndexJson.map_to_resources) {
    const virtualDir = path.join(assetsDir, 'virtual', assetIndexId);
    const resourcesDir = path.join(gameDir, 'resources');
    for (const [logicalPath, obj] of Object.entries(objects)) {
      if (!obj || !obj.hash) continue;
      const src = path.join(objectsDir, obj.hash.slice(0, 2), obj.hash);
      if (!fs.existsSync(src)) continue;

      if (assetIndexJson.virtual) {
        const target = path.join(virtualDir, logicalPath.split('/').join(path.sep));
        if (!fs.existsSync(target)) {
          ensureDir(path.dirname(target));
          fs.copyFileSync(src, target);
        }
      }
      if (assetIndexJson.map_to_resources) {
        const target = path.join(resourcesDir, logicalPath.split('/').join(path.sep));
        if (!fs.existsSync(target)) {
          ensureDir(path.dirname(target));
          fs.copyFileSync(src, target);
        }
      }
    }
  }

  return assetIndexJson;
}

async function prepareProfileFiles({
  profile,
  account,
  allAccounts = [],
  settings = {},
  language = 'pl',
  dataDir,
  quickPlayServer = null,
  onProgress = null,
  onLog = null
}) {
  const emitProgress = (stage, percent, message) => {
    if (onProgress) onProgress({ stage, percent, message });
  };
  const log = (level, text) => {
    if (onLog) onLog({ level, text, ts: new Date().toISOString() });
  };

  ensureDataTree(dataDir);
  const profileDirs = getProfileDirs(dataDir, profile.id);
  ensureDir(profileDirs.instanceDir);
  ensureDir(profileDirs.modsDir);
  ensureDir(profileDirs.configDir);

  try {
    syncPeakClientForProfile({ profile, settings, language, dataDir, onLog });
  } catch (peakErr) {
    log('WARN', `Synchronizacja Peak Client nie powiodła się (${peakErr.message}).`);
  }

  emitProgress('version', 10, `Pobieranie metadanych Minecraft ${profile.mcVersion}...`);
  log('SYSTEM', `Przygotowanie profilu "${profile.name}" (MC ${profile.mcVersion}, ${profile.loader})...`);

  const parentJson = await ensureVersionJson(profile.mcVersion, dataDir);
  let childJson = null;

  if (profile.loader === 'fabric') {
    let installedFabric = findInstalledFabricForMc(profile.mcVersion, profile.fabricVersion, dataDir);
    if (!installedFabric) {
      if (!settings.autoInstallFabric) {
        throw new Error(
          `Brak zainstalowanego Fabric Loadera dla Minecraft ${profile.mcVersion}. Zainstaluj go w zakładce Java i Fabric.`
        );
      }
      log('SYSTEM', `Automatyczne pobieranie Fabric Loadera dla ${profile.mcVersion}...`);
      const res = await installFabric(
        profile.mcVersion,
        profile.fabricVersion || 'latest',
        dataDir,
        ({ percent, message }) => emitProgress('fabric', percent, message)
      );
      childJson = res.profileJson;
    } else {
      childJson = JSON.parse(fs.readFileSync(installedFabric.jsonPath, 'utf8'));
    }
  }

  const mergedMeta = mergeVersionChain(parentJson, childJson);
  const requiredJavaMajor = mergedMeta.javaVersion?.majorVersion || 8;

  emitProgress('java', 10, `Sprawdzanie Java ${requiredJavaMajor}...`);
  let javaInfo = await findJavaForMajor(requiredJavaMajor, dataDir);
  if (!javaInfo) {
    if (!settings.autoInstallJava) {
      throw new Error(
        `Wymagana jest Java ${requiredJavaMajor}, której nie wykryto w systemie. Pobierz ją w zakładce Java i Fabric.`
      );
    }
    log('SYSTEM', `Brak Javy ${requiredJavaMajor} — pobieranie Eclipse Temurin JRE ${requiredJavaMajor}...`);
    javaInfo = await installJava(requiredJavaMajor, dataDir, ({ percent, message }) =>
      emitProgress('java', percent, message)
    );
  }
  log('SYSTEM', `Używam Java ${javaInfo.major} (${javaInfo.rawVersion}): ${javaInfo.path}`);

  // Build initial spec to collect download lists
  let spec = buildLaunchSpec({
    profile,
    account,
    settings,
    dataDir,
    javaPath: javaInfo.path,
    parentJson,
    childJson
  });

  if (spec.clientJarTask) {
    emitProgress('client', 20, `Sprawdzanie klienta Minecraft ${profile.mcVersion}...`);
    await downloadFile(spec.clientJarTask.url, spec.clientJarTask.destPath, {
      expectedHash: spec.clientJarTask.expectedHash,
      hashAlgo: 'sha1',
      onProgress: ({ downloadedBytes, totalBytes }) => {
        const pct = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 50;
        emitProgress('client', pct, `Pobieranie klienta Minecraft ${profile.mcVersion}...`);
      }
    });
  }

  if (spec.librariesToDownload.length > 0) {
    emitProgress('libraries', 5, `Sprawdzanie bibliotek (${spec.librariesToDownload.length})...`);
    await downloadBatch(spec.librariesToDownload, {
      concurrency: 12,
      onProgress: ({ completed, total, currentFile }) => {
        const pct = Math.round((completed / total) * 100);
        emitProgress('libraries', pct, `Biblioteki (${completed}/${total}): ${currentFile}`);
      }
    });
  }

  ensureNativesTree(spec.nativesDir);
  for (const nativeTask of spec.nativeJarsToExtract) {
    if (fs.existsSync(nativeTask.destPath)) {
      safeExtractZip(nativeTask.destPath, spec.nativesDir, {
        excludePrefixes: nativeTask.exclude || ['META-INF/']
      });
    }
  }

  const assetIndexJson = await prepareAssets({
    assetIndexMeta: spec.assetIndexMeta,
    assetIndexId: spec.assetIndexId,
    dataDir,
    gameDir: profileDirs.instanceDir,
    emitProgress
  });

  let skinServer = null;
  let skinAgent = null;
  const isPremiumAccount = Boolean(account && account.type === 'microsoft' && account.mcAccessToken);
  const activeSkinPath = isPremiumAccount ? null : getAccountSkinPath(dataDir, account);
  if (isPremiumAccount) {
    log('SYSTEM', `Zalogowano jako konto Premium Microsoft (${account.username}) — używam oficjalnej sesji Mojang.`);
  }
  if (activeSkinPath) {
    try {
      emitProgress('ready', 95, 'Przygotowanie lokalnego serwera skinów...');
      const jarPath = await ensureAuthlibInjector(dataDir);
      const serverAccounts = Array.isArray(allAccounts) && allAccounts.length > 0 ? allAccounts : [account].filter(Boolean);
      skinServer = await startLocalSkinServer({ dataDir, accounts: serverAccounts });
      skinAgent = {
        jarPath,
        apiUrl: skinServer.apiUrl,
        prefetchedBase64: skinServer.prefetchedBase64
      };
      log(
        'SYSTEM',
        `Aktywowano własny skin gracza ${account?.username || ''} (${account?.skinModel || 'classic'}) przez lokalny Yggdrasil (${skinServer.apiUrl}).`
      );
    } catch (skinErr) {
      log('WARN', `Nie udało się uruchomić lokalnego serwera skinów (${skinErr.message}) — gra wystartuje bez własnego skina.`);
      if (skinServer) {
        await skinServer.close().catch(() => {});
        skinServer = null;
      }
      skinAgent = null;
    }
  }

  // Rebuild spec with assetIndexJson so legacy virtual/resources path is exact
  spec = buildLaunchSpec({
    profile,
    account,
    settings,
    dataDir,
    javaPath: javaInfo.path,
    parentJson,
    childJson,
    assetIndexJson,
    skinAgent,
    quickPlayServer
  });

  emitProgress('ready', 100, 'Wszystkie pliki gotowe!');
  return { spec, javaInfo, skinServer };
}

async function launchProfile({
  profile,
  account,
  allAccounts = [],
  settings,
  language = 'pl',
  dataDir,
  quickPlayServer = null,
  onProgress = null,
  onLog = null,
  onStatus = null
}) {
  if (activeGameProcess) {
    throw new Error('Gra Minecraft jest już uruchomiona.');
  }

  const emitStatus = (state, extra = {}) => {
    if (onStatus) onStatus({ state, profileId: profile.id, ...extra });
  };

  let activeSkinServer = null;
  const closeSkinServer = () => {
    if (activeSkinServer) {
      const srv = activeSkinServer;
      activeSkinServer = null;
      srv.close().catch(() => {});
    }
  };

  emitStatus('preparing');
  try {
    const { spec, skinServer } = await prepareProfileFiles({
      profile,
      account,
      allAccounts,
      settings,
      language,
      dataDir,
      quickPlayServer,
      onProgress,
      onLog
    });
    activeSkinServer = skinServer || null;

    if (onLog) {
      onLog({
        level: 'SYSTEM',
        text: `Uruchamianie ${spec.effectiveId} w katalogu ${spec.cwd}`,
        ts: new Date().toISOString()
      });
    }

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeGameProcess = child;
    activeProfileRunningId = profile.id;
    emitStatus('running', { pid: child.pid });

    const pipeLines = (stream, defaultLevel) => {
      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let level = defaultLevel;
          if (/\/ERROR\]|Exception|Error:/i.test(line)) level = 'ERROR';
          else if (/\/WARN\]/i.test(line)) level = 'WARN';
          if (onLog) onLog({ level, text: line, ts: new Date().toISOString() });
        }
      });
    };

    pipeLines(child.stdout, 'INFO');
    pipeLines(child.stderr, 'WARN');

    child.on('error', (err) => {
      activeGameProcess = null;
      activeProfileRunningId = null;
      closeSkinServer();
      if (onLog) {
        onLog({ level: 'ERROR', text: `Błąd procesu gry: ${err.message}`, ts: new Date().toISOString() });
      }
      emitStatus('idle', { exitCode: -1, error: err.message });
    });

    child.on('exit', (code) => {
      activeGameProcess = null;
      activeProfileRunningId = null;
      closeSkinServer();
      if (onLog) {
        const hint =
          code && code !== 0
            ? ' (Sprawdź logi w konsoli — możliwy konflikt modów lub brakująca biblioteka jak Fabric API)'
            : '';
        onLog({
          level: code === 0 ? 'SYSTEM' : 'ERROR',
          text: `Minecraft zakończył działanie z kodem ${code ?? 'null'}${hint}.`,
          ts: new Date().toISOString()
        });
      }
      emitStatus('idle', { exitCode: code });
    });

    return { pid: child.pid, effectiveId: spec.effectiveId };
  } catch (err) {
    closeSkinServer();
    emitStatus('idle', { error: err.message });
    throw err;
  }
}

function stopGame() {
  if (!activeGameProcess) return false;
  try {
    activeGameProcess.kill('SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function getLaunchStatus() {
  return {
    running: Boolean(activeGameProcess),
    profileId: activeProfileRunningId,
    pid: activeGameProcess ? activeGameProcess.pid : null
  };
}

module.exports = {
  evaluateRules,
  getLibDedupKey,
  resolveLibraryDownload,
  mergeVersionChain,
  resolvePeakDnsJarPath,
  buildLaunchSpec,
  ensureNativesTree,
  prepareProfileFiles,
  launchProfile,
  stopGame,
  getLaunchStatus
};
