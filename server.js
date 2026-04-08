const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// TTS cache directory — d:/home on Azure App Service, /tmp locally
const TTS_CACHE_DIR = fs.existsSync('d:/home') ? 'd:/home/tts-cache' : path.join(__dirname, 'tts-cache');
try { fs.mkdirSync(TTS_CACHE_DIR, { recursive: true }); } catch (e) {}

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

  // TTS endpoint — generate voice narration using OpenAI TTS, with disk cache
  if (req.url === '/api/tts' && req.method === 'POST') {
    readBody(req, (err, body) => {
      if (err) return sendJson(res, 400, { error: 'Bad request' });
      if (!OPENAI_API_KEY) return sendJson(res, 503, { error: 'No API key' });
      const { text = '' } = body;
      if (!text) return sendJson(res, 400, { error: 'No text provided' });

      // Check cache first
      const cacheKey = crypto.createHash('md5').update(text.substring(0, 500)).digest('hex');
      const cachePath = path.join(TTS_CACHE_DIR, cacheKey + '.mp3');
      if (fs.existsSync(cachePath)) {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
          'X-TTS-Cache': 'hit'
        });
        fs.createReadStream(cachePath).pipe(res);
        return;
      }

      const payload = JSON.stringify({
        model: 'tts-1',
        input: text.substring(0, 500),
        voice: 'onyx',
        response_format: 'mp3',
        speed: 0.9
      });
      const opts = {
        hostname: 'api.openai.com', port: 443, path: '/v1/audio/speech',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const ttsReq = https.request(opts, (r) => {
        if (r.statusCode !== 200) {
          let errBody = '';
          r.on('data', c => errBody += c);
          r.on('end', () => sendJson(res, r.statusCode, { error: 'TTS failed', details: errBody }));
          return;
        }
        // Stream to response AND cache to disk
        const cacheStream = fs.createWriteStream(cachePath);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
          'X-TTS-Cache': 'miss'
        });
        r.on('data', (chunk) => {
          res.write(chunk);
          cacheStream.write(chunk);
        });
        r.on('end', () => {
          res.end();
          cacheStream.end();
        });
        r.on('error', () => {
          cacheStream.end();
          try { fs.unlinkSync(cachePath); } catch (e) {}
        });
      });
      ttsReq.on('error', (e) => sendJson(res, 503, { error: 'TTS request failed' }));
      ttsReq.setTimeout(30000, () => { ttsReq.destroy(); sendJson(res, 504, { error: 'TTS timeout' }); });
      ttsReq.write(payload);
      ttsReq.end();
    });
    return;
  }

  // Combined narrate + voice endpoint — generates unique text via LLM then TTS
  if (req.url === '/api/narrate-voice' && req.method === 'POST') {
    readBody(req, (err, body) => {
      if (err) return sendJson(res, 400, { error: 'Bad request' });
      if (!OPENAI_API_KEY) return sendJson(res, 503, { error: 'No API key' });
      const { prompt = '', context = '', style = '' } = body;
      if (!prompt) return sendJson(res, 400, { error: 'No prompt' });

      // Step 1: Generate narration text via LLM
      const narrationStyle = style || "You are the gravelly-voiced narrator of a 4X civilization game, like Leonard Nimoy in Civilization IV or Liam Neeson reading epic history. Speak in second person to the player ('you', 'your people'). Be dramatic, poetic, and brief — 2-3 sentences maximum. Never break character. Do not use quotation marks around your response.";
      const messages = [
        { role: 'system', content: narrationStyle },
        { role: 'user', content: prompt + (context ? ' Game context: ' + context : '') }
      ];
      callLLM(messages, 120, (err, text) => {
        if (err) return sendJson(res, 503, { error: 'LLM failed' });
        if (!text) return sendJson(res, 503, { error: 'Empty response' });

        // Step 2: Check TTS cache for this generated text
        const cacheKey = crypto.createHash('md5').update(text).digest('hex');
        const cachePath = path.join(TTS_CACHE_DIR, cacheKey + '.mp3');

        function sendAudio(audioPath, cacheStatus) {
          const stat = fs.statSync(audioPath);
          const audioData = fs.readFileSync(audioPath);
          // Return JSON with text + base64 audio
          sendJson(res, 200, {
            text: text,
            audio: audioData.toString('base64'),
            cached: cacheStatus === 'hit'
          });
        }

        if (fs.existsSync(cachePath)) {
          return sendAudio(cachePath, 'hit');
        }

        // Step 3: Generate TTS
        const payload = JSON.stringify({
          model: 'tts-1',
          input: text.substring(0, 500),
          voice: 'onyx',
          response_format: 'mp3',
          speed: 0.9
        });
        const opts = {
          hostname: 'api.openai.com', port: 443, path: '/v1/audio/speech',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Length': Buffer.byteLength(payload)
          }
        };
        const ttsReq = https.request(opts, (r) => {
          if (r.statusCode !== 200) {
            // TTS failed — still return the text without audio
            let errBody = '';
            r.on('data', c => errBody += c);
            r.on('end', () => sendJson(res, 200, { text: text, audio: null }));
            return;
          }
          const chunks = [];
          r.on('data', c => chunks.push(c));
          r.on('end', () => {
            const audioBuffer = Buffer.concat(chunks);
            // Cache to disk
            try { fs.writeFileSync(cachePath, audioBuffer); } catch (e) {}
            sendJson(res, 200, {
              text: text,
              audio: audioBuffer.toString('base64'),
              cached: false
            });
          });
        });
        ttsReq.on('error', () => sendJson(res, 200, { text: text, audio: null }));
        ttsReq.setTimeout(30000, () => { ttsReq.destroy(); sendJson(res, 200, { text: text, audio: null }); });
        ttsReq.write(payload);
        ttsReq.end();
      });
    });
    return;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
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
