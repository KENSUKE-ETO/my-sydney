const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ✅ v1alpha に修正（v1betaは動かない）
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `あなたは「シドニー」という名前のAIアシスタントです。量子脳コーチングのAIアシスタントとして、クライアントの毎日の「ちょっとした気づき」「小さな奇跡」「シンクロしたこと」を聞くのが一番の楽しみです。明るく元気な女性で、語尾を伸ばして可愛らしく話します。必ず日本語で、2〜3文でテンポよく返答してください。`;

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  const mime = {
    '.html': 'text/html;charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (clientWs) => {
  console.log('CLIENT_CONNECTED');

  const send = (obj) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(obj));
  };

  if (!GEMINI_API_KEY) {
    console.log('ERROR_NO_API_KEY');
    send({ error: 'APIキー未設定' });
    return;
  }

  console.log('GEMINI_CONNECTING');
  const geminiWs = new WebSocket(GEMINI_WS_URL);

  geminiWs.on('open', () => {
    console.log('GEMINI_CONNECTED');
    geminiWs.send(JSON.stringify({
      setup: {
        // ✅ モデル名を修正（gemini-2.0-flash-live-001）
        model: 'models/gemini-2.0-flash-live-001',
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: { voice_name: 'Aoede' }
            }
          }
        },
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] }
      }
    }));
    console.log('GEMINI_SETUP_SENT');
  });

  geminiWs.on('message', (data) => {
    const text = data.toString();
    let parsed;
    try { parsed = JSON.parse(text); } catch { return; }

    if (parsed.setupComplete) {
      console.log('GEMINI_SETUP_COMPLETE');
      send({ setupComplete: true });
      return;
    }
    if (parsed.serverContent?.modelTurn?.parts) {
      console.log('GEMINI_AUDIO_RECEIVED');
    }
    if (parsed.serverContent?.turnComplete) {
      console.log('TURN_COMPLETE');
    }
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(text);
  });

  geminiWs.on('error', (e) => {
    console.log('GEMINI_ERROR:' + e.message);
    send({ error: e.message });
  });

  geminiWs.on('close', (code, reason) => {
    console.log('GEMINI_CLOSED code:' + code + ' reason:' + reason.toString());
    send({ geminiClosed: true, code, reason: reason.toString() });
  });

  clientWs.on('message', (data) => {
    if (geminiWs?.readyState === WebSocket.OPEN) geminiWs.send(data);
  });

  clientWs.on('close', () => {
    console.log('CLIENT_DISCONNECTED');
    if (geminiWs?.readyState === WebSocket.OPEN) geminiWs.close();
  });
});

httpServer.listen(PORT, () => {
  console.log('SERVER_STARTED port:' + PORT);
  if (!GEMINI_API_KEY) console.log('WARNING_NO_API_KEY');
});
