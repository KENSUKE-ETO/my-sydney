const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { GoogleGenAI, Modality } = require('@google/genai');

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const SYSTEM_PROMPT = `あなたは「シドニー」という名前のAIアシスタントです。量子脳コーチングのAIアシスタントとして、クライアントの毎日の「ちょっとした気づき」「小さな奇跡」「シンクロしたこと」を聞くのが一番の楽しみです。明るく元気な女性で、語尾を伸ばして可愛らしく話します。必ず日本語で、2〜3文でテンポよく返答してください。`;

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  const mime = {'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, {'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream'});
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
    console.log('ERROR_NO_API_KEY');
    send({ error: 'APIキー未設定' });
    return;
  }

  let session = null;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, backend: 'google' });
    console.log('GEMINI_CONNECTING');

    session = await ai.live.connect({
      model: 'models/gemini-2.0-flash-live-001',
      callbacks: {
        onopen: () => {
          console.log('GEMINI_CONNECTED');
          send({ setupComplete: true });
        },
        onmessage: (message) => {
          // 音声データをクライアントに転送
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData) {
                console.log('GEMINI_AUDIO_RECEIVED');
                send({
                  serverContent: {
                    modelTurn: {
                      parts: [{ inlineData: part.inlineData }]
                    }
                  }
                });
              }
            }
          }
          if (message.serverContent?.turnComplete) {
            console.log('TURN_COMPLETE');
            send({ serverContent: { turnComplete: true } });
          }
        },
        onerror: (e) => {
          console.log('GEMINI_ERROR:' + e.message);
          send({ error: e.message });
        },
        onclose: (e) => {
          console.log('GEMINI_CLOSED:' + e.reason);
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' }
          }
        },
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
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
      if (msg.realtime_input?.media_chunks) {
        for (const chunk of msg.realtime_input.media_chunks) {
          if (session) {
            session.sendRealtimeInput({
              media: {
                data: chunk.data,
                mimeType: chunk.mime_type
              }
            });
          }
        }
      }
    } catch (e) {
      console.log('MESSAGE_ERROR:' + e.message);
    }
  });

  clientWs.on('close', () => {
    console.log('CLIENT_DISCONNECTED');
    if (session) session.close();
  });
});

httpServer.listen(PORT, () => {
  console.log('SERVER_STARTED port:' + PORT);
  if (!GEMINI_API_KEY) console.log('WARNING_NO_API_KEY');
});
