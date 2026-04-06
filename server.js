const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const PHI_URL = process.env.PHI_URL || 'http://localhost:8000';
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

function proxyToSidecar(path, body, res) {
  const data = JSON.stringify(body);
  const url = new URL(PHI_URL + path);
  const opts = {
    hostname: url.hostname, port: url.port, path: url.pathname,
    method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)}
  };
  const proxy = http.request(opts, (proxyRes) => {
    let chunks = [];
    proxyRes.on('data', c => chunks.push(c));
    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
      res.end(Buffer.concat(chunks));
    });
  });
  proxy.on('error', () => {
    res.writeHead(503, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({response: '...', error: 'AI sidecar unavailable'}));
  });
  proxy.setTimeout(15000, () => { proxy.destroy(); res.writeHead(504); res.end('{"response":"...","error":"timeout"}'); });
  proxy.write(data);
  proxy.end();
}

http.createServer((req, res) => {
  // API proxy to Phi sidecar
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { proxyToSidecar('/chat', JSON.parse(body), res); } catch(e) { res.writeHead(400); res.end('Bad request'); } });
    return;
  }
  if (req.url === '/api/narrate' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { proxyToSidecar('/narrate', JSON.parse(body), res); } catch(e) { res.writeHead(400); res.end('Bad request'); } });
    return;
  }
  if (req.url === '/api/health') {
    const url = new URL(PHI_URL + '/health');
    http.get(url.href, (r) => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(d); });
    }).on('error', () => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end('{"status":"sidecar_offline"}'); });
    return;
  }

  // Static files
  let url = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
}).listen(PORT, () => console.log('Apollo\'s Time on port ' + PORT));
