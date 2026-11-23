const { USER_AGENT } = require('./paths');

let electronModule = null;
try {
  electronModule = require('electron');
} catch {
  electronModule = null;
}

const MS_CLIENT_ID = '00000000402b5328';
const MS_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const MS_SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';

const DEFAULT_ENDPOINTS = {
  authorizeUrl: 'https://login.live.com/oauth20_authorize.srf',
  tokenUrl: 'https://login.live.com/oauth20_token.srf',
  xblUrl: 'https://user.auth.xboxlive.com/user/authenticate',
  xstsUrl: 'https://xsts.auth.xboxlive.com/xsts/authorize',
  mcLoginUrl: 'https://api.minecraftservices.com/authentication/login_with_xbox',
  mcProfileUrl: 'https://api.minecraftservices.com/minecraft/profile',
  mcSkinsUrl: 'https://api.minecraftservices.com/minecraft/profile/skins'
};

function mergeEndpoints(endpoints) {
  return { ...DEFAULT_ENDPOINTS, ...(endpoints || {}) };
}

function formatDashedUuid(rawId) {
  const hex = String(rawId || '').replace(/-/g, '').trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    return String(rawId || '');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function encryptSecret(plainText) {
  const value = String(plainText || '');
  if (!value) return '';
  const safeStorage = electronModule?.safeStorage;
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value);
      return `dpapi:${encrypted.toString('base64')}`;
    }
  } catch {
    // Fallback below when safeStorage is unavailable
  }
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
}

function decryptSecret(encoded) {
  const raw = String(encoded || '');
  if (!raw) return '';
  if (raw.startsWith('dpapi:')) {
    const safeStorage = electronModule?.safeStorage;
    if (!safeStorage || typeof safeStorage.decryptString !== 'function') {
      return '';
    }
    try {
      const buf = Buffer.from(raw.slice(6), 'base64');
      return safeStorage.decryptString(buf);
    } catch {
      return '';
    }
  }
  if (raw.startsWith('plain:')) {
    try {
      return Buffer.from(raw.slice(6), 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return raw;
}

function buildAuthorizeUrl(endpoints) {
  const cfg = mergeEndpoints(endpoints);
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set('client_id', MS_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', MS_REDIRECT_URI);
  url.searchParams.set('scope', MS_SCOPE);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

function openMicrosoftLoginWindow(parentWindow = null, endpoints) {
  const BrowserWindow = electronModule?.BrowserWindow;
  if (!BrowserWindow) {
    throw new Error('Logowanie Microsoft wymaga okna graficznego Electron.');
  }

  const authUrl = buildAuthorizeUrl(endpoints);
  const partition = `ms-auth-${Date.now()}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const authWin = new BrowserWindow({
      width: 520,
      height: 680,
      parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
      modal: Boolean(parentWindow && !parentWindow.isDestroyed()),
      show: true,
      autoHideMenuBar: true,
      title: 'Logowanie Microsoft · Peak Launcher',
      backgroundColor: '#0c1624',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition
      }
    });

    const cleanupSession = () => {
      try {
        authWin.webContents?.session?.clearStorageData?.().catch(() => {});
      } catch {}
    };

    const finishResolve = (result) => {
      if (settled) return;
      settled = true;
      cleanupSession();
      if (!authWin.isDestroyed()) authWin.destroy();
      resolve(result);
    };

    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      cleanupSession();
      if (!authWin.isDestroyed()) authWin.destroy();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const inspectUrl = (rawUrl, event) => {
      if (!rawUrl || !String(rawUrl).startsWith(MS_REDIRECT_URI)) return false;
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      try {
        const parsed = new URL(rawUrl);
        const code = parsed.searchParams.get('code');
        const errCode = parsed.searchParams.get('error');
        const errDesc = parsed.searchParams.get('error_description');
        if (code) {
          finishResolve({ canceled: false, code });
          return true;
        }
        if (errCode === 'access_denied') {
          finishResolve({ canceled: true });
          return true;
        }
        finishReject(new Error(`Błąd logowania Microsoft (${errCode || 'unknown'}): ${errDesc || 'brak kodu autoryzacji'}`));
        return true;
      } catch (e) {
        finishReject(e);
        return true;
      }
    };

    const wc = authWin.webContents;
    wc.on('will-redirect', (event, url) => inspectUrl(url, event));
    wc.on('will-navigate', (event, url) => inspectUrl(url, event));
    wc.on('did-redirect-navigation', (_event, url) => inspectUrl(url, null));
    wc.on('did-navigate', (_event, url) => inspectUrl(url, null));

    authWin.on('closed', () => {
      if (!settled) {
        settled = true;
        cleanupSession();
        resolve({ canceled: true });
      }
    });

    authWin.loadURL(authUrl).catch((err) => {
      if (!settled) finishReject(err);
    });
  });
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Accept: 'application/json'
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15000)
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok || !data) {
    const detail = data?.error_description || data?.error || text.slice(0, 140);
    throw new Error(`Błąd tokenu Microsoft (${res.status}): ${detail}`);
  }
  return data;
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      ...headers
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data, text };
}

async function exchangeCodeForMsTokens(code, endpoints) {
  const cfg = mergeEndpoints(endpoints);
  const data = await postForm(cfg.tokenUrl, {
    client_id: MS_CLIENT_ID,
    code: String(code),
    grant_type: 'authorization_code',
    redirect_uri: MS_REDIRECT_URI,
    scope: MS_SCOPE
  });
  if (!data.access_token) {
    throw new Error('Microsoft nie zwrócił tokenu dostępu.');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresIn: Number(data.expires_in) || 86400
  };
}

async function refreshMsTokens(refreshToken, endpoints) {
  const cfg = mergeEndpoints(endpoints);
  if (!refreshToken) {
    throw new Error('Brak tokenu odświeżania Microsoft — zaloguj się ponownie.');
  }
  const data = await postForm(cfg.tokenUrl, {
    client_id: MS_CLIENT_ID,
    refresh_token: String(refreshToken),
    grant_type: 'refresh_token',
    scope: MS_SCOPE
  });
  if (!data.access_token) {
    throw new Error('Nie udało się odświeżyć tokenu Microsoft.');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || String(refreshToken),
    expiresIn: Number(data.expires_in) || 86400
  };
}

async function authenticateXboxLive(msAccessToken, endpoints) {
  const cfg = mergeEndpoints(endpoints);
  const attempt = async (ticket) =>
    postJson(
      cfg.xblUrl,
      {
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: ticket
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      },
      { 'x-xbl-contract-version': '1' }
    );

  let res = await attempt(msAccessToken);
  if (!res.ok && (res.status === 400 || res.status === 401) && !String(msAccessToken).startsWith('t=')) {
    res = await attempt(`t=${msAccessToken}`);
  }
  if (!res.ok || !res.data?.Token) {
    throw new Error(`Błąd autoryzacji Xbox Live (${res.status}): ${res.text.slice(0, 140)}`);
  }
  const uhs = res.data?.DisplayClaims?.xui?.[0]?.uhs || '';
  if (!uhs) {
    throw new Error('Xbox Live nie zwrócił identyfikatora użytkownika (uhs).');
  }
  return { xblToken: res.data.Token, uhs };
}

function mapXstsErrorMessage(xerr, status, fallbackText) {
  switch (Number(xerr)) {
    case 2148916233:
      return 'To konto Microsoft nie ma jeszcze profilu Xbox Live. Zaloguj się raz na minecraft.net lub xbox.com, aby go utworzyć.';
    case 2148916235:
      return 'Usługa Xbox Live nie jest dostępna w regionie tego konta Microsoft.';
    case 2148916236:
    case 2148916237:
      return 'Konto Microsoft wymaga weryfikacji wieku dorosłego na stronie xbox.com.';
    case 2148916238:
      return 'To konto jest kontem dziecka i musi zostać dodane do rodziny Microsoft na account.microsoft.com/family.';
    default:
      return `Błąd autoryzacji XSTS (${status}${xerr ? ` / XErr ${xerr}` : ''}): ${String(fallbackText || '').slice(0, 140)}`;
  }
}

async function authorizeXsts(xblToken, endpoints) {
  const cfg = mergeEndpoints(endpoints);
  const res = await postJson(cfg.xstsUrl, {
    Properties: {
      SandboxId: 'RETAIL',
      UserTokens: [xblToken]
    },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  });

  if (!res.ok || !res.data?.Token) {
    throw new Error(mapXstsErrorMessage(res.data?.XErr, res.status, res.text));
  }
  const xui = res.data?.DisplayClaims?.xui?.[0] || {};
  const uhs = xui.uhs || '';
  const xuid = xui.xid || '';
  if (!uhs) {
    throw new Error('XSTS nie zwrócił identyfikatora uhs.');
  }
  return { xstsToken: res.data.Token, uhs, xuid };
}

async function loginMinecraftWithXbox(uhs, xstsToken, endpoints) {
  const cfg = mergeEndpoints(endpoints);
  const res = await postJson(cfg.mcLoginUrl, {
    identityToken: `XBL3.0 x=${uhs};${xstsToken}`
  });
  if (!res.ok || !res.data?.access_token) {
    throw new Error(`Błąd logowania Minecraft Services (${res.status}): ${res.text.slice(0, 140)}`);
  }
  const expiresIn = Number(res.data.expires_in) || 86400;
  return {
    mcAccessToken: res.data.access_token,
    expiresIn,
    expiresAt: Date.now() + expiresIn * 1000
  };
}

async function fetchMinecraftProfile(mcAccessToken, endpoints) {
  const cfg = mergeEndpoints(endpoints);
  const res = await fetch(cfg.mcProfileUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${mcAccessToken}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    },
    signal: AbortSignal.timeout(15000)
  });
  if (res.status === 404) {
    throw new Error(
      'To konto Microsoft nie posiada gry Minecraft: Java Edition (lub nie utworzono jeszcze profilu na minecraft.net).'
    );
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok || !data || !data.id || !data.name) {
    throw new Error(`Nie udało się pobrać profilu Minecraft (${res.status}): ${text.slice(0, 140)}`);
  }

  const skins = Array.isArray(data.skins) ? data.skins : [];
  const active =
    skins.find((s) => String(s.state || '').toUpperCase() === 'ACTIVE') || skins[0] || null;
  const activeSkin = active?.url
    ? {
        url: active.url,
        model: String(active.variant || '').toUpperCase() === 'SLIM' ? 'slim' : 'classic'
      }
    : null;

  return {
    uuid: formatDashedUuid(data.id),
    username: data.name,
    activeSkin
  };
}

async function finishChainFromMsTokens(msTokens, endpoints) {
  const { xblToken, uhs } = await authenticateXboxLive(msTokens.accessToken, endpoints);
  const { xstsToken, uhs: xstsUhs, xuid } = await authorizeXsts(xblToken, endpoints);
  const mcLogin = await loginMinecraftWithXbox(xstsUhs || uhs, xstsToken, endpoints);
  const profile = await fetchMinecraftProfile(mcLogin.mcAccessToken, endpoints);

  return {
    username: profile.username,
    uuid: profile.uuid,
    xuid,
    mcAccessToken: mcLogin.mcAccessToken,
    msRefreshToken: msTokens.refreshToken,
    mcTokenExpiresAt: mcLogin.expiresAt,
    activeSkin: profile.activeSkin
  };
}

async function completeMicrosoftAuthFromCode(code, endpoints) {
  const msTokens = await exchangeCodeForMsTokens(code, endpoints);
  return finishChainFromMsTokens(msTokens, endpoints);
}

async function refreshMicrosoftSession(refreshToken, endpoints) {
  const msTokens = await refreshMsTokens(refreshToken, endpoints);
  return finishChainFromMsTokens(msTokens, endpoints);
}

async function downloadPremiumSkinBuffer(skinUrl) {
  if (!skinUrl) return null;
  try {
    const res = await fetch(skinUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const arrBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrBuf);
    return buf.length >= 24 ? buf : null;
  } catch {
    return null;
  }
}

async function uploadPremiumMinecraftSkin({
  mcAccessToken,
  pngBuffer,
  model = 'classic',
  endpoints
}) {
  if (!mcAccessToken || !Buffer.isBuffer(pngBuffer)) {
    throw new Error('Brak tokenu Microsoft lub obrazu skina PNG.');
  }
  const cfg = mergeEndpoints(endpoints);
  const form = new FormData();
  form.append('variant', model === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'skin.png');

  const res = await fetch(cfg.mcSkinsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mcAccessToken}`,
      'User-Agent': USER_AGENT
    },
    body: form,
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Nie udało się wysłać skina na minecraft.net (${res.status}): ${txt.slice(0, 140)}`);
  }
  return true;
}

module.exports = {
  MS_CLIENT_ID,
  MS_REDIRECT_URI,
  MS_SCOPE,
  DEFAULT_ENDPOINTS,
  formatDashedUuid,
  encryptSecret,
  decryptSecret,
  buildAuthorizeUrl,
  openMicrosoftLoginWindow,
  exchangeCodeForMsTokens,
  refreshMsTokens,
  authenticateXboxLive,
  authorizeXsts,
  loginMinecraftWithXbox,
  fetchMinecraftProfile,
  completeMicrosoftAuthFromCode,
  refreshMicrosoftSession,
  downloadPremiumSkinBuffer,
  uploadPremiumMinecraftSkin
};
