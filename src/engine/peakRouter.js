const net = require('net');
const { EventEmitter } = require('events');

const MAX_HANDSHAKE_BUFFER = 16384;
const HANDSHAKE_TIMEOUT_MS = 5000;
const OFFLINE_IDLE_TIMEOUT_MS = 8000;

function readVarInt(buffer, offset = 0) {
  let numRead = 0;
  let result = 0;
  while (offset + numRead < buffer.length) {
    const read = buffer[offset + numRead];
    const value = read & 0x7f;
    result |= value << (7 * numRead);
    numRead += 1;
    if (numRead > 5) {
      throw new Error('VarInt is too big');
    }
    if ((read & 0x80) === 0) {
      return { value: result >>> 0, bytesRead: numRead };
    }
  }
  return null;
}

function encodeVarInt(value) {
  let val = value >>> 0;
  const bytes = [];
  do {
    let temp = val & 0x7f;
    val >>>= 7;
    if (val !== 0) {
      temp |= 0x80;
    }
    bytes.push(temp);
  } while (val !== 0);
  return Buffer.from(bytes);
}

function encodeMcString(text) {
  const utf8 = Buffer.from(String(text || ''), 'utf8');
  return Buffer.concat([encodeVarInt(utf8.length), utf8]);
}

function encodePacket(packetId, payloadBuffer = Buffer.alloc(0)) {
  const idBuf = encodeVarInt(packetId);
  const body = Buffer.concat([idBuf, payloadBuffer]);
  return Buffer.concat([encodeVarInt(body.length), body]);
}

function normalizeServerAddress(rawAddress) {
  let value = String(rawAddress || '');
  const nullIndex = value.indexOf('\0');
  if (nullIndex >= 0) {
    value = value.slice(0, nullIndex);
  }
  value = value.trim().toLowerCase();
  while (value.endsWith('.') && value.length > 1) {
    value = value.slice(0, -1);
  }
  return value;
}

function isPeakDomainName(domain) {
  if (!domain) return false;
  return domain === 'peak' || (domain.endsWith('.peak') && domain.length > 5 && !domain.startsWith('.'));
}

function parseHandshakePacket(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return null;
  }
  if (buffer[0] === 0xfe) {
    return {
      type: 'legacy',
      consumedBytes: buffer.length
    };
  }

  const lenInfo = readVarInt(buffer, 0);
  if (!lenInfo) return null;
  const packetLength = lenInfo.value;
  if (packetLength <= 0 || packetLength > MAX_HANDSHAKE_BUFFER) {
    throw new Error(`Invalid handshake packet length: ${packetLength}`);
  }
  const totalNeeded = lenInfo.bytesRead + packetLength;
  if (buffer.length < totalNeeded) {
    return null;
  }

  const packetBody = buffer.subarray(lenInfo.bytesRead, totalNeeded);
  let cursor = 0;

  const idInfo = readVarInt(packetBody, cursor);
  if (!idInfo) throw new Error('Truncated handshake packetId');
  cursor += idInfo.bytesRead;
  if (idInfo.value !== 0x00) {
    throw new Error(`Unexpected initial packetId: 0x${idInfo.value.toString(16)}`);
  }

  const protoInfo = readVarInt(packetBody, cursor);
  if (!protoInfo) throw new Error('Truncated handshake protocolVersion');
  cursor += protoInfo.bytesRead;

  const addrLenInfo = readVarInt(packetBody, cursor);
  if (!addrLenInfo) throw new Error('Truncated handshake address length');
  cursor += addrLenInfo.bytesRead;
  if (cursor + addrLenInfo.value > packetBody.length) {
    throw new Error('Truncated handshake serverAddress');
  }
  const rawServerAddress = packetBody.subarray(cursor, cursor + addrLenInfo.value).toString('utf8');
  cursor += addrLenInfo.value;

  if (cursor + 2 > packetBody.length) {
    throw new Error('Truncated handshake serverPort');
  }
  const serverPort = packetBody.readUInt16BE(cursor);
  cursor += 2;

  const stateInfo = readVarInt(packetBody, cursor);
  if (!stateInfo) throw new Error('Truncated handshake nextState');

  return {
    type: 'handshake',
    consumedBytes: totalNeeded,
    packetLength,
    protocolVersion: protoInfo.value,
    rawServerAddress,
    serverAddress: normalizeServerAddress(rawServerAddress),
    serverPort,
    nextState: stateInfo.value
  };
}

class PeakDomainRouter extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.listenHost = '0.0.0.0';
    this.listenPort = 25565;
    this.listening = false;
    this.error = null;
    this.routesByDomain = new Map();
    this.defaultRoute = null;
    this.remoteResolver = null;
    this.activeSockets = new Set();
    this.activeConnections = 0;
    this.totalRouted = 0;
    this.lastEvent = null;
  }

  setRoutes(routeList = []) {
    const map = new Map();
    let defaultCandidate = null;
    for (const raw of routeList) {
      if (!raw) continue;
      const domain = normalizeServerAddress(raw.domain || raw.peakDomain);
      if (!domain) continue;
      const entry = {
        domain,
        name: String(raw.name || domain),
        serverId: raw.serverId || null,
        targetHost: String(raw.targetHost || '127.0.0.1'),
        targetPort: Number(raw.targetPort) || 0,
        running: Boolean(raw.running),
        starting: Boolean(raw.starting),
        mcVersion: raw.mcVersion || null,
        maxPlayers: Number(raw.maxPlayers) || 20,
        isExternal: Boolean(raw.isExternal),
        isDefault: Boolean(raw.isDefault)
      };
      map.set(domain, entry);
      if (entry.isDefault && entry.running) {
        defaultCandidate = entry;
      } else if (!defaultCandidate && entry.running && !entry.isExternal) {
        defaultCandidate = entry;
      }
    }
    this.routesByDomain = map;
    this.defaultRoute = defaultCandidate;
    this.emit('status', this.getStatus());
  }

  setRemoteResolver(fn) {
    this.remoteResolver = typeof fn === 'function' ? fn : null;
    this.emit('status', this.getStatus());
  }

  resolveTargetForHandshake(handshake) {
    if (!handshake || handshake.type === 'legacy') {
      return {
        route: this.defaultRoute,
        reason: this.defaultRoute ? 'default-legacy' : 'no-default-server'
      };
    }

    const domain = handshake.serverAddress;
    if (this.routesByDomain.has(domain)) {
      const route = this.routesByDomain.get(domain);
      return {
        route,
        reason: route.running ? 'matched-domain' : (route.starting ? 'server-starting' : 'server-offline')
      };
    }

    if (isPeakDomainName(domain)) {
      return {
        route: {
          domain,
          name: domain,
          running: false,
          starting: false,
          maxPlayers: 20,
          unknownDomain: true
        },
        reason: 'unknown-peak-domain'
      };
    }

    if (this.defaultRoute && this.defaultRoute.running) {
      return {
        route: this.defaultRoute,
        reason: 'default-non-peak'
      };
    }

    return {
      route: null,
      reason: 'no-default-server'
    };
  }

  getStatus() {
    return {
      listening: this.listening,
      host: this.listenHost,
      port: this.listenPort,
      error: this.error,
      routeCount: this.routesByDomain.size,
      hasDefaultRoute: Boolean(this.defaultRoute && this.defaultRoute.running),
      defaultDomain: this.defaultRoute ? this.defaultRoute.domain : null,
      remoteResolverActive: Boolean(this.remoteResolver),
      activeConnections: this.activeConnections,
      totalRouted: this.totalRouted,
      lastEvent: this.lastEvent
    };
  }

  async start(port = 25565, host = '0.0.0.0') {
    const requestedPort =
      port === undefined || port === null || port === ''
        ? 25565
        : Number(port) === 0
          ? 0
          : (Number(port) > 0 && Number.isFinite(Number(port)) ? Number(port) : 25565);
    const requestedHost = host || '0.0.0.0';
    if (
      this.server &&
      this.listening &&
      this.listenPort === requestedPort &&
      this.listenHost === requestedHost
    ) {
      return this.getStatus();
    }
    await this.stop();

    this.listenPort = requestedPort;
    this.listenHost = requestedHost;
    this.error = null;

    return new Promise((resolve) => {
      const srv = net.createServer((clientSocket) => this._handleIncomingSocket(clientSocket));
      this.server = srv;

      const onInitialError = (err) => {
        this.listening = false;
        this.error = err && (err.code || err.message) ? `${err.code || 'ERR'}: ${err.message}` : 'Listen error';
        try {
          srv.close();
        } catch {}
        if (this.server === srv) {
          this.server = null;
        }
        this.emit('status', this.getStatus());
        resolve(this.getStatus());
      };

      srv.once('error', onInitialError);
      srv.listen({ port: this.listenPort, host: this.listenHost, exclusive: true }, () => {
        srv.removeListener('error', onInitialError);
        const bound = srv.address();
        if (bound && typeof bound === 'object') {
          this.listenPort = bound.port;
        }
        this.listening = true;
        this.error = null;
        srv.on('error', (err) => {
          this.error = err?.message || String(err);
          this.emit('status', this.getStatus());
        });
        this.emit('status', this.getStatus());
        resolve(this.getStatus());
      });
    });
  }

  async stop() {
    for (const sock of this.activeSockets) {
      try {
        sock.destroy();
      } catch {}
    }
    this.activeSockets.clear();
    this.activeConnections = 0;

    const srv = this.server;
    this.server = null;
    this.listening = false;
    if (!srv) {
      this.emit('status', this.getStatus());
      return;
    }

    await new Promise((resolve) => {
      try {
        srv.close(() => resolve());
      } catch {
        resolve();
      }
    });
    this.emit('status', this.getStatus());
  }

  _trackSocket(socket) {
    this.activeSockets.add(socket);
    this.activeConnections = this.activeSockets.size;
    const cleanup = () => {
      if (this.activeSockets.delete(socket)) {
        this.activeConnections = this.activeSockets.size;
      }
    };
    socket.once('close', cleanup);
    socket.once('error', cleanup);
  }

  _handleIncomingSocket(clientSocket) {
    this._trackSocket(clientSocket);
    clientSocket.setNoDelay(true);

    let initialBuffer = Buffer.alloc(0);
    let settled = false;

    const handshakeTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        clientSocket.destroy();
      }
    }, HANDSHAKE_TIMEOUT_MS);

    const onData = (chunk) => {
      if (settled) return;
      initialBuffer = initialBuffer.length === 0 ? chunk : Buffer.concat([initialBuffer, chunk]);
      if (initialBuffer.length > MAX_HANDSHAKE_BUFFER) {
        settled = true;
        clearTimeout(handshakeTimer);
        clientSocket.removeListener('data', onData);
        clientSocket.destroy();
        return;
      }

      let handshake;
      try {
        handshake = parseHandshakePacket(initialBuffer);
      } catch {
        settled = true;
        clearTimeout(handshakeTimer);
        clientSocket.removeListener('data', onData);
        clientSocket.destroy();
        return;
      }

      if (!handshake) {
        return;
      }

      settled = true;
      clearTimeout(handshakeTimer);
      clientSocket.removeListener('data', onData);

      const resolution = this.resolveTargetForHandshake(handshake);
      this.lastEvent = {
        at: new Date().toISOString(),
        requestedAddress: handshake.serverAddress || (handshake.type === 'legacy' ? 'legacy-ping' : ''),
        nextState: handshake.nextState || 0,
        reason: resolution.reason,
        target: resolution.route && resolution.route.running
          ? `${resolution.route.targetHost}:${resolution.route.targetPort}`
          : null
      };

      if (resolution.route && resolution.route.running && resolution.route.targetPort > 0) {
        clientSocket.pause();
        this._proxyToBackend(clientSocket, initialBuffer, resolution.route);
        return;
      }

      if (handshake.type === 'legacy') {
        clientSocket.end();
        return;
      }

      const shouldLookupRemote =
        handshake.type === 'handshake' &&
        isPeakDomainName(handshake.serverAddress) &&
        this.remoteResolver &&
        (resolution.reason === 'unknown-peak-domain' ||
          (resolution.reason === 'server-offline' && !resolution.route?.isExternal));

      if (shouldLookupRemote) {
        clientSocket.pause();
        Promise.resolve()
          .then(() => this.remoteResolver(handshake.serverAddress))
          .catch(() => null)
          .then((remoteRoute) => {
            if (clientSocket.destroyed) return;
            if (remoteRoute && remoteRoute.running && remoteRoute.targetHost && remoteRoute.targetPort > 0) {
              this.lastEvent = {
                at: new Date().toISOString(),
                requestedAddress: handshake.serverAddress,
                nextState: handshake.nextState || 0,
                reason: 'matched-global-directory',
                target: `${remoteRoute.targetHost}:${remoteRoute.targetPort}`
              };
              this._proxyToBackend(clientSocket, initialBuffer, remoteRoute);
              return;
            }
            this._serveOfflineResponse(clientSocket, handshake, initialBuffer, resolution);
            clientSocket.resume();
          });
        return;
      }

      this._serveOfflineResponse(clientSocket, handshake, initialBuffer, resolution);
    };

    clientSocket.on('data', onData);
    clientSocket.once('error', () => {
      clearTimeout(handshakeTimer);
    });
    clientSocket.once('close', () => {
      clearTimeout(handshakeTimer);
    });
  }

  _proxyToBackend(clientSocket, initialBuffer, route) {
    this.totalRouted += 1;
    this.emit('status', this.getStatus());

    const upstream = net.createConnection({
      host: route.targetHost,
      port: route.targetPort
    });
    this._trackSocket(upstream);
    upstream.setNoDelay(true);

    let connected = false;

    const cleanupBoth = () => {
      if (!clientSocket.destroyed) clientSocket.destroy();
      if (!upstream.destroyed) upstream.destroy();
    };

    upstream.once('connect', () => {
      connected = true;
      if (clientSocket.destroyed) {
        upstream.destroy();
        return;
      }
      upstream.write(initialBuffer);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
      clientSocket.resume();
    });

    upstream.once('error', () => {
      if (!connected) {
        try {
          clientSocket.end();
        } catch {}
      } else {
        cleanupBoth();
      }
    });

    clientSocket.once('error', cleanupBoth);
    clientSocket.once('close', () => {
      if (!upstream.destroyed) upstream.end();
    });
    upstream.once('close', () => {
      if (!clientSocket.destroyed) clientSocket.end();
    });
  }

  _serveOfflineResponse(clientSocket, handshake, initialBuffer, resolution) {
    const route = resolution.route;
    const domain = route?.domain || handshake.serverAddress || 'server.peak';
    const serverName = route?.name || domain;

    let statusLine = `§7Domena §b${domain} §7jest offline — uruchom serwer w Peak Launcher`;
    let versionLabel = 'Peak Offline';
    let loginMessage = `Serwer ${domain} jest obecnie offline. Uruchom go w Peak Launcher -> Hosting .peak.`;

    if (resolution.reason === 'server-starting') {
      versionLabel = 'Peak Uruchamianie...';
      statusLine = `§eSerwer §b${domain} §ewłaśnie się uruchamia...`;
      loginMessage = `Serwer ${domain} jest w trakcie uruchamiania. Spróbuj ponownie za kilka sekund.`;
    } else if (resolution.reason === 'unknown-peak-domain') {
      versionLabel = 'Nieznana domena .peak';
      statusLine = `§cDomena §b${domain} §cnie jest zarejestrowana w tym Peak Launcherze.`;
      loginMessage = `Nie znaleziono trasy dla domeny ${domain}. Dodaj ją w Hosting .peak -> Udostępnianie .peak.`;
    } else if (resolution.reason === 'no-default-server') {
      versionLabel = 'Brak aktywnego serwera';
      statusLine = '§7Żaden lokalny serwer .peak nie działa na porcie 25565.';
      loginMessage = 'Brak uruchomionego serwera w Peak Launcherze.';
    }

    if (handshake.nextState === 2 || handshake.nextState === 3) {
      const disconnectJson = JSON.stringify({
        text: loginMessage,
        color: 'red'
      });
      const pkt = encodePacket(0x00, encodeMcString(disconnectJson));
      clientSocket.end(pkt);
      return;
    }

    if (handshake.nextState !== 1) {
      clientSocket.end();
      return;
    }

    let pending = initialBuffer.subarray(handshake.consumedBytes);
    const idleTimer = setTimeout(() => {
      if (!clientSocket.destroyed) clientSocket.end();
    }, OFFLINE_IDLE_TIMEOUT_MS);

    const processPending = () => {
      while (pending.length > 0) {
        let lenInfo;
        try {
          lenInfo = readVarInt(pending, 0);
        } catch {
          clientSocket.destroy();
          return;
        }
        if (!lenInfo) return;
        const pktLen = lenInfo.value;
        if (pktLen <= 0 || pktLen > MAX_HANDSHAKE_BUFFER) {
          clientSocket.destroy();
          return;
        }
        const total = lenInfo.bytesRead + pktLen;
        if (pending.length < total) return;

        const body = pending.subarray(lenInfo.bytesRead, total);
        pending = pending.subarray(total);

        let idInfo;
        try {
          idInfo = readVarInt(body, 0);
        } catch {
          clientSocket.destroy();
          return;
        }
        if (!idInfo) continue;

        if (idInfo.value === 0x00) {
          const statusObj = {
            version: {
              name: versionLabel,
              protocol: -1
            },
            players: {
              max: route?.maxPlayers || 20,
              online: 0,
              sample: []
            },
            description: {
              text: `§b● Peak Launcher §8| §f${serverName}\n${statusLine}`
            }
          };
          clientSocket.write(encodePacket(0x00, encodeMcString(JSON.stringify(statusObj))));
        } else if (idInfo.value === 0x01) {
          const payload = body.subarray(idInfo.bytesRead);
          clientSocket.end(encodePacket(0x01, payload));
          clearTimeout(idleTimer);
          return;
        }
      }
    };

    clientSocket.on('data', (chunk) => {
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      if (pending.length > MAX_HANDSHAKE_BUFFER) {
        clearTimeout(idleTimer);
        clientSocket.destroy();
        return;
      }
      processPending();
    });
    clientSocket.once('close', () => clearTimeout(idleTimer));
    clientSocket.once('error', () => clearTimeout(idleTimer));

    processPending();
  }
}

const peakRouter = new PeakDomainRouter();

module.exports = {
  PeakDomainRouter,
  peakRouter,
  readVarInt,
  encodeVarInt,
  encodeMcString,
  encodePacket,
  normalizeServerAddress,
  isPeakDomainName,
  parseHandshakePacket
};
