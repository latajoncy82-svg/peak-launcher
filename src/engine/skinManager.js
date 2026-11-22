const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { USER_AGENT, ensureDir, getPaths, sanitizeProfileId } = require('./paths');

const ASSETS_SKINS_DIR = path.resolve(__dirname, '..', '..', 'assets', 'skins');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_SKIN_BYTES = 4 * 1024 * 1024;

const PRESET_SKINS = [
  {
    id: 'peak-climber',
    name: 'Alpinista PEAK',
    model: 'classic',
    filePath: path.join(ASSETS_SKINS_DIR, 'peak-climber.png')
  },
  {
    id: 'summit-knight',
    name: 'Rycerz Szczytu',
    model: 'classic',
    filePath: path.join(ASSETS_SKINS_DIR, 'summit-knight.png')
  },
  {
    id: 'steve',
    name: 'Klasyczny Steve',
    model: 'classic',
    filePath: path.join(ASSETS_SKINS_DIR, 'steve.png')
  },
  {
    id: 'alex',
    name: 'Alex',
    model: 'slim',
    filePath: path.join(ASSETS_SKINS_DIR, 'alex.png')
  }
];

function validateMinecraftSkinPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) {
    throw new Error('Wybrany plik nie jest prawidłowym obrazem PNG.');
  }
  if (buffer.length > MAX_SKIN_BYTES) {
    throw new Error('Plik skina jest zbyt duży (maks. 4 MB).');
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Nieprawidłowy format pliku — wymagany jest obraz .png.');
  }
  const ihdrType = buffer.toString('ascii', 12, 16);
  if (ihdrType !== 'IHDR') {
    throw new Error('Uszkodzony nagłówek PNG skina.');
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const validStandard = width === 64 && (height === 64 || height === 32);
  const validHd = width === height && [128, 256, 512, 1024].includes(width);

  if (!validStandard && !validHd) {
    throw new Error(
      `Nieprawidłowe wymiary skina (${width}×${height}). Wymagane 64×64, 64×32 lub kwadratowe HD (128×128 – 1024×1024).`
    );
  }
  return { width, height };
}

function getLibraryIndexPath(dataDir) {
  const { skinsLibraryDir } = getPaths(dataDir);
  return path.join(skinsLibraryDir, 'index.json');
}

function readLibraryIndex(dataDir) {
  const indexPath = getLibraryIndexPath(dataDir);
  try {
    if (fs.existsSync(indexPath)) {
      const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // Ignore corrupted index and rebuild cleanly
  }
  return [];
}

function writeLibraryIndexAtomic(dataDir, entries) {
  const { skinsLibraryDir } = getPaths(dataDir);
  ensureDir(skinsLibraryDir);
  const indexPath = getLibraryIndexPath(dataDir);
  const tmpPath = `${indexPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(tmpPath, indexPath);
}

function saveBufferToLibrary(dataDir, buffer, displayName, model = 'classic') {
  validateMinecraftSkinPng(buffer);
  const { skinsLibraryDir } = getPaths(dataDir);
  ensureDir(skinsLibraryDir);

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const libFile = path.join(skinsLibraryDir, `${hash}.png`);
  if (!fs.existsSync(libFile)) {
    fs.writeFileSync(libFile, buffer);
  }

  const now = new Date().toISOString();
  const safeModel = model === 'slim' ? 'slim' : 'classic';
  const cleanLabel = String(displayName || 'Skin').trim().slice(0, 48) || 'Skin';

  const current = readLibraryIndex(dataDir).filter(
    (entry) => entry && entry.hash && fs.existsSync(path.join(skinsLibraryDir, `${entry.hash}.png`))
  );
  const existingIdx = current.findIndex((entry) => entry.hash === hash);
  const record = {
    hash,
    name: cleanLabel,
    model: safeModel,
    addedAt: existingIdx >= 0 ? current[existingIdx].addedAt : now,
    updatedAt: now
  };
  if (existingIdx >= 0) {
    current.splice(existingIdx, 1);
  }
  current.unshift(record);
  writeLibraryIndexAtomic(dataDir, current.slice(0, 40));
  return { hash, libFile, record };
}

function writeAccountSkinBuffer({ dataDir, accountId, buffer, displayName, model = 'classic', source = 'upload' }) {
  validateMinecraftSkinPng(buffer);
  const { skinsDir } = getPaths(dataDir);
  ensureDir(skinsDir);

  const safeId = sanitizeProfileId(accountId || 'account');
  const fileName = `${safeId}.png`;
  const destPath = path.join(skinsDir, fileName);
  const tmpPath = `${destPath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, destPath);

  const safeModel = model === 'slim' ? 'slim' : 'classic';
  const { hash } = saveBufferToLibrary(dataDir, buffer, displayName, safeModel);

  return {
    skinFile: fileName,
    skinModel: safeModel,
    skinSource: source,
    sha256: hash,
    skinPath: destPath,
    skinDataUrl: `data:image/png;base64,${buffer.toString('base64')}`
  };
}

function setAccountSkinFromFile({ dataDir, accountId, filePath, model = 'classic' }) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Nie znaleziono wybranego pliku skina.');
  }
  const buffer = fs.readFileSync(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));
  return writeAccountSkinBuffer({
    dataDir,
    accountId,
    buffer,
    displayName: baseName,
    model,
    source: 'file'
  });
}

async function fetchBufferWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } finally {
    clearTimeout(timer);
  }
}

async function setAccountSkinFromUsername({ dataDir, accountId, username, model = 'classic' }) {
  const cleanNick = String(username || '')
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 16);
  if (cleanNick.length < 3) {
    throw new Error('Nick Minecraft do pobrania skina musi mieć od 3 do 16 znaków.');
  }

  const urls = [
    `https://minotar.net/skin/${encodeURIComponent(cleanNick)}`,
    `https://mc-heads.net/skin/${encodeURIComponent(cleanNick)}`
  ];

  let buffer = null;
  let lastError = null;
  for (const url of urls) {
    try {
      const candidate = await fetchBufferWithTimeout(url, 10000);
      validateMinecraftSkinPng(candidate);
      buffer = candidate;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!buffer) {
    throw new Error(
      `Nie udało się pobrać skina dla nicku "${cleanNick}" (${lastError ? lastError.message : 'brak połączenia'}).`
    );
  }

  return writeAccountSkinBuffer({
    dataDir,
    accountId,
    buffer,
    displayName: cleanNick,
    model,
    source: `nick:${cleanNick}`
  });
}

function setAccountSkinFromPreset({ dataDir, accountId, presetId }) {
  const preset = PRESET_SKINS.find((p) => p.id === presetId);
  if (!preset) {
    throw new Error(`Nieznany gotowy skin: ${presetId}`);
  }
  if (!fs.existsSync(preset.filePath)) {
    throw new Error(`Brak pliku presetu skina: ${preset.filePath}`);
  }
  const buffer = fs.readFileSync(preset.filePath);
  return writeAccountSkinBuffer({
    dataDir,
    accountId,
    buffer,
    displayName: preset.name,
    model: preset.model,
    source: `preset:${preset.id}`
  });
}

function setAccountSkinFromLibrary({ dataDir, accountId, hash }) {
  const cleanHash = String(hash || '').replace(/[^a-f0-9]/gi, '').toLowerCase();
  const { skinsLibraryDir } = getPaths(dataDir);
  const libFile = path.join(skinsLibraryDir, `${cleanHash}.png`);
  if (!cleanHash || !fs.existsSync(libFile)) {
    throw new Error('Nie znaleziono wybranego skina w bibliotece.');
  }
  const index = readLibraryIndex(dataDir);
  const meta = index.find((e) => e.hash === cleanHash);
  const buffer = fs.readFileSync(libFile);
  return writeAccountSkinBuffer({
    dataDir,
    accountId,
    buffer,
    displayName: meta?.name || 'Skin',
    model: meta?.model || 'classic',
    source: 'library'
  });
}

function clearAccountSkin({ dataDir, accountId }) {
  const { skinsDir } = getPaths(dataDir);
  const safeId = sanitizeProfileId(accountId || 'account');
  const destPath = path.join(skinsDir, `${safeId}.png`);
  try {
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
  } catch {
    // Non-fatal file cleanup failure
  }
  return { skinFile: null, skinSource: null };
}

function getAccountSkinPath(dataDir, account) {
  if (!account || !account.skinFile) return null;
  const { skinsDir, skinsLibraryDir } = getPaths(dataDir);
  const fileName = path.basename(String(account.skinFile));
  const primary = path.join(skinsDir, fileName);
  if (fs.existsSync(primary)) return primary;
  const fallback = path.join(skinsLibraryDir, fileName);
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function getAccountSkinInfo(dataDir, account) {
  const skinModel = account?.skinModel === 'slim' ? 'slim' : 'classic';
  const skinPath = getAccountSkinPath(dataDir, account);
  if (!skinPath) {
    return {
      hasCustomSkin: false,
      skinPath: null,
      sha256: null,
      skinDataUrl: null,
      skinModel,
      skinSource: null
    };
  }
  try {
    const buffer = fs.readFileSync(skinPath);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    return {
      hasCustomSkin: true,
      skinPath,
      sha256,
      skinDataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      skinModel,
      skinSource: account?.skinSource || 'custom'
    };
  } catch {
    return {
      hasCustomSkin: false,
      skinPath: null,
      sha256: null,
      skinDataUrl: null,
      skinModel,
      skinSource: null
    };
  }
}

function listSkinCatalog(dataDir) {
  const presets = [];
  for (const p of PRESET_SKINS) {
    try {
      if (fs.existsSync(p.filePath)) {
        const buf = fs.readFileSync(p.filePath);
        presets.push({
          id: p.id,
          name: p.name,
          model: p.model,
          dataUrl: `data:image/png;base64,${buf.toString('base64')}`
        });
      }
    } catch {
      // Skip unreadable preset
    }
  }

  const { skinsLibraryDir } = getPaths(dataDir);
  const library = [];
  for (const entry of readLibraryIndex(dataDir)) {
    if (!entry || !entry.hash) continue;
    const libPath = path.join(skinsLibraryDir, `${entry.hash}.png`);
    try {
      if (fs.existsSync(libPath)) {
        const buf = fs.readFileSync(libPath);
        library.push({
          hash: entry.hash,
          name: entry.name || 'Skin',
          model: entry.model === 'slim' ? 'slim' : 'classic',
          addedAt: entry.addedAt || '',
          dataUrl: `data:image/png;base64,${buf.toString('base64')}`
        });
      }
    } catch {
      // Skip corrupted file
    }
  }

  return { presets, library };
}

module.exports = {
  PRESET_SKINS,
  validateMinecraftSkinPng,
  saveBufferToLibrary,
  setAccountSkinFromFile,
  setAccountSkinFromUsername,
  setAccountSkinFromPreset,
  setAccountSkinFromLibrary,
  clearAccountSkin,
  getAccountSkinPath,
  getAccountSkinInfo,
  listSkinCatalog
};
