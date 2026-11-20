const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEBSITE_DIR = path.join(ROOT_DIR, 'website');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PORT = Number(process.env.PORT) || 4173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.exe': 'application/vnd.microsoft.portable-executable'
};

function serveFile(req, res, filePath, asAttachment = false) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nie znaleziono pliku.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    };
    if (asAttachment) {
      headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath.startsWith('/dist/')) {
    const fileName = path.basename(urlPath.slice('/dist/'.length));
    const target = path.resolve(DIST_DIR, fileName);
    if (!target.startsWith(DIST_DIR + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    return serveFile(req, res, target, true);
  }

  let relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  let target = path.resolve(WEBSITE_DIR, relPath);
  if (!target.startsWith(WEBSITE_DIR + path.sep) && target !== WEBSITE_DIR) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }
  return serveFile(req, res, target, false);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Strona pobierania Peak Launcher działa pod adresem: http://127.0.0.1:${PORT}/`);
});
