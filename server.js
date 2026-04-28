const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const API_KEY = 'AIzaSyDMJvi9UWAnO5jK6Llb81Crf32R3kn3ZRg';
const MODEL = 'models/gemini-2.0-flash-live-001';
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

const server = http.createServer((req, res) => {
    fs.readFile('index.html', (err, data) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs) => {
    console.log("✅ 接続開始");
    const googleWs = new WebSocket(GEMINI_URL);

    googleWs.on('open', () => {
        console.log("✅ Google脳 起動");
        googleWs.send(JSON.stringify({
            setup: {
                model: MODEL,
                generation_config: { response_modalities: ["AUDIO"] }
            }
        }));
    });

    clientWs.on('message', (data) => {
        if (googleWs.readyState === WebSocket.OPEN) {
            googleWs.send(data.toString());
        }
    });

    googleWs.on('message', (evt) => {
        const res = JSON.parse(evt.toString());
        const audio = res.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data || 
                      res.server_content?.model_turn?.parts?.[0]?.inline_data?.data;
        if (audio) {
            process.stdout.write("★"); 
            clientWs.send(JSON.stringify({ audio: audio }));
        }
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log("🚀 FINAL STANDBY: http://127.0.0.1:3000");
});