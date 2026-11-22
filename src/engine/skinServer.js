const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { downloadFile } = require('./download');
const { ensureDir, getPaths } = require('./paths');
const { getAccountSkinInfo } = require('./skinManager');

const AUTHLIB_VERSION = '1.2.8';
const AUTHLIB_URL = 'https://authlib-injector.yushi.moe/artifact/56/authlib-injector-1.2.8.jar';
const AUTHLIB_SHA256 = '9c7f4343e6c82034958ffb48c14a2cb0c85928be7283103ce17da00c6d5a7b10';

async function ensureAuthlibInjector(dataDir, onProgress = null) {
  const { cacheDir } = getPaths(dataDir);
  ensureDir(cacheDir);
  const destPath = path.join(cacheDir, `authlib-injector-${AUTHLIB_VERSION}.jar`);
  await downloadFile(AUTHLIB_URL, destPath, {
    expectedHash: AUTHLIB_SHA256,
    hashAlgo: 'sha256',
    onProgress
  });
  return destPath;
}

function ensureYggdrasilKeyPair(dataDir) {
  const { skinsDir } = getPaths(dataDir);
  ensureDir(skinsDir);
  const keyPath = path.join(skinsDir, 'yggdrasil-key.json');

  try {
    if (fs.existsSync(keyPath)) {
      const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      if (parsed && parsed.publicKey && parsed.privateKey) {
        return parsed;
      }
    }
  } catch {
    // Regenerate corrupted keypair below
  }

  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const tmpPath = `${keyPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(pair, null, 2), 'utf8');
  fs.renameSync(tmpPath, keyPath);
  return pair;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

function startLocalSkinServer({ dataDir, accounts = [] }) {
  const keyPair = ensureYggdrasilKeyPair(dataDir);
  const { skinsLibraryDir } = getPaths(dataDir);

  const metaPayload = {
    meta: {
      serverName: 'Peak Launcher',
      implementationName: 'peak-yggdrasil',
      implementationVersion: '1.0.0',
      'feature.non_email_login': true
    },
    skinDomains: ['127.0.0.1', 'localhost'],
    signaturePublickey: keyPair.publicKey
  };
  const prefetchedBase64 = Buffer.from(JSON.stringify(metaPayload), 'utf8').toString('base64');

  const signPropertyValue = (valueBase64) =>
    crypto.createSign('RSA-SHA1').update(valueBase64, 'utf8').sign(keyPair.privateKey, 'base64');

  const findAccountByUuid = (rawUuid) => {
    const clean = String(rawUuid || '').replace(/-/g, '').toLowerCase();
    return accounts.find((a) => String(a.uuid || '').replace(/-/g, '').toLowerCase() === clean) || null;
  };

  const findAccountByName = (name) => {
    const lower = String(name || '').trim().toLowerCase();
    return accounts.find((a) => String(a.username || '').toLowerCase() === lower) || null;
  };

  let serverPort = 0;

  const buildProfilePayload = (acc) => {
    const uuidHex = String(acc.uuid || '').replace(/-/g, '').toLowerCase();
    const skinInfo = getAccountSkinInfo(dataDir, acc);
    const properties = [];

    if (skinInfo.hasCustomSkin && skinInfo.sha256) {
      const textureJson = {
        timestamp: Date.now(),
        profileId: uuidHex,
        profileName: acc.username,
        signatureRequired: true,
        textures: {
          SKIN: {
            url: `http://127.0.0.1:${serverPort}/textures/${skinInfo.sha256}.png`,
            ...(skinInfo.skinModel === 'slim' ? { metadata: { model: 'slim' } } : {})
          }
        }
      };
      const value = Buffer.from(JSON.stringify(textureJson), 'utf8').toString('base64');
      const signature = signPropertyValue(value);
      properties.push({ name: 'textures', value, signature });
    }

    return {
      id: uuidHex,
      name: acc.username,
      properties,
      profileActions: []
    };
  };

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    if (req.method === 'GET' && (pathname === '/' || pathname === '')) {
      return sendJson(res, 200, metaPayload);
    }

    const texMatch = pathname.match(/^\/textures\/([a-f0-9]{64})\.png$/i);
    if (req.method === 'GET' && texMatch) {
      const hash = texMatch[1].toLowerCase();
      for (const acc of accounts) {
        const info = getAccountSkinInfo(dataDir, acc);
        if (info.hasCustomSkin && info.sha256 === hash && info.skinPath && fs.existsSync(info.skinPath)) {
          const buf = fs.readFileSync(info.skinPath);
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': buf.length,
            'Cache-Control': 'no-store'
          });
          return res.end(buf);
        }
      }
      const libPath = path.join(skinsLibraryDir, `${hash}.png`);
      if (fs.existsSync(libPath)) {
        const buf = fs.readFileSync(libPath);
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': buf.length,
          'Cache-Control': 'no-store'
        });
        return res.end(buf);
      }
      res.writeHead(404);
      return res.end();
    }

    const profileMatch = pathname.match(/^\/sessionserver\/session\/minecraft\/profile\/([a-f0-9-]+)$/i);
    if (req.method === 'GET' && profileMatch) {
      const acc = findAccountByUuid(profileMatch[1]);
      if (!acc) {
        res.writeHead(204);
        return res.end();
      }
      return sendJson(res, 200, buildProfilePayload(acc));
    }

    if (pathname === '/sessionserver/session/minecraft/hasJoined') {
      const username = reqUrl.searchParams.get('username');
      const acc = findAccountByName(username);
      if (acc) {
        return sendJson(res, 200, buildProfilePayload(acc));
      }
      res.writeHead(204);
      return res.end();
    }

    if (pathname === '/sessionserver/session/minecraft/join') {
      await readJsonBody(req);
      res.writeHead(204);
      return res.end();
    }

    if (
      req.method === 'POST' &&
      (pathname === '/api/profiles/minecraft' ||
        pathname === '/minecraftservices/minecraft/profile/lookup/bulk/byname')
    ) {
      const names = await readJsonBody(req);
      const list = Array.isArray(names)
        ? names
            .map((n) => findAccountByName(n))
            .filter(Boolean)
            .map((a) => ({
              id: String(a.uuid || '').replace(/-/g, '').toLowerCase(),
              name: a.username
            }))
        : [];
      return sendJson(res, 200, list);
    }

    const nameLookupMatch = pathname.match(/^\/minecraftservices\/minecraft\/profile\/lookup\/name\/([^/]+)$/i);
    if (req.method === 'GET' && nameLookupMatch) {
      const acc = findAccountByName(decodeURIComponent(nameLookupMatch[1]));
      if (!acc) {
        res.writeHead(404);
        return res.end();
      }
      return sendJson(res, 200, {
        id: String(acc.uuid || '').replace(/-/g, '').toLowerCase(),
        name: acc.username
      });
    }

    if (req.method === 'GET' && pathname === '/minecraftservices/minecraft/profile') {
      const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      const acc = findAccountByUuid(auth) || accounts[0];
      if (!acc) {
        res.writeHead(404);
        return res.end();
      }
      const info = getAccountSkinInfo(dataDir, acc);
      const uuidHex = String(acc.uuid || '').replace(/-/g, '').toLowerCase();
      return sendJson(res, 200, {
        id: uuidHex,
        name: acc.username,
        skins: info.hasCustomSkin
          ? [
              {
                id: uuidHex,
                state: 'ACTIVE',
                url: `http://127.0.0.1:${serverPort}/textures/${info.sha256}.png`,
                variant: info.skinModel === 'slim' ? 'SLIM' : 'CLASSIC'
              }
            ]
          : [],
        capes: []
      });
    }

    if (req.method === 'GET' && pathname === '/minecraftservices/player/attributes') {
      return sendJson(res, 200, {
        privileges: {
          onlineChat: { enabled: true },
          multiplayerServer: { enabled: true },
          multiplayerRealms: { enabled: true },
          telemetry: { enabled: false },
          optionalTelemetry: { enabled: false }
        },
        profanityFilterPreferences: { profanityFilterOn: false },
        banStatus: { bannedScopes: {} }
      });
    }

    if (pathname === '/minecraftservices/privacy/blocklist') {
      return sendJson(res, 200, { blockedProfiles: [] });
    }

    res.writeHead(204);
    return res.end();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve({
        port: serverPort,
        apiUrl: `http://127.0.0.1:${serverPort}`,
        prefetchedBase64,
        keyPair,
        close: () =>
          new Promise((resClose) => {
            try {
              server.close(() => resClose());
            } catch {
              resClose();
            }
          })
      });
    });
  });
}

module.exports = {
  AUTHLIB_VERSION,
  AUTHLIB_URL,
  AUTHLIB_SHA256,
  ensureAuthlibInjector,
  ensureYggdrasilKeyPair,
  startLocalSkinServer
};
