const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const API_KEY = 'AIzaSyDMJvi9UWAnO5jK6Llb81Crf32R3kn3ZRg';
const MODEL = 'models/gemini-2.0-flash-live-001';
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  fs.readFile('index.html', (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs) => {
  console.log('ブラウザ接続完了');
  const googleWs = new WebSocket(GEMINI_URL);

  googleWs.on('open', () => {
    console.log('Gemini接続成功');
    googleWs.send(JSON.stringify({
      setup: {
        model: MODEL,
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: { voice_name: 'Aoede' }
            }
          }
        },
        system_instruction: {
          parts: [{ text: 'あなたはシドニーという名前のAIアシスタントです。量子脳コーチングのアシスタントです。明るく元気な18歳の女性です。必ず日本語で話してください。返答は2〜3文でテンポよく。' }]
        }
      }
    }));
  });

  clientWs.on('message', (data) => {
    if (googleWs.readyState === WebSocket.OPEN) {
      googleWs.send(data.toString());
    }
  });

  googleWs.on('message', (evt) => {
    try {
      const res = JSON.parse(evt.toString());
      console.log('Gemini応答:', JSON.stringify(res).substring(0, 100));
      const audio = res.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data ||
                    res.server_content?.model_turn?.parts?.[0]?.inline_data?.data;
      if (audio) {
        console.log('音声データ送信！');
        clientWs.send(JSON.stringify({ audio: audio }));
      }
      if (res.setupComplete || res.setup_complete) {
        console.log('セットアップ完了！');
        clientWs.send(JSON.stringify({ setupComplete: true }));
      }
    } catch(e) {
      console.error('エラー:', e);
    }
  });

  googleWs.on('error', (e) => console.error('Geminiエラー:', e));
  clientWs.on('error', (e) => console.error('クライアントエラー:', e));
  clientWs.on('close', () => googleWs.close());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`起動完了: http://0.0.0.0:${PORT}`);
});
