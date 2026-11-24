const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const AdmZip = require('adm-zip');

const ROOT_DIR = path.resolve(__dirname, '..');
const PEAK_DATA_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.peak-launcher');
const TOOLS_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'peak-build-tools');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function walkFiles(dir, extFilter = null) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, extFilter));
    } else if (!extFilter || full.endsWith(extFilter)) {
      results.push(full);
    }
  }
  return results;
}

function findExecutable(rootDir, exeName) {
  if (!fs.existsSync(rootDir)) return null;
  const files = walkFiles(rootDir, exeName);
  return files.find((f) => path.basename(f).toLowerCase() === exeName.toLowerCase()) || null;
}

async function downloadToFile(url, destPath) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) return destPath;
  ensureDir(path.dirname(destPath));
  console.log(`Downloading ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return destPath;
}

async function ensureJdk25() {
  const jdkDir = path.join(TOOLS_DIR, 'jdk25');
  let javac = findExecutable(jdkDir, 'javac.exe');
  if (javac) return javac;

  const metaRes = await fetch('https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=x64&image_type=jdk&os=windows');
  if (!metaRes.ok) throw new Error(`Adoptium JDK 25 query failed: HTTP ${metaRes.status}`);
  const meta = await metaRes.json();
  const url = meta[0]?.binary?.package?.link;
  if (!url) throw new Error('Adoptium JDK 25 download URL missing');

  const zipPath = path.join(TOOLS_DIR, 'jdk25.zip');
  await downloadToFile(url, zipPath);
  if (fs.existsSync(jdkDir)) fs.rmSync(jdkDir, { recursive: true, force: true });
  ensureDir(jdkDir);
  new AdmZip(zipPath).extractAllTo(jdkDir, true);
  fs.rmSync(zipPath, { force: true });
  javac = findExecutable(jdkDir, 'javac.exe');
  if (!javac) throw new Error('javac.exe not found after extracting JDK 25');
  return javac;
}

function findJdk21Javac() {
  const candidates = [
    findExecutable('C:\\Program Files\\Eclipse Adoptium', 'javac.exe'),
    findExecutable('C:\\Program Files\\Java', 'javac.exe'),
    findExecutable(path.join(TOOLS_DIR, 'jdk21'), 'javac.exe')
  ].filter(Boolean);
  if (candidates.length > 0) return candidates[0];
  try {
    const out = execFileSync('where.exe', ['javac'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch {}
  return null;
}

function mavenToPath(libsDir, mavenName) {
  const parts = String(mavenName || '').split(':');
  if (parts.length < 3) return null;
  const [group, artifact, version, classifier] = parts;
  const base = path.join(libsDir, ...group.split('.'), artifact, version);
  const file = classifier ? `${artifact}-${version}-${classifier}.jar` : `${artifact}-${version}.jar`;
  return path.join(base, file);
}

function collectVersionClasspath(mcVersion, mainJarOverride = null) {
  const versionsDir = path.join(PEAK_DATA_DIR, 'versions');
  const libsDir = path.join(PEAK_DATA_DIR, 'libraries');
  const mcJsonPath = path.join(versionsDir, mcVersion, `${mcVersion}.json`);
  const mcJarPath = mainJarOverride || path.join(versionsDir, mcVersion, `${mcVersion}.jar`);
  if (!fs.existsSync(mcJsonPath)) throw new Error(`Missing ${mcJsonPath}`);
  if (!fs.existsSync(mcJarPath)) throw new Error(`Missing ${mcJarPath}`);

  const cp = new Set([mcJarPath]);
  const mcJson = JSON.parse(fs.readFileSync(mcJsonPath, 'utf8'));
  for (const lib of mcJson.libraries || []) {
    const rel = lib.downloads?.artifact?.path;
    if (rel) {
      const p = path.join(libsDir, ...rel.split('/'));
      if (fs.existsSync(p)) cp.add(p);
    } else if (lib.name) {
      const p = mavenToPath(libsDir, lib.name);
      if (p && fs.existsSync(p)) cp.add(p);
    }
  }

  const fabricJsonName = fs
    .readdirSync(versionsDir)
    .find((name) => name.startsWith('fabric-loader-') && name.endsWith(`-${mcVersion}`));
  if (!fabricJsonName) throw new Error(`Missing fabric-loader-*-${mcVersion} in ${versionsDir}`);
  const fabricJson = JSON.parse(fs.readFileSync(path.join(versionsDir, fabricJsonName, `${fabricJsonName}.json`), 'utf8'));
  for (const lib of fabricJson.libraries || []) {
    if (lib.name) {
      const p = mavenToPath(libsDir, lib.name);
      if (p && fs.existsSync(p)) cp.add(p);
    }
  }
  return Array.from(cp);
}

function compileAndPack({ modDir, outputJarPath, javacPath, releaseTarget, classpath }) {
  const srcDir = path.join(modDir, 'src');
  const resDir = path.join(modDir, 'resources');
  const javaFiles = walkFiles(srcDir, '.java');
  if (javaFiles.length === 0) throw new Error(`No .java files in ${srcDir}`);

  const buildOut = fs.mkdtempSync(path.join(os.tmpdir(), 'peak-mod-build-'));
  try {
    const argFile = path.join(buildOut, 'javac-args.txt');
    const cpJoined = classpath.map((p) => `"${p.replace(/\\/g, '\\\\')}"`).join(';');
    const argsText = [
      '--release', String(releaseTarget),
      '-encoding', 'UTF-8',
      '-proc:none',
      '-Xlint:none',
      '-cp', cpJoined.replace(/"/g, ''),
      '-d', buildOut,
      ...javaFiles
    ]
      .map((a) => (a.includes(' ') || a.includes(';') ? `"${a.replace(/\\/g, '\\\\')}"` : a))
      .join('\n');
    fs.writeFileSync(argFile, argsText, 'utf8');

    execFileSync(javacPath, [`@${argFile}`], { stdio: 'inherit', windowsHide: true });
    fs.rmSync(argFile, { force: true });

    const zip = new AdmZip();
    for (const clsFile of walkFiles(buildOut)) {
      const rel = path.relative(buildOut, clsFile).split(path.sep).join('/');
      zip.addFile(rel, fs.readFileSync(clsFile));
    }
    if (fs.existsSync(resDir)) {
      for (const resFile of walkFiles(resDir)) {
        const rel = path.relative(resDir, resFile).split(path.sep).join('/');
        zip.addFile(rel, fs.readFileSync(resFile));
      }
    }
    ensureDir(path.dirname(outputJarPath));
    zip.writeZip(outputJarPath);
    console.log(`Built ${outputJarPath} (${fs.statSync(outputJarPath).size} bytes, ${javaFiles.length} classes compiled)`);
  } finally {
    fs.rmSync(buildOut, { recursive: true, force: true });
  }
}

async function buildMc26() {
  const javac25 = await ensureJdk25();
  const cp = collectVersionClasspath('26.3');
  compileAndPack({
    modDir: path.join(ROOT_DIR, 'client-mod', 'mc26'),
    outputJarPath: path.join(ROOT_DIR, 'assets', 'peak-client-mc26.jar'),
    javacPath: javac25,
    releaseTarget: 25,
    classpath: cp
  });
}

async function ensureRemapped1214Jar() {
  const mcJar = path.join(PEAK_DATA_DIR, 'versions', '1.21.4', '1.21.4.jar');
  if (!fs.existsSync(mcJar)) throw new Error(`Missing ${mcJar}`);
  const outJar = path.join(TOOLS_DIR, 'remapped', '1.21.4-intermediary.jar');
  if (fs.existsSync(outJar) && fs.statSync(outJar).size > 1000000) return outJar;

  const intermediaryJar = await downloadToFile(
    'https://maven.fabricmc.net/net/fabricmc/intermediary/1.21.4/intermediary-1.21.4-v2.jar',
    path.join(TOOLS_DIR, 'intermediary-1.21.4-v2.jar')
  );
  const tinyRemapperJar = await downloadToFile(
    'https://maven.fabricmc.net/net/fabricmc/tiny-remapper/0.11.2/tiny-remapper-0.11.2-fat.jar',
    path.join(TOOLS_DIR, 'tiny-remapper-0.11.2-fat.jar')
  );

  // Extract mappings/mappings.tiny from intermediary-1.21.4-v2.jar
  const tinyPath = path.join(TOOLS_DIR, 'intermediary-1.21.4.tiny');
  const iz = new AdmZip(intermediaryJar);
  const entry = iz.getEntry('mappings/mappings.tiny');
  if (!entry) throw new Error('mappings/mappings.tiny missing in intermediary-1.21.4-v2.jar');
  fs.writeFileSync(tinyPath, entry.getData());

  const javac25 = await ensureJdk25();
  const javaExe = path.join(path.dirname(javac25), 'java.exe');
  ensureDir(path.dirname(outJar));
  const cp1214 = collectVersionClasspath('1.21.4').filter((p) => p !== mcJar);
  console.log('Remapping 1.21.4.jar official -> intermediary...');
  execFileSync(
    javaExe,
    ['-Xmx2G', '-jar', tinyRemapperJar, mcJar, outJar, tinyPath, 'official', 'intermediary', '--ignoreConflicts', ...cp1214],
    { stdio: 'inherit', windowsHide: true }
  );
  return outJar;
}

async function buildMc1214() {
  const remappedJar = await ensureRemapped1214Jar();
  const javac = findJdk21Javac() || (await ensureJdk25());
  const cp = collectVersionClasspath('1.21.4', remappedJar);
  compileAndPack({
    modDir: path.join(ROOT_DIR, 'client-mod', 'mc1214'),
    outputJarPath: path.join(ROOT_DIR, 'assets', 'peak-client-mc1214.jar'),
    javacPath: javac,
    releaseTarget: 21,
    classpath: cp
  });
}

async function main() {
  const argIdx = process.argv.indexOf('--target');
  const target = argIdx >= 0 && process.argv[argIdx + 1] ? process.argv[argIdx + 1] : 'all';

  if (target === 'remap-only') {
    const out = await ensureRemapped1214Jar();
    console.log('Remapped JAR ready:', out);
    return;
  }
  if (target === 'mc26' || target === 'all') {
    await buildMc26();
  }
  if (target === 'mc1214' || target === 'all') {
    await buildMc1214();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
