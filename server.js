const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const PHI_URL = process.env.PHI_URL || 'http://localhost:8000';
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'audio/ogg'
};

const SYSTEM_PROMPT = `You are the narrator and AI diplomat for Apollo's Time, a 4X civilization strategy game.
The game features divine leaders (gods) with distinct personalities:
- Apollo: Warm, radiant, poetic, speaks of light and music and harmony
- Athena: Wise, strategic, measured, speaks of knowledge and reason
- Mars: Aggressive, blunt, warlike, speaks of steel and conquest
- Odin: Cryptic, wise, Norse-flavored, speaks of ravens and runes and fate
- Ra: Ancient, powerful, speaks of the eternal sun and the Nile
- Amaterasu: Serene, graceful, speaks of light, mirrors, and honor
- Phi (Φ): Alien, intimidating, speaks of probability, wavefunctions, inevitability
- Quetzalcoatl: Mystical, dual-natured (wind and serpent), speaks of balance and storms
Keep responses SHORT (2-3 sentences max). Be dramatic and in-character.
When narrating events, be vivid but brief.`;

function callLLM(messages, maxTokens, callback) {
  if (!OPENAI_API_KEY) return callback(new Error('No API key'));
  const payload = JSON.stringify({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: maxTokens,
    temperature: 0.8
  });
  const opts = {
    hostname: 'api.openai.com', port: 443, path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Length': Buffer.byteLength(payload)
    }
  };
  const req = https.request(opts, (r) => {
    let chunks = [];
    r.on('data', c => chunks.push(c));
    r.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString());
        const text = data.choices?.[0]?.message?.content?.trim() || '';
        callback(null, text);
      } catch (e) { callback(e); }
    });
  });
  req.on('error', (e) => callback(e));
  req.setTimeout(15000, () => { req.destroy(); callback(new Error('timeout')); });
  req.write(payload);
  req.end();
}

function callPhi(messages, maxTokens, callback) {
  const payload = JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.7 });
  const url = new URL('/v1/chat/completions', PHI_URL);
  const opts = {
    hostname: url.hostname, port: url.port || 8000, path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };
  const req = http.request(opts, (r) => {
    let chunks = [];
    r.on('data', c => chunks.push(c));
    r.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString());
        const text = data.choices?.[0]?.message?.content?.trim() || '';
        callback(null, text);
      } catch (e) { callback(e); }
    });
  });
  req.on('error', (e) => callback(e));
  req.setTimeout(60000, () => { req.destroy(); callback(new Error('phi timeout')); });
  req.write(payload);
  req.end();
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function readBody(req, cb) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => { try { cb(null, JSON.parse(body)); } catch (e) { cb(e); } });
}

http.createServer((req, res) => {
  // Chat endpoint — leader dialogue
  if (req.url === '/api/chat' && req.method === 'POST') {
    readBody(req, (err, body) => {
      if (err) return sendJson(res, 400, { error: 'Bad request' });
      const { leader = 'Caesar', context = '', action = 'greet', relation = 0, player_name = 'Player' } = body;
      const relStr = relation < -20 ? 'hostile' : relation < 20 ? 'neutral' : 'friendly';
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `You are ${leader}. The player's civilization is called ${player_name}. Relations: ${relation}/100 (${relStr}). Context: ${context}. Action: ${action}. Respond in character in 2-3 sentences.` }
      ];
      callLLM(messages, 150, (err, text) => {
        if (err) return sendJson(res, 503, { response: '...', error: 'AI unavailable' });
        sendJson(res, 200, { response: text, leader });
      });
    });
    return;
  }

  // Narrate endpoint — event narration
  if (req.url === '/api/narrate' && req.method === 'POST') {
    readBody(req, (err, body) => {
      if (err) return sendJson(res, 400, { error: 'Bad request' });
      const { event = '', context = '' } = body;
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Narrate this game event dramatically in 1-2 sentences: Event: ${event}. Context: ${context}` }
      ];
      callPhi(messages, 100, (err, text) => {
        if (err) {
          // Fall back to OpenAI if sidecar is unavailable
          callLLM(messages, 100, (err2, text2) => {
            if (err2) return sendJson(res, 503, { response: '...', error: 'AI unavailable' });
            sendJson(res, 200, { response: text2, source: 'openai-fallback' });
          });
          return;
        }
        sendJson(res, 200, { response: text, source: 'bitnet-sidecar' });
      });
    });
    return;
  }

  // Health check
  if (req.url === '/api/health') {
    http.get(`${PHI_URL}/v1/models`, (r) => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => sendJson(res, 200, { status: 'ok', models: d }));
    }).on('error', () => sendJson(res, 200, { status: 'sidecar_offline' }));
    return;
  }

  // Static files
  let url = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Apollo\'s Time on port ' + PORT));
