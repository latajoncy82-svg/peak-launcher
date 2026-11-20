const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const AdmZip = require('adm-zip');
const { USER_AGENT, ensureDir } = require('./paths');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} dla ${url}${body ? `: ${body.slice(0, 140)}` : ''}`);
  }
  return response.json();
}

function verifyFileHash(filePath, expectedHash, algo = 'sha1') {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      return resolve(false);
    }
    if (!expectedHash) {
      return resolve(true);
    }
    const hash = crypto.createHash(algo);
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const actual = hash.digest('hex').toLowerCase();
      resolve(actual === String(expectedHash).toLowerCase());
    });
    stream.on('error', () => resolve(false));
  });
}

async function downloadFile(
  url,
  destPath,
  { expectedHash = null, hashAlgo = 'sha1', retries = 3, onProgress = null, signal = null } = {}
) {
  ensureDir(path.dirname(destPath));

  if (fs.existsSync(destPath)) {
    if (!expectedHash) {
      const stat = fs.statSync(destPath);
      if (stat.size > 0) {
        return { skipped: true, path: destPath, size: stat.size };
      }
    } else if (await verifyFileHash(destPath, expectedHash, hashAlgo)) {
      const stat = fs.statSync(destPath);
      return { skipped: true, path: destPath, size: stat.size };
    }
  }

  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const tmpPath = `${destPath}.${process.pid}.${attempt}.tmp`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal
      });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} podczas pobierania ${path.basename(destPath)}`);
      }

      const totalBytes = Number(response.headers.get('content-length')) || 0;
      let downloadedBytes = 0;

      const writeStream = fs.createWriteStream(tmpPath);
      const readable = Readable.fromWeb(response.body);
      const hash = expectedHash ? crypto.createHash(hashAlgo) : null;

      await new Promise((resolve, reject) => {
        const cleanup = (err) => {
          writeStream.destroy();
          reject(err);
        };
        readable.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (hash) hash.update(chunk);
          if (onProgress) {
            onProgress({ downloadedBytes, totalBytes, file: path.basename(destPath) });
          }
        });
        readable.on('error', cleanup);
        writeStream.on('error', cleanup);
        writeStream.on('finish', resolve);
        readable.pipe(writeStream);
      });

      if (expectedHash && hash) {
        const actualHash = hash.digest('hex').toLowerCase();
        if (actualHash !== String(expectedHash).toLowerCase()) {
          throw new Error(
            `Niezgodna suma kontrolna (${hashAlgo}) dla ${path.basename(destPath)}`
          );
        }
      }

      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.renameSync(tmpPath, destPath);
      return { skipped: false, path: destPath, size: downloadedBytes };
    } catch (err) {
      lastError = err;
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup error
      }
      if (signal && signal.aborted) {
        throw err;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
      }
    }
  }
  throw lastError || new Error(`Nie udało się pobrać ${url}`);
}

async function downloadBatch(tasks, { concurrency = 12, onProgress = null, signal = null } = {}) {
  const total = tasks.length;
  if (total === 0) return [];

  let nextIndex = 0;
  let completed = 0;
  let bytesDownloaded = 0;
  const results = new Array(total);

  async function worker() {
    while (true) {
      if (signal && signal.aborted) {
        throw new Error('Operacja została anulowana.');
      }
      const idx = nextIndex++;
      if (idx >= total) break;

      const task = tasks[idx];
      const res = await downloadFile(task.url, task.destPath, {
        expectedHash: task.expectedHash,
        hashAlgo: task.hashAlgo || 'sha1',
        retries: task.retries || 3,
        signal
      });
      results[idx] = res;
      completed += 1;
      bytesDownloaded += res.size || 0;
      if (onProgress) {
        onProgress({
          completed,
          total,
          bytesDownloaded,
          currentFile: path.basename(task.destPath)
        });
      }
    }
  }

  const workerCount = Math.min(concurrency, total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function safeExtractZip(zipPath, targetDir, { stripTopDir = false, excludePrefixes = [] } = {}) {
  const targetRoot = path.resolve(targetDir);
  ensureDir(targetRoot);

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  let topPrefix = '';
  if (stripTopDir) {
    const firstDirs = new Set();
    for (const entry of entries) {
      const normalized = entry.entryName.replace(/\\/g, '/');
      const slashIdx = normalized.indexOf('/');
      if (slashIdx > 0) {
        firstDirs.add(normalized.slice(0, slashIdx + 1));
      } else if (!entry.isDirectory) {
        firstDirs.clear();
        break;
      }
    }
    if (firstDirs.size === 1) {
      topPrefix = Array.from(firstDirs)[0];
    }
  }

  for (const entry of entries) {
    let relName = entry.entryName.replace(/\\/g, '/');
    if (topPrefix && relName.startsWith(topPrefix)) {
      relName = relName.slice(topPrefix.length);
    }
    relName = relName.replace(/^\/+/, '');
    if (!relName) continue;

    if (excludePrefixes.some((prefix) => relName.startsWith(prefix))) {
      continue;
    }

    const destPath = path.resolve(targetRoot, relName);
    if (!destPath.startsWith(targetRoot + path.sep) && destPath !== targetRoot) {
      throw new Error(`Zablokowano niebezpieczną ścieżkę w archiwum ZIP: ${entry.entryName}`);
    }

    if (entry.isDirectory) {
      ensureDir(destPath);
    } else {
      ensureDir(path.dirname(destPath));
      fs.writeFileSync(destPath, entry.getData());
    }
  }
}

module.exports = {
  fetchJson,
  verifyFileHash,
  downloadFile,
  downloadBatch,
  safeExtractZip
};
