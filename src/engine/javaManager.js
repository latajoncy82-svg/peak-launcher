const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadFile, fetchJson, safeExtractZip } = require('./download');
const { ensureDir, getPaths } = require('./paths');

const MANAGED_MAJORS = [25, 21, 17, 8];

function parseJavaVersionOutput(outputText) {
  const text = String(outputText || '');
  const versionMatch = text.match(/(?:openjdk|java)\s+version\s+"([^"]+)"/i) ||
    text.match(/version\s+"([^"]+)"/i);
  if (!versionMatch) return null;

  const rawVersion = versionMatch[1];
  let major = 0;
  if (rawVersion.startsWith('1.')) {
    const parts = rawVersion.split('.');
    major = Number(parts[1]) || 0;
  } else {
    const parts = rawVersion.split(/[.+_-]/);
    major = Number(parts[0]) || 0;
  }
  if (!major) return null;

  let vendor = 'Java';
  if (/temurin|adoptium/i.test(text)) vendor = 'Eclipse Temurin';
  else if (/microsoft/i.test(text)) vendor = 'Microsoft OpenJDK';
  else if (/zulu/i.test(text)) vendor = 'Azul Zulu';
  else if (/oracle|hotspot/i.test(text)) vendor = 'Oracle / OpenJDK';

  return { rawVersion, major, vendor };
}

function probeJavaBinary(exePath, source = 'system') {
  return new Promise((resolve) => {
    if (!exePath || !fs.existsSync(exePath)) {
      return resolve(null);
    }
    execFile(exePath, ['-version'], { timeout: 5000, windowsHide: true }, (err, stdout, stderr) => {
      const combined = `${stderr || ''}\n${stdout || ''}`;
      const parsed = parseJavaVersionOutput(combined);
      if (!parsed) {
        return resolve(null);
      }
      resolve({
        path: path.resolve(exePath),
        major: parsed.major,
        rawVersion: parsed.rawVersion,
        vendor: parsed.vendor,
        source
      });
    });
  });
}

function collectCandidateJavaPaths(dataDir) {
  const candidates = [];
  const { runtimesDir } = getPaths(dataDir);

  if (fs.existsSync(runtimesDir)) {
    for (const entry of fs.readdirSync(runtimesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const javaExe = path.join(runtimesDir, entry.name, 'bin', 'java.exe');
      if (fs.existsSync(javaExe)) {
        candidates.push({ exe: javaExe, source: 'managed' });
      }
    }
  }

  if (process.env.JAVA_HOME) {
    const javaExe = path.join(process.env.JAVA_HOME, 'bin', 'java.exe');
    if (fs.existsSync(javaExe)) {
      candidates.push({ exe: javaExe, source: 'JAVA_HOME' });
    }
  }

  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const javaExe = path.join(dir, 'java.exe');
    if (fs.existsSync(javaExe)) {
      candidates.push({ exe: javaExe, source: 'PATH' });
    }
  }

  const standardRoots = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Java'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Zulu'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'BellSoft'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Minecraft Launcher', 'runtime'),
    path.join(
      os.homedir(),
      'AppData',
      'Local',
      'Packages',
      'Microsoft.4297127D64EC6_8wekyb3d8bbwe',
      'LocalCache',
      'Local',
      'runtime'
    )
  ];

  for (const root of standardRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      const subdirs = fs.readdirSync(root, { withFileTypes: true });
      for (const sub of subdirs) {
        if (!sub.isDirectory()) continue;
        const directJava = path.join(root, sub.name, 'bin', 'java.exe');
        if (fs.existsSync(directJava)) {
          candidates.push({ exe: directJava, source: 'system' });
        }
        // Mojang runtime nesting: runtime/<component>/windows-x64/<component>/bin/java.exe
        const win64Dir = path.join(root, sub.name, 'windows-x64');
        if (fs.existsSync(win64Dir)) {
          for (const inner of fs.readdirSync(win64Dir, { withFileTypes: true })) {
            if (!inner.isDirectory()) continue;
            const nestedJava = path.join(win64Dir, inner.name, 'bin', 'java.exe');
            if (fs.existsSync(nestedJava)) {
              candidates.push({ exe: nestedJava, source: 'mojang' });
            }
          }
        }
      }
    } catch {
      // Ignore permission errors on protected directories
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of candidates) {
    let real = path.resolve(item.exe);
    try {
      real = fs.realpathSync(real);
    } catch {
      // Keep resolved path
    }
    const key = real.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ exe: real, source: item.source });
  }
  return deduped;
}

async function detectInstalledJavas(dataDir) {
  const candidates = collectCandidateJavaPaths(dataDir);
  const probed = await Promise.all(
    candidates.map((c) => probeJavaBinary(c.exe, c.source))
  );
  const valid = probed.filter(Boolean);

  // Sort managed first, then higher major version
  valid.sort((a, b) => {
    if (a.source === 'managed' && b.source !== 'managed') return -1;
    if (b.source === 'managed' && a.source !== 'managed') return 1;
    return b.major - a.major;
  });

  const byMajor = {};
  for (const major of MANAGED_MAJORS) {
    byMajor[major] = valid.find((item) => item.major === major) || null;
  }
  for (const item of valid) {
    if (!byMajor[item.major]) {
      byMajor[item.major] = item;
    }
  }

  return { list: valid, byMajor };
}

function normalizeAdoptiumMajor(major) {
  const m = Number(major) || 8;
  if (m <= 8) return 8;
  if (m <= 11) return 11;
  if (m <= 17) return 17;
  if (m <= 21) return 21;
  return 25;
}

async function findJavaForMajor(major, dataDir) {
  const targetMajor = Number(major) || 8;
  const fallbackMajor = normalizeAdoptiumMajor(targetMajor);
  const { runtimesDir } = getPaths(dataDir);

  for (const cand of [targetMajor, fallbackMajor]) {
    const managedExe = path.join(runtimesDir, `java-${cand}`, 'bin', 'java.exe');
    if (fs.existsSync(managedExe)) {
      const probed = await probeJavaBinary(managedExe, 'managed');
      if (probed && (probed.major === targetMajor || probed.major === fallbackMajor)) {
        return probed;
      }
    }
  }

  const detected = await detectInstalledJavas(dataDir);
  return detected.byMajor[targetMajor] || detected.byMajor[fallbackMajor] || null;
}

async function getAdoptiumReleaseInfo(major) {
  const m = normalizeAdoptiumMajor(major);
  const url = `https://api.adoptium.net/v3/assets/latest/${m}/hotspot?os=windows&architecture=x64&image_type=jre`;
  const data = await fetchJson(url);
  const asset = Array.isArray(data) ? data[0] : null;
  if (!asset || !asset.binary || !asset.binary.package) {
    throw new Error(`Brak dostępnego pakietu Adoptium Temurin JRE dla Java ${m}.`);
  }
  return {
    major: m,
    releaseName: asset.release_name || `Temurin ${m}`,
    semver: asset.version?.semver || String(m),
    url: asset.binary.package.link,
    size: asset.binary.package.size || 0,
    checksum: asset.binary.package.checksum || null,
    fileName: asset.binary.package.name || `temurin-jre-${m}.zip`
  };
}

async function installJava(major, dataDir, onProgress = null) {
  const m = normalizeAdoptiumMajor(major);
  const { runtimesDir, tmpDir } = getPaths(dataDir);
  ensureDir(runtimesDir);
  ensureDir(tmpDir);

  if (onProgress) {
    onProgress({
      stage: 'java',
      major: m,
      percent: 2,
      message: `Pobieranie informacji o Java ${m} (Eclipse Temurin)...`
    });
  }

  const info = await getAdoptiumReleaseInfo(m);
  const zipPath = path.join(tmpDir, info.fileName);
  const targetDir = path.join(runtimesDir, `java-${m}`);

  await downloadFile(info.url, zipPath, {
    expectedHash: info.checksum,
    hashAlgo: 'sha256',
    onProgress: ({ downloadedBytes, totalBytes }) => {
      const total = totalBytes || info.size || 1;
      const pct = Math.min(82, Math.max(5, Math.round((downloadedBytes / total) * 80)));
      if (onProgress) {
        onProgress({
          stage: 'java',
          major: m,
          percent: pct,
          downloadedBytes,
          totalBytes: total,
          message: `Pobieranie Java ${m} (${(downloadedBytes / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB)...`
        });
      }
    }
  });

  if (onProgress) {
    onProgress({
      stage: 'java',
      major: m,
      percent: 88,
      message: `Rozpakowywanie środowiska Java ${m}...`
    });
  }

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  safeExtractZip(zipPath, targetDir, { stripTopDir: true });

  try {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  } catch {
    // Non-fatal cleanup error
  }

  const javaExe = path.join(targetDir, 'bin', 'java.exe');
  if (!fs.existsSync(javaExe)) {
    throw new Error(`Rozpakowana Java ${m} nie zawiera pliku bin/java.exe.`);
  }

  const probed = await probeJavaBinary(javaExe, 'managed');
  if (!probed) {
    throw new Error(`Nie udało się zweryfikować zainstalowanej Javy ${m}.`);
  }

  if (onProgress) {
    onProgress({
      stage: 'java',
      major: m,
      percent: 100,
      message: `Zainstalowano Java ${m} (${probed.rawVersion}).`
    });
  }

  return probed;
}

function removeManagedJava(major, dataDir) {
  const { runtimesDir } = getPaths(dataDir);
  const targetDir = path.join(runtimesDir, `java-${Number(major)}`);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

module.exports = {
  MANAGED_MAJORS,
  parseJavaVersionOutput,
  probeJavaBinary,
  detectInstalledJavas,
  findJavaForMajor,
  getAdoptiumReleaseInfo,
  installJava,
  removeManagedJava
};
