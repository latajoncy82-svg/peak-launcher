const crypto = require('crypto');

const DEFAULT_DIRECTORY_URL = 'https://ntfy.sh';
const HIT_CACHE_TTL_MS = 20000;
const MISS_CACHE_TTL_MS = 5000;

const lookupCache = new Map();

function getDirectoryBaseUrl(overrideUrl) {
  const raw = overrideUrl || process.env.PEAK_DIRECTORY_URL || DEFAULT_DIRECTORY_URL;
  return String(raw).trim().replace(/\/+$/, '');
}

function normalizePeakDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  while (s.endsWith('.') && s.length > 1) {
    s = s.slice(0, -1);
  }
  return s;
}

function topicForPeakDomain(domain) {
  const normalized = normalizePeakDomain(domain);
  const digest = crypto
    .createHash('sha256')
    .update(`peak-launcher-dns-v1:${normalized}`)
    .digest('hex')
    .slice(0, 24);
  return `peak-dns-v1-${digest}`;
}

function parseHostPort(rawAddress) {
  const s = String(rawAddress || '').trim();
  if (!s) return null;
  if (s.startsWith('[')) {
    const closeIdx = s.indexOf(']');
    if (closeIdx === -1) return null;
    const host = s.slice(1, closeIdx).trim();
    const rest = s.slice(closeIdx + 1).trim();
    if (!rest.startsWith(':')) return null;
    const port = Number(rest.slice(1));
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host, port };
  }
  const colonIdx = s.lastIndexOf(':');
  if (colonIdx <= 0) return null;
  const host = s.slice(0, colonIdx).trim();
  const port = Number(s.slice(colonIdx + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

function isAllowedPublicTarget(host, port, { allowPrivate = false } = {}) {
  const portNum = Number(port);
  if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
    return false;
  }

  const h = String(host || '').trim().toLowerCase().replace(/\.+$/, '');
  if (h.length < 3 || h.length > 253) return false;
  if (!/^[a-z0-9.-]+$/.test(h)) return false;
  if (h.startsWith('.') || h.startsWith('-') || h.includes('..')) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return false;
  }
  if (h === 'peak' || h.endsWith('.peak')) {
    return false;
  }
  if (!h.includes('.')) {
    return false;
  }

  const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((n) => Number(n));
    if (octets.some((o) => o < 0 || o > 255)) return false;
    if (!allowPrivate) {
      const [o1, o2] = octets;
      if (o1 === 0 || o1 === 10 || o1 === 127) return false;
      if (o1 === 169 && o2 === 254) return false;
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return false;
      if (o1 === 192 && o2 === 168) return false;
      if (o1 === 100 && o2 >= 64 && o2 <= 127) return false;
    }
  }

  return true;
}

function encodeRecord(obj) {
  return `PEAK1:${Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')}`;
}

function decodeRecord(text) {
  if (typeof text !== 'string' || !text.startsWith('PEAK1:')) {
    return null;
  }
  try {
    const rawJson = Buffer.from(text.slice(6).trim(), 'base64url').toString('utf8');
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearDirectoryCache() {
  lookupCache.clear();
}

async function lookupPublicPeakDomain(
  domain,
  { bypassCache = false, baseUrl, allowPrivate = false, timeoutMs = 4000 } = {}
) {
  const normalized = normalizePeakDomain(domain);
  if (!normalized || (!normalized.endsWith('.peak') && normalized !== 'peak')) {
    return null;
  }

  const cleanBase = getDirectoryBaseUrl(baseUrl);
  const cacheKey = `${cleanBase}|${allowPrivate ? '1' : '0'}|${normalized}`;
  const now = Date.now();
  if (!bypassCache && lookupCache.has(cacheKey)) {
    const cached = lookupCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    lookupCache.delete(cacheKey);
  }

  const topic = topicForPeakDomain(normalized);
  try {
    const res = await fetch(`${cleanBase}/${topic}/json?poll=1&since=all`, {
      method: 'GET',
      headers: {
        'User-Agent': 'PeakLauncher/1.7.0'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      lookupCache.set(cacheKey, { expiresAt: now + MISS_CACHE_TTL_MS, value: null });
      return null;
    }

    const body = await res.text();
    const lines = body.split(/\r?\n/).filter(Boolean);
    let newest = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      let msg;
      try {
        const event = JSON.parse(lines[i]);
        msg = event?.message;
      } catch {
        continue;
      }
      const rec = decodeRecord(msg);
      if (!rec) continue;
      if (normalizePeakDomain(rec.domain) !== normalized) continue;
      if (!newest || Number(rec.ts || 0) >= Number(newest.ts || 0)) {
        newest = rec;
        if (i === lines.length - 1) break;
      }
    }

    if (!newest || newest.online !== true) {
      lookupCache.set(cacheKey, { expiresAt: Date.now() + MISS_CACHE_TTL_MS, value: null });
      return null;
    }

    const ttlMs = Math.min(3600, Math.max(60, Number(newest.ttlSec) || 900)) * 1000;
    if (Date.now() - Number(newest.ts || 0) > ttlMs) {
      lookupCache.set(cacheKey, { expiresAt: Date.now() + MISS_CACHE_TTL_MS, value: null });
      return null;
    }

    if (!isAllowedPublicTarget(newest.host, newest.port, { allowPrivate })) {
      lookupCache.set(cacheKey, { expiresAt: Date.now() + MISS_CACHE_TTL_MS, value: null });
      return null;
    }

    const route = {
      domain: normalized,
      name: String(newest.name || normalized),
      targetHost: String(newest.host).trim().toLowerCase(),
      targetPort: Number(newest.port),
      running: true,
      starting: false,
      mcVersion: newest.mcVersion || null,
      maxPlayers: 20,
      isExternal: true,
      isGlobalDirectory: true,
      owner: String(newest.owner || ''),
      ts: Number(newest.ts || Date.now())
    };
    lookupCache.set(cacheKey, { expiresAt: Date.now() + HIT_CACHE_TTL_MS, value: route });
    return route;
  } catch {
    lookupCache.set(cacheKey, { expiresAt: Date.now() + MISS_CACHE_TTL_MS, value: null });
    return null;
  }
}

async function publishPeakRecord(record, { baseUrl, timeoutMs = 5000 } = {}) {
  const cleanBase = getDirectoryBaseUrl(baseUrl);
  const topic = topicForPeakDomain(record.domain);
  const payload = encodeRecord(record);
  const res = await fetch(`${cleanBase}/${topic}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Cache: 'yes',
      'User-Agent': 'PeakLauncher/1.7.0'
    },
    body: payload,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) {
    throw new Error(`Błąd publikacji domeny .peak (${res.status})`);
  }
  return true;
}

async function claimAndPublishPeakDomain({
  domain,
  slug,
  rawAddress,
  serverName,
  mcVersion,
  loader,
  ownerId = '',
  baseUrl,
  allowPrivate = false
} = {}) {
  const parsed = parseHostPort(rawAddress);
  if (!parsed || !isAllowedPublicTarget(parsed.host, parsed.port, { allowPrivate })) {
    throw new Error('Nieprawidłowy lub niedozwolony docelowy adres tunelu.');
  }

  const cleanOwner = String(ownerId || '').trim();
  const preferredDomain = normalizePeakDomain(domain || `${slug || 'server'}.peak`);
  let chosenDomain = preferredDomain;

  const existing = await lookupPublicPeakDomain(preferredDomain, {
    bypassCache: true,
    baseUrl,
    allowPrivate
  }).catch(() => null);

  if (existing && existing.owner && existing.owner !== cleanOwner) {
    const baseSlug = String(slug || preferredDomain.replace(/\.peak$/, ''))
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 18) || 'server';
    const suffix = (cleanOwner || crypto.randomBytes(2).toString('hex')).slice(0, 4);
    chosenDomain = `${baseSlug}-${suffix}.peak`;
  }

  const record = {
    v: 1,
    domain: chosenDomain,
    host: parsed.host.toLowerCase(),
    port: parsed.port,
    name: String(serverName || chosenDomain),
    mcVersion: String(mcVersion || ''),
    loader: loader === 'vanilla' ? 'vanilla' : 'fabric',
    online: true,
    ts: Date.now(),
    ttlSec: 900,
    owner: cleanOwner
  };

  await publishPeakRecord(record, { baseUrl });

  const cleanBase = getDirectoryBaseUrl(baseUrl);
  const cacheKey = `${cleanBase}|${allowPrivate ? '1' : '0'}|${chosenDomain}`;
  lookupCache.set(cacheKey, {
    expiresAt: Date.now() + HIT_CACHE_TTL_MS,
    value: {
      domain: chosenDomain,
      name: record.name,
      targetHost: record.host,
      targetPort: record.port,
      running: true,
      starting: false,
      mcVersion: record.mcVersion || null,
      maxPlayers: 20,
      isExternal: true,
      isGlobalDirectory: true,
      owner: cleanOwner,
      ts: record.ts
    }
  });

  return {
    domain: chosenDomain,
    host: record.host,
    port: record.port,
    owner: cleanOwner,
    registryActive: true,
    record
  };
}

async function unpublishPeakDomain({ domain, ownerId = '', baseUrl } = {}) {
  const normalized = normalizePeakDomain(domain);
  if (!normalized) return false;
  const cleanBase = getDirectoryBaseUrl(baseUrl);
  for (const key of Array.from(lookupCache.keys())) {
    if (key.endsWith(`|${normalized}`)) {
      lookupCache.delete(key);
    }
  }
  await publishPeakRecord(
    {
      v: 1,
      domain: normalized,
      host: '',
      port: 0,
      online: false,
      ts: Date.now(),
      ttlSec: 60,
      owner: String(ownerId || '')
    },
    { baseUrl: cleanBase }
  );
  return true;
}

module.exports = {
  DEFAULT_DIRECTORY_URL,
  normalizePeakDomain,
  topicForPeakDomain,
  parseHostPort,
  isAllowedPublicTarget,
  encodeRecord,
  decodeRecord,
  clearDirectoryCache,
  lookupPublicPeakDomain,
  publishPeakRecord,
  claimAndPublishPeakDomain,
  unpublishPeakDomain
};
