const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { downloadFile, fetchJson } = require('./download');
const { FABRIC_META_BASE, getFabricLoadersForMc } = require('./fabricManager');
const { findJavaForMajor, installJava } = require('./javaManager');
const { listModsInDirectory, readMetadataFile } = require('./modsManager');
const { ensureDir, ensureDataTree, getServerDirs } = require('./paths');
const {
  claimAndPublishPeakDomain,
  publishPeakRecord,
  unpublishPeakDomain
} = require('./peakDirectory');
const { ensureVersionJson, estimateJavaMajor } = require('./versions');

const MAX_LOG_LINES = 600;

// In-memory runtime state indexed by serverId
const runtimes = new Map();

function getOrCreateRuntime(serverId) {
  let rt = runtimes.get(serverId);
  if (!rt) {
    rt = {
      serverId,
      state: 'offline', // offline | preparing | starting | online | stopping
      pid: null,
      port: 25565,
      bindPort: null,
      startedAt: null,
      readyAt: null,
      players: new Set(),
      logs: [],
      process: null,
      tunnel: {
        active: false,
        connecting: false,
        address: '',
        publicDomain: '',
        rawAddress: '',
        registryActive: false,
        provider: '',
        note: '',
        process: null,
        heartbeatTimer: null,
        ownerId: ''
      }
    };
    runtimes.set(serverId, rt);
  }
  return rt;
}

function serializeRuntimeStatus(rt) {
  return {
    serverId: rt.serverId,
    state: rt.state,
    pid: rt.pid,
    port: rt.port,
    bindPort: rt.bindPort || rt.port,
    startedAt: rt.startedAt,
    readyAt: rt.readyAt,
    players: Array.from(rt.players),
    playerCount: rt.players.size,
    tunnel: {
      active: Boolean(rt.tunnel.active),
      connecting: Boolean(rt.tunnel.connecting),
      address: rt.tunnel.address || '',
      publicDomain: rt.tunnel.publicDomain || '',
      rawAddress: rt.tunnel.rawAddress || '',
      registryActive: Boolean(rt.tunnel.registryActive),
      provider: rt.tunnel.provider || '',
      note: rt.tunnel.note || ''
    }
  };
}

async function findFreeLoopbackPort(startPort = 25600, excludePorts = new Set()) {
  const tryPort = (port) =>
    new Promise((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(null));
      tester.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
        const addr = tester.address();
        const resolvedPort = addr && typeof addr === 'object' ? addr.port : port;
        tester.close(() => resolve(resolvedPort));
      });
    });

  for (let candidate = startPort; candidate <= startPort + 400 && candidate <= 65535; candidate++) {
    if (excludePorts.has(candidate)) continue;
    const ok = await tryPort(candidate);
    if (ok) return ok;
  }
  const fallback = await tryPort(0);
  if (fallback) return fallback;
  throw new Error('Nie można znaleźć wolnego wewnętrznego portu loopback (127.0.0.1).');
}

function getServerRuntimeStatus(serverId) {
  return serializeRuntimeStatus(getOrCreateRuntime(serverId));
}

function getAllServerStatuses() {
  const out = {};
  for (const [id, rt] of runtimes.entries()) {
    out[id] = serializeRuntimeStatus(rt);
  }
  return out;
}

function getServerLogs(serverId) {
  return [...(getOrCreateRuntime(serverId).logs || [])];
}

function appendServerLog(rt, level, text, onLog = null) {
  const entry = {
    serverId: rt.serverId,
    level: level || 'INFO',
    text: String(text || ''),
    ts: new Date().toISOString()
  };
  rt.logs.push(entry);
  if (rt.logs.length > MAX_LOG_LINES) {
    rt.logs.splice(0, rt.logs.length - MAX_LOG_LINES);
  }
  if (onLog) onLog(entry);
}

function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [ifaceName, addrs] of Object.entries(interfaces)) {
    if (!Array.isArray(addrs)) continue;
    const isVirtual = /vethernet|wsl|docker|virtualbox|vmware|hyper-v|loopback|tailscale|hamachi/i.test(
      ifaceName
    );
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue;
      const isPrivate =
        addr.address.startsWith('192.168.') ||
        addr.address.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(addr.address);
      const score = (isVirtual ? 0 : 100) + (isPrivate ? 20 : 0);
      candidates.push({ address: addr.address, score });
    }
  }

  if (candidates.length === 0) return '127.0.0.1';
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].address;
}

function readServerProperties(filePath) {
  const map = {};
  if (!filePath || !fs.existsSync(filePath)) return map;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    map[key] = val;
  }
  return map;
}

function writeServerProperties(filePath, serverConfig, options = {}) {
  ensureDir(path.dirname(filePath));
  const existing = readServerProperties(filePath);
  const effectivePort = Number(options.bindPort || serverConfig.port) || 25565;
  const effectiveIp =
    options.bindHost !== undefined ? String(options.bindHost) : String(existing['server-ip'] || '');
  const merged = {
    'accepts-transfers': 'false',
    'allow-flight': 'true',
    'allow-nether': 'true',
    'broadcast-console-to-ops': 'true',
    'broadcast-rcon-to-ops': 'true',
    difficulty: serverConfig.difficulty || 'normal',
    'enable-command-block': serverConfig.commandBlocks ? 'true' : 'false',
    'enable-jmx-monitoring': 'false',
    'enable-query': 'false',
    'enable-rcon': 'false',
    'enable-status': 'true',
    'enforce-secure-profile': 'false',
    'enforce-whitelist': serverConfig.whitelist ? 'true' : 'false',
    gamemode: serverConfig.gamemode || 'survival',
    'generate-structures': 'true',
    hardcore: 'false',
    'hide-online-players': 'false',
    'level-name': 'world',
    'level-seed': serverConfig.seed || '',
    'max-players': String(Math.max(1, Math.min(100, Number(serverConfig.maxPlayers) || 10))),
    motd: serverConfig.motd || `Peak Server · ${serverConfig.peakDomain || 'szczyt.peak'}`,
    'online-mode': serverConfig.onlineMode ? 'true' : 'false',
    'pause-when-empty-seconds': '60',
    pvp: serverConfig.pvp !== false ? 'true' : 'false',
    'server-ip': '',
    'server-port': String(Math.max(1024, Math.min(65535, effectivePort))),
    'simulation-distance': String(Math.max(4, Math.min(16, Number(serverConfig.viewDistance) || 10))),
    'spawn-protection': '0',
    'view-distance': String(Math.max(4, Math.min(32, Number(serverConfig.viewDistance) || 10))),
    'white-list': serverConfig.whitelist ? 'true' : 'false',
    ...existing
  };

  // Always enforce launcher-managed settings over existing values
  merged['server-ip'] = effectiveIp;
  merged['server-port'] = String(Math.max(1024, Math.min(65535, effectivePort)));
  merged['max-players'] = String(Math.max(1, Math.min(100, Number(serverConfig.maxPlayers) || 10)));
  merged.gamemode = serverConfig.gamemode || 'survival';
  merged.difficulty = serverConfig.difficulty || 'normal';
  merged['online-mode'] = serverConfig.onlineMode ? 'true' : 'false';
  merged['enforce-secure-profile'] = serverConfig.onlineMode ? 'true' : 'false';
  merged.pvp = serverConfig.pvp !== false ? 'true' : 'false';
  merged['white-list'] = serverConfig.whitelist ? 'true' : 'false';
  merged['enforce-whitelist'] = serverConfig.whitelist ? 'true' : 'false';
  merged['enable-command-block'] = serverConfig.commandBlocks ? 'true' : 'false';
  merged['view-distance'] = String(Math.max(4, Math.min(32, Number(serverConfig.viewDistance) || 10)));
  merged['level-seed'] = serverConfig.seed || '';
  merged.motd = serverConfig.motd || `Peak Server · ${serverConfig.peakDomain || 'szczyt.peak'}`;
  merged['allow-flight'] = 'true';
  merged['enable-status'] = 'true';

  const lines = [
    '# Minecraft server properties managed by Peak Launcher (.peak hosting)',
    `# ${new Date().toISOString()}`,
    ...Object.entries(merged).map(([k, v]) => `${k}=${v}`)
  ];
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${lines.join('\n')}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
  return merged;
}

function writeEulaFile(eulaPath, accepted) {
  ensureDir(path.dirname(eulaPath));
  const content = [
    '# By changing the setting below to TRUE you are indicating your agreement to the Minecraft EULA (https://aka.ms/MinecraftEULA).',
    `# Updated by Peak Launcher on ${new Date().toISOString()}`,
    `eula=${accepted ? 'true' : 'false'}`
  ].join('\n');
  fs.writeFileSync(eulaPath, `${content}\n`, 'utf8');
}

async function getLatestFabricInstallerVersion() {
  const installers = await fetchJson(`${FABRIC_META_BASE}/versions/installer`);
  if (!Array.isArray(installers) || installers.length === 0) {
    return '1.1.2';
  }
  const stable = installers.find((i) => i.stable) || installers[0];
  return stable?.version || '1.1.2';
}

async function prepareServerRuntime({
  server,
  settings = {},
  dataDir,
  bindHost = undefined,
  bindPort = null,
  onProgress = null,
  onLog = null
}) {
  if (!server) throw new Error('Brak konfiguracji serwera .peak.');
  if (!server.eulaAccepted) {
    throw new Error('Przed uruchomieniem serwera zaakceptuj Minecraft EULA w Ustawieniach serwera.');
  }

  const emitProgress = (stage, percent, message) => {
    if (onProgress) onProgress({ serverId: server.id, stage, percent, message });
  };
  const log = (level, text) => {
    const rt = getOrCreateRuntime(server.id);
    appendServerLog(rt, level, text, onLog);
  };

  ensureDataTree(dataDir);
  const dirs = getServerDirs(dataDir, server.id);
  ensureDir(dirs.serverDir);
  ensureDir(dirs.modsDir);

  emitProgress('java', 15, `Sprawdzanie Javy dla MC ${server.mcVersion}...`);
  const versionJson = await ensureVersionJson(server.mcVersion, dataDir);
  const requiredJavaMajor =
    versionJson.javaVersion?.majorVersion || estimateJavaMajor(server.mcVersion, versionJson.releaseTime);

  let javaInfo = await findJavaForMajor(requiredJavaMajor, dataDir);
  if (!javaInfo) {
    if (settings.autoInstallJava === false) {
      throw new Error(
        `Wymagana jest Java ${requiredJavaMajor} dla serwera MC ${server.mcVersion}. Pobierz ją w zakładce Java i Fabric.`
      );
    }
    log('SYSTEM', `Pobieranie Eclipse Temurin JRE ${requiredJavaMajor} dla serwera ${server.peakDomain}...`);
    javaInfo = await installJava(requiredJavaMajor, dataDir, ({ percent, message }) =>
      emitProgress('java', Math.max(15, Math.min(55, Math.round(15 + percent * 0.4))), message)
    );
  }

  let runtimeMeta = null;
  if (fs.existsSync(dirs.runtimeMetaPath)) {
    try {
      runtimeMeta = JSON.parse(fs.readFileSync(dirs.runtimeMetaPath, 'utf8'));
    } catch {
      runtimeMeta = null;
    }
  }

  let jarFileName = '';
  let resolvedLoaderVersion = null;

  if (server.loader === 'fabric') {
    emitProgress('server', 60, `Sprawdzanie Fabric Server JAR dla ${server.mcVersion}...`);
    resolvedLoaderVersion = server.fabricVersion;
    if (!resolvedLoaderVersion || resolvedLoaderVersion === 'latest') {
      const loaders = await getFabricLoadersForMc(server.mcVersion);
      if (!Array.isArray(loaders) || loaders.length === 0) {
        throw new Error(`Wersja Minecraft ${server.mcVersion} nie wspiera jeszcze Fabric Server.`);
      }
      const stable = loaders.find((l) => l.stable) || loaders[0];
      resolvedLoaderVersion = stable.version;
    }

    jarFileName = `fabric-server-mc.${server.mcVersion}-loader.${resolvedLoaderVersion}.jar`;
    const jarPath = path.join(dirs.serverDir, jarFileName);

    const isCachedSame =
      fs.existsSync(jarPath) &&
      fs.statSync(jarPath).size > 1024 &&
      runtimeMeta &&
      runtimeMeta.mcVersion === server.mcVersion &&
      runtimeMeta.loader === 'fabric' &&
      runtimeMeta.loaderVersion === resolvedLoaderVersion;

    if (!isCachedSame) {
      const installerVersion = await getLatestFabricInstallerVersion();
      const jarUrl = `${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(server.mcVersion)}/${encodeURIComponent(resolvedLoaderVersion)}/${encodeURIComponent(installerVersion)}/server/jar`;
      log('SYSTEM', `Pobieranie Fabric Server (${server.mcVersion} · Loader ${resolvedLoaderVersion})...`);
      await downloadFile(jarUrl, jarPath, {
        onProgress: ({ downloadedBytes, totalBytes }) => {
          const pct = totalBytes ? Math.min(92, 60 + Math.round((downloadedBytes / totalBytes) * 32)) : 75;
          emitProgress('server', pct, `Pobieranie Fabric Server JAR (${(downloadedBytes / 1048576).toFixed(1)} MB)...`);
        }
      });
    }
  } else {
    emitProgress('server', 60, `Sprawdzanie Vanilla server.jar dla ${server.mcVersion}...`);
    const serverDownload = versionJson.downloads?.server;
    if (!serverDownload || !serverDownload.url) {
      throw new Error(`Wersja Minecraft ${server.mcVersion} nie posiada pliku serwerowego Mojang.`);
    }
    jarFileName = 'server.jar';
    const jarPath = path.join(dirs.serverDir, jarFileName);
    log('SYSTEM', `Weryfikacja Vanilla server.jar dla MC ${server.mcVersion}...`);
    await downloadFile(serverDownload.url, jarPath, {
      expectedHash: serverDownload.sha1 || null,
      hashAlgo: 'sha1',
      onProgress: ({ downloadedBytes, totalBytes }) => {
        const pct = totalBytes ? Math.min(92, 60 + Math.round((downloadedBytes / totalBytes) * 32)) : 75;
        emitProgress('server', pct, `Pobieranie server.jar (${(downloadedBytes / 1048576).toFixed(1)} MB)...`);
      }
    });
  }

  emitProgress('config', 95, 'Zapisywanie eula.txt i server.properties...');
  writeEulaFile(dirs.eulaPath, true);
  writeServerProperties(dirs.propertiesPath, server, { bindHost, bindPort });

  fs.writeFileSync(
    dirs.runtimeMetaPath,
    JSON.stringify(
      {
        mcVersion: server.mcVersion,
        loader: server.loader,
        loaderVersion: resolvedLoaderVersion,
        jarFileName,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ),
    'utf8'
  );

  emitProgress('ready', 100, 'Środowisko serwera gotowe!');
  return {
    dirs,
    javaInfo,
    jarFileName,
    jarPath: path.join(dirs.serverDir, jarFileName),
    loaderVersion: resolvedLoaderVersion
  };
}

async function startServer({
  server,
  settings = {},
  dataDir,
  routerListeningOn25565 = false,
  onProgress = null,
  onLog = null,
  onStatus = null
}) {
  const rt = getOrCreateRuntime(server.id);
  if (rt.state !== 'offline') {
    throw new Error(`Serwer "${server.name}" już działa lub jest w trakcie uruchamiania.`);
  }

  const logicalPort = Number(server.port) || 25565;
  const usedBindPorts = new Set();
  for (const other of runtimes.values()) {
    if (other.serverId !== server.id && other.state !== 'offline') {
      if (Number(other.port) === logicalPort) {
        throw new Error(`Port ${logicalPort} jest obecnie zajęty przez inny uruchomiony serwer.`);
      }
      if (other.bindPort) usedBindPorts.add(Number(other.bindPort));
      if (other.port) usedBindPorts.add(Number(other.port));
    }
  }

  let resolvedBindPort = logicalPort;
  let resolvedBindHost = '';
  if (routerListeningOn25565 && logicalPort === 25565) {
    resolvedBindPort = await findFreeLoopbackPort(25600, usedBindPorts);
    resolvedBindHost = '127.0.0.1';
  } else if (usedBindPorts.has(logicalPort)) {
    resolvedBindPort = await findFreeLoopbackPort(25600, usedBindPorts);
    resolvedBindHost = '127.0.0.1';
  }

  const emitStatus = () => {
    if (onStatus) onStatus(serializeRuntimeStatus(rt));
  };

  rt.state = 'preparing';
  rt.port = logicalPort;
  rt.bindPort = resolvedBindPort;
  rt.players.clear();
  rt.startedAt = new Date().toISOString();
  rt.readyAt = null;
  rt.logs = [];
  emitStatus();

  try {
    const runtime = await prepareServerRuntime({
      server,
      settings,
      dataDir,
      bindHost: resolvedBindHost,
      bindPort: resolvedBindPort,
      onProgress,
      onLog
    });

    const ramMb = Math.max(1024, Number(server.ramMb) || 2048);
    const args = [`-Xms512M`, `-Xmx${ramMb}M`, '-XX:+UseG1GC', '-jar', runtime.jarFileName, 'nogui'];

    const bindSummary =
      resolvedBindPort !== logicalPort
        ? `domena ${server.peakDomain} (:25565 -> 127.0.0.1:${resolvedBindPort})`
        : `port ${logicalPort}`;
    appendServerLog(
      rt,
      'SYSTEM',
      `Uruchamianie ${server.peakDomain} (${server.loader.toUpperCase()} ${server.mcVersion}, ${bindSummary}, RAM ${ramMb} MB)...`,
      onLog
    );

    const child = spawn(runtime.javaInfo.path, args, {
      cwd: runtime.dirs.serverDir,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    rt.process = child;
    rt.pid = child.pid;
    rt.state = 'starting';
    emitStatus();

    const handleLine = (line, defaultLevel) => {
      if (!line.trim()) return;
      let level = defaultLevel;
      if (/\/ERROR\]|Exception|FATAL|Error:/i.test(line)) level = 'ERROR';
      else if (/\/WARN\]/i.test(line)) level = 'WARN';

      appendServerLog(rt, level, line, onLog);

      if (rt.state === 'starting' && /Done \([0-9.,]+s\)! For help, type "help"/i.test(line)) {
        rt.state = 'online';
        rt.readyAt = new Date().toISOString();
        appendServerLog(
          rt,
          'SYSTEM',
          routerListeningOn25565
            ? `Serwer ${server.peakDomain} jest ONLINE! Wpisz w Minecraft: ${server.peakDomain}`
            : `Serwer ${server.peakDomain} jest ONLINE! Adres lokalny: 127.0.0.1:${rt.bindPort || server.port}`,
          onLog
        );
        emitStatus();
      }

      const joinMatch = line.match(/:\s+([a-zA-Z0-9_]{1,16})(?:\[[^\]]*\])?\s+(?:logged in with entity id|joined the game)/i);
      if (joinMatch && joinMatch[1]) {
        rt.players.add(joinMatch[1]);
        emitStatus();
      }

      const leaveMatch = line.match(/:\s+([a-zA-Z0-9_]{1,16})\s+(?:left the game|lost connection)/i);
      if (leaveMatch && leaveMatch[1]) {
        rt.players.delete(leaveMatch[1]);
        emitStatus();
      }
    };

    const attachStream = (stream, defaultLevel) => {
      let buf = '';
      stream.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const l of lines) handleLine(l, defaultLevel);
      });
    };

    attachStream(child.stdout, 'INFO');
    attachStream(child.stderr, 'WARN');

    child.on('error', (err) => {
      rt.process = null;
      rt.pid = null;
      rt.bindPort = null;
      rt.state = 'offline';
      rt.players.clear();
      appendServerLog(rt, 'ERROR', `Błąd procesu serwera: ${err.message}`, onLog);
      stopPublicTunnel(server.id, { onStatus, onLog });
      emitStatus();
    });

    child.on('exit', (code) => {
      rt.process = null;
      rt.pid = null;
      rt.bindPort = null;
      rt.state = 'offline';
      rt.players.clear();
      appendServerLog(
        rt,
        code === 0 ? 'SYSTEM' : 'WARN',
        `Serwer ${server.peakDomain} został zatrzymany (kod ${code ?? 'null'}).`,
        onLog
      );
      stopPublicTunnel(server.id, { onStatus, onLog });
      emitStatus();
    });

    return serializeRuntimeStatus(rt);
  } catch (err) {
    rt.process = null;
    rt.pid = null;
    rt.bindPort = null;
    rt.state = 'offline';
    rt.players.clear();
    appendServerLog(rt, 'ERROR', err.message, onLog);
    emitStatus();
    throw err;
  }
}

function sendServerCommand(serverId, commandText, onLog = null) {
  const rt = getOrCreateRuntime(serverId);
  const cmd = String(commandText || '').trim().replace(/^\/+/, '');
  if (!cmd) return false;
  if (!rt.process || !rt.process.stdin || rt.state === 'offline') {
    throw new Error('Serwer nie jest uruchomiony.');
  }
  appendServerLog(rt, 'CMD', `> ${cmd}`, onLog);
  rt.process.stdin.write(`${cmd}\n`);
  return true;
}

async function stopServer(serverId, { onStatus = null, onLog = null, timeoutMs = 15000 } = {}) {
  const rt = getOrCreateRuntime(serverId);
  stopPublicTunnel(serverId, { onStatus, onLog });

  if (!rt.process || rt.state === 'offline') {
    rt.state = 'offline';
    rt.pid = null;
    if (onStatus) onStatus(serializeRuntimeStatus(rt));
    return serializeRuntimeStatus(rt);
  }

  const proc = rt.process;
  rt.state = 'stopping';
  if (onStatus) onStatus(serializeRuntimeStatus(rt));
  appendServerLog(rt, 'SYSTEM', 'Zapisywanie świata i bezpieczne zamykanie serwera (komenda stop)...', onLog);

  try {
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write('stop\n');
    }
  } catch {
    // Fallback to kill below
  }

  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    proc.once('exit', done);
    setTimeout(() => {
      if (!settled) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignore
        }
        done();
      }
    }, timeoutMs);
  });

  return serializeRuntimeStatus(rt);
}

async function restartServer({
  server,
  settings = {},
  dataDir,
  routerListeningOn25565 = false,
  onProgress = null,
  onLog = null,
  onStatus = null
}) {
  const rt = getOrCreateRuntime(server.id);
  if (rt.state !== 'offline') {
    await stopServer(server.id, { onStatus, onLog });
  }
  return startServer({
    server,
    settings,
    dataDir,
    routerListeningOn25565,
    onProgress,
    onLog,
    onStatus
  });
}

function stopPublicTunnel(serverId, { onStatus = null, onLog = null } = {}) {
  const rt = getOrCreateRuntime(serverId);
  const hadTunnel = Boolean(rt.tunnel.active || rt.tunnel.connecting || rt.tunnel.process);
  const prevPublicDomain = rt.tunnel.registryActive ? rt.tunnel.publicDomain : '';
  const prevOwnerId = rt.tunnel.ownerId || '';
  if (rt.tunnel.heartbeatTimer) {
    clearInterval(rt.tunnel.heartbeatTimer);
  }
  if (rt.tunnel.process) {
    try {
      rt.tunnel.process.kill();
    } catch {
      // Ignore
    }
  }
  rt.tunnel = {
    active: false,
    connecting: false,
    address: '',
    publicDomain: '',
    rawAddress: '',
    registryActive: false,
    provider: '',
    note: '',
    process: null,
    heartbeatTimer: null,
    ownerId: ''
  };
  if (prevPublicDomain) {
    unpublishPeakDomain({ domain: prevPublicDomain, ownerId: prevOwnerId }).catch(() => {});
  }
  if (hadTunnel) {
    appendServerLog(rt, 'SYSTEM', 'Zamknięto publiczny tunel TCP.', onLog);
    if (onStatus) onStatus(serializeRuntimeStatus(rt));
  }
  return serializeRuntimeStatus(rt).tunnel;
}

async function startPublicTunnel({
  server,
  ownerId = '',
  onStatus = null,
  onLog = null,
  onTunnel = null
}) {
  const rt = getOrCreateRuntime(server.id);
  if (rt.tunnel.active && rt.tunnel.address) {
    return serializeRuntimeStatus(rt).tunnel;
  }
  stopPublicTunnel(server.id);

  const port = Number(rt.bindPort || server.port) || 25565;
  rt.tunnel.connecting = true;
  if (onStatus) onStatus(serializeRuntimeStatus(rt));
  appendServerLog(rt, 'SYSTEM', `Otwieranie darmowego tunelu publicznego TCP dla portu ${port}...`, onLog);

  return new Promise((resolve, reject) => {
    let resolved = false;
    const child = spawn(
      'ssh',
      [
        '-p',
        '443',
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'UserKnownHostsFile=NUL',
        '-o',
        'ServerAliveInterval=30',
        '-o',
        'ExitOnForwardFailure=yes',
        '-o',
        'ConnectTimeout=10',
        '-T',
        `-R0:127.0.0.1:${port}`,
        'tcp@free.pinggy.io'
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    rt.tunnel.process = child;
    let combined = '';

    const fail = (message) => {
      if (resolved) return;
      resolved = true;
      stopPublicTunnel(server.id, { onStatus, onLog });
      reject(new Error(message));
    };

    const timer = setTimeout(() => {
      fail('Przekroczono czas oczekiwania na tunel publiczny TCP (sprawdź połączenie lub zaporę Windows).');
    }, 14000);

    const inspectOutput = (chunk) => {
      const txt = chunk.toString('utf8');
      combined += txt;
      const match = combined.match(/tcp:\/\/([a-zA-Z0-9.-]+:\d+)/);
      if (match && match[1] && !resolved) {
        resolved = true;
        clearTimeout(timer);
        const rawAddr = match[1];
        void (async () => {
          let publicDomain = server.peakDomain || '';
          let registryActive = false;
          let claimedRecord = null;
          try {
            const pub = await claimAndPublishPeakDomain({
              domain: server.peakDomain,
              slug: server.slug,
              rawAddress: rawAddr,
              serverName: server.name,
              mcVersion: server.mcVersion,
              loader: server.loader,
              ownerId
            });
            publicDomain = pub.domain;
            registryActive = Boolean(pub.registryActive);
            claimedRecord = pub.record;
          } catch {
            registryActive = false;
          }

          if (rt.tunnel.process !== child) {
            if (registryActive && publicDomain) {
              unpublishPeakDomain({ domain: publicDomain, ownerId }).catch(() => {});
            }
            return;
          }

          rt.tunnel.connecting = false;
          rt.tunnel.active = true;
          rt.tunnel.rawAddress = rawAddr;
          rt.tunnel.publicDomain = registryActive ? publicDomain : '';
          rt.tunnel.address = registryActive ? publicDomain : rawAddr;
          rt.tunnel.registryActive = registryActive;
          rt.tunnel.ownerId = ownerId;
          rt.tunnel.provider = registryActive ? 'Peak Global .peak' : 'Pinggy Free TCP';
          rt.tunnel.note = registryActive
            ? `Publiczna domena .peak aktywna (relay TCP: ${rawAddr})`
            : 'Sesja darmowa ~60 min (po wygaśnięciu kliknij ponownie)';

          if (registryActive && claimedRecord) {
            if (rt.tunnel.heartbeatTimer) clearInterval(rt.tunnel.heartbeatTimer);
            const hb = setInterval(() => {
              if (!rt.tunnel.active || rt.tunnel.process !== child) return;
              publishPeakRecord({ ...claimedRecord, ts: Date.now() }).catch(() => {});
            }, 8 * 60 * 1000);
            if (typeof hb.unref === 'function') hb.unref();
            rt.tunnel.heartbeatTimer = hb;
            appendServerLog(
              rt,
              'SYSTEM',
              `Publiczna domena .peak aktywna: ${publicDomain} (relay: ${rawAddr})`,
              onLog
            );
          } else {
            appendServerLog(rt, 'SYSTEM', `Publiczny adres tunelu gotowy: ${rawAddr}`, onLog);
          }

          const payload = serializeRuntimeStatus(rt);
          if (onTunnel) onTunnel({ serverId: server.id, tunnel: payload.tunnel });
          if (onStatus) onStatus(payload);
          resolve(payload.tunnel);
        })();
      }
    };

    child.stdout.on('data', inspectOutput);
    child.stderr.on('data', inspectOutput);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!resolved) {
        fail(
          err.code === 'ENOENT'
            ? 'Nie znaleziono klienta SSH w systemie Windows (OpenSSH Client).'
            : `Nie udało się uruchomić tunelu: ${err.message}`
        );
      }
    });

    child.on('exit', () => {
      clearTimeout(timer);
      if (!resolved) {
        fail('Tunel publiczny został zamknięty przed przydzieleniem adresu.');
      } else if (rt.tunnel.active) {
        if (rt.tunnel.heartbeatTimer) clearInterval(rt.tunnel.heartbeatTimer);
        if (rt.tunnel.registryActive && rt.tunnel.publicDomain) {
          unpublishPeakDomain({ domain: rt.tunnel.publicDomain, ownerId: rt.tunnel.ownerId }).catch(() => {});
        }
        rt.tunnel.active = false;
        rt.tunnel.connecting = false;
        rt.tunnel.address = '';
        rt.tunnel.publicDomain = '';
        rt.tunnel.rawAddress = '';
        rt.tunnel.registryActive = false;
        rt.tunnel.heartbeatTimer = null;
        rt.tunnel.process = null;
        appendServerLog(rt, 'WARN', 'Sesja tunelu publicznego zakończyła się.', onLog);
        const payload = serializeRuntimeStatus(rt);
        if (onTunnel) onTunnel({ serverId: server.id, tunnel: payload.tunnel });
        if (onStatus) onStatus(payload);
      }
    });
  });
}

async function stopAllServers() {
  const stopPromises = [];
  for (const [id, rt] of runtimes.entries()) {
    stopPublicTunnel(id);
    if (rt.process && rt.state !== 'offline') {
      stopPromises.push(stopServer(id, { timeoutMs: 5000 }).catch(() => {}));
    }
  }
  await Promise.allSettled(stopPromises);
}

function buildPeakInvitePayload({ server, dataDir }) {
  const dirs = getServerDirs(dataDir, server.id);
  const mods = listModsInDirectory(dirs.modsDir, dirs.modsMetaPath).filter((m) => m.enabled);
  const metaMap = readMetadataFile(dirs.modsMetaPath);
  const rt = getServerRuntimeStatus(server.id);
  const lanIp = getLocalLanIp();
  const port = Number(server.port) || 25565;

  const activeRaw = rt.tunnel.active ? rt.tunnel.rawAddress || rt.tunnel.address : '';
  const activeDomain = rt.tunnel.active ? rt.tunnel.publicDomain || server.peakDomain : server.peakDomain;
  const preferredAddress = activeRaw || `${lanIp}:${port}`;

  return {
    format: 'peak-server-v1',
    createdAt: new Date().toISOString(),
    serverName: server.name,
    peakDomain: activeDomain,
    slug: server.slug,
    mcVersion: server.mcVersion,
    loader: server.loader,
    fabricVersion: server.fabricVersion || 'latest',
    port,
    onlineMode: Boolean(server.onlineMode),
    address: preferredAddress,
    tunnelAddress: activeRaw,
    lanAddress: `${lanIp}:${port}`,
    localAddress: `127.0.0.1:${port}`,
    mods: mods.map((m) => {
      const meta = metaMap[m.baseFileName] || {};
      return {
        fileName: m.baseFileName,
        title: m.name || m.baseFileName,
        projectId: m.projectId || meta.projectId || null,
        versionId: m.versionId || meta.versionId || null,
        clientSide: m.clientSide || meta.clientSide || '',
        serverSide: m.serverSide || meta.serverSide || ''
      };
    })
  };
}

function parsePeakInviteFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Nie znaleziono wybranego pliku zaproszenia .peak.');
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error('Plik zaproszenia .peak jest uszkodzony lub ma nieprawidłowy format JSON.');
  }
  if (!parsed || parsed.format !== 'peak-server-v1' || !parsed.mcVersion) {
    throw new Error('Nieobsługiwany format pliku .peak.');
  }
  const address = String(parsed.address || parsed.tunnelAddress || parsed.lanAddress || parsed.localAddress || '').trim();
  if (!address) {
    throw new Error('Plik zaproszenia .peak nie zawiera adresu połączenia.');
  }
  return {
    ...parsed,
    address,
    loader: parsed.loader === 'vanilla' ? 'vanilla' : 'fabric',
    mods: Array.isArray(parsed.mods) ? parsed.mods : []
  };
}

module.exports = {
  getLocalLanIp,
  findFreeLoopbackPort,
  readServerProperties,
  writeServerProperties,
  writeEulaFile,
  getLatestFabricInstallerVersion,
  prepareServerRuntime,
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
};
