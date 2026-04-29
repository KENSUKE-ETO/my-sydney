const http = require('http');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI, Modality } = require('@google/genai');
const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

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

wss.on('connection', async (clientWs) => {
  console.log('CLIENT_CONNECTED');

  const send = (obj) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(obj));
  };

  if (!GEMINI_API_KEY) {
    send({ error: 'APIキー未設定' });
    return;
  }

  let geminiSession = null;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    console.log('GEMINI_CONNECTING');

    geminiSession = await ai.live.connect({
      model: 'models/gemini-3.1-flash-live-preview',
      callbacks: {
        onopen: () => {
          console.log('GEMINI_CONNECTED');
          send({ setupComplete: true });
        },
        onmessage: (message) => {
          if (message.serverContent?.modelTurn?.parts) {
            console.log('GEMINI_AUDIO_RECEIVED');
            send(message);
          }
          if (message.serverContent?.turnComplete) {
            console.log('TURN_COMPLETE');
            send(message);
          }
        },
        onerror: (e) => {
          console.log('GEMINI_ERROR:' + e.message);
          send({ error: e.message });
        },
        onclose: (e) => {
          console.log('GEMINI_CLOSED reason:' + e.reason);
          send({ geminiClosed: true, reason: e.reason });
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: SYSTEM_PROMPT,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' }
          }
        }
      }
    });

    console.log('GEMINI_SESSION_READY');

  } catch (e) {
    console.log('GEMINI_CONNECT_ERROR:' + e.message);
    send({ error: e.message });
    return;
  }

  clientWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.realtimeInput && geminiSession) {
        const chunk = msg.realtimeInput.mediaChunks[0];
        geminiSession.sendRealtimeInput({
          audio: {
            data: chunk.data,
            mimeType: chunk.mimeType
          }
        });
      }
    } catch (e) {
      console.log('MESSAGE_ERROR:' + e.message);
    }
  });

  clientWs.on('close', () => {
    console.log('CLIENT_DISCONNECTED');
    if (geminiSession) {
      geminiSession.close();
      geminiSession = null;
    }
  });
});

httpServer.listen(PORT, () => {
  console.log('SERVER_STARTED port:' + PORT);
});
