const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEBSITE_DIR = path.join(ROOT_DIR, 'website');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.exe': 'application/vnd.microsoft.portable-executable'
};

function startTempServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath.startsWith('/dist/')) {
        const fileName = path.basename(urlPath.slice('/dist/'.length));
        const target = path.resolve(DIST_DIR, fileName);
        if (!fs.existsSync(target)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const stat = fs.statSync(target);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES['.exe'],
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${fileName}"`
        });
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(target).pipe(res);
      }

      const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const target = path.resolve(WEBSITE_DIR, relPath);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const stat = fs.statSync(target);
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': stat.size
      });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(target).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  const setupPath = path.join(DIST_DIR, 'Peak-Launcher-Setup-1.0.0.exe');
  const portablePath = path.join(DIST_DIR, 'Peak-Launcher-Portable-1.0.0.exe');
  assert(fs.existsSync(setupPath), 'Brak pliku Peak-Launcher-Setup-1.0.0.exe');
  assert(fs.existsSync(portablePath), 'Brak pliku Peak-Launcher-Portable-1.0.0.exe');

  const server = await startTempServer();
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const staticRoutes = [
      '/',
      '/styles.css',
      '/app.js',
      '/data/releases.json',
      '/assets/icon.ico',
      '/assets/icon-64.png',
      '/assets/icon.png',
      '/assets/wallpaper-night.jpg',
      '/assets/wallpaper-day.jpg',
      '/assets/screen-dark.png',
      '/assets/screen-light.png',
      '/assets/screen-mods.png'
    ];

    for (const route of staticRoutes) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.strictEqual(res.status, 200, `Nieoczekiwany status ${res.status} dla ${route}`);
      console.log(`GET ${route} -> 200`);
    }

    const releasesRes = await fetch(`${baseUrl}/data/releases.json`);
    const releases = await releasesRes.json();
    const latest = releases[0];
    assert(latest && latest.assets.installer.size > 50_000_000, 'Brak rzeczywistego rozmiaru instalatora w releases.json');
    assert(latest && latest.assets.portable.size > 50_000_000, 'Brak rzeczywistego rozmiaru portable w releases.json');

    for (const fileName of ['Peak-Launcher-Setup-1.0.0.exe', 'Peak-Launcher-Portable-1.0.0.exe']) {
      const res = await fetch(`${baseUrl}/dist/${fileName}`, { method: 'HEAD' });
      assert.strictEqual(res.status, 200, `HEAD /dist/${fileName} zwrócił ${res.status}`);
      const len = Number(res.headers.get('content-length'));
      assert(len > 50_000_000, `Nieprawidłowy Content-Length (${len}) dla ${fileName}`);
      console.log(`HEAD /dist/${fileName} -> 200 (${(len / 1048576).toFixed(1)} MB)`);
    }

    console.log('\nWERYFIKACJA STRONY POBIERANIA ZAKOŃCZONA SUKCESEM!');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('BŁĄD WERYFIKACJI STRONY:', err);
  process.exit(1);
});
