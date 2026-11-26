#!/usr/bin/env node
// Tiny static server that mimics GitHub Pages for a project site:
// serves <dir> (default dist/) under /Whiteout/ with `Cache-Control: max-age=600`.
//   node scripts/serve-subpath.cjs [dir] [port] [base]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const port = Number(process.argv[3] || 4176);
const base = process.argv[4] || '/Whiteout/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p + '/' === base) {
      res.writeHead(301, { Location: base });
      return res.end();
    }
    if (!p.startsWith(base)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 (outside ' + base + ')');
    }
    let file = path.join(dir, p.slice(base.length));
    if (!file.startsWith(dir)) {
      res.writeHead(403);
      return res.end();
    }
    if (p.endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404');
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'max-age=600',
      });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`serving ${dir} at http://localhost:${port}${base}`));
