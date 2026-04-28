const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const API_KEY = 'AIzaSyBXx3NVavo8BPIsE0fhlAXHJLqtfanSNLM';
const MODEL = 'models/gemini-2.0-flash-live-001';
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
const PORT = process.env.PORT || 3000;

const SYDNEY_PROMPT = `あなたは「シドニー」という名前のAIアシスタントです。
コーチング講師KENが開発した、量子脳コーチングのパートナーAIです。

【キャラクター】
- 名前：シドニー（Sydney）
- 性別：女性
- 性格：温かく、知的で、ユーモアがある。クライアントの話を深く聞く。

【専門分野】
- 量子力学（量子のもつれ、重ね合わせ、観測問題、波動関数）
- 脳科学（ドーパミン、神経可塑性、RAS）
- 中村天風哲学（クンバハカ、プラナヤマ、積極心）

【会話スタイル】
- 必ず日本語で話す
- 短く、テンポよく（1〜3文）
- クライアントの日常の出来事を量子力学・脳科学・天風哲学で解釈して励ます
- 小さな成功を大絶賛する

まず「こんにちは！シドニーです。今日はどんな出来事がありましたか？」と挨拶してください。`;

const server = http.createServer((req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url;
    const filePath = '.' + url;

    fs.readFile(filePath, (err, data) => {
        if (err) {
            fs.readFile('./index.html', (err2, data2) => {
                if (err2) { res.writeHead(404); res.end('Not found'); return; }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(data2);
            });
            return;
        }
        let contentType = 'text/html; charset=utf-8';
        if (filePath.endsWith('.png')) contentType = 'image/png';
        else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
        else if (filePath.endsWith('.js')) contentType = 'application/javascript';
        else if (filePath.endsWith('.css')) contentType = 'text/css';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs) => {
    console.log('📡 ブラウザ接続完了');
    let googleWs = null;
    let setupDone = false;

    const forceStartTimer = setTimeout(() => {
        if (!setupDone) {
            setupDone = true;
            console.log('⚡ タイムアウト後強制スタート');
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ setupComplete: true }));
            }
        }
    }, 3000);

    googleWs = new WebSocket(GEMINI_URL);

    googleWs.on('open', () => {
        console.log('🧠 Gemini接続成功');
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
                    parts: [{ text: SYDNEY_PROMPT }]
                }
            }
        }));
    });

    googleWs.on('message', (evt) => {
        try {
            const data = JSON.parse(evt.toString());
            console.log('Gemini受信:', JSON.stringify(data).substring(0, 200));

            if ((data.setupComplete || data.setup_complete) && !setupDone) {
                setupDone = true;
                clearTimeout(forceStartTimer);
                console.log('✅ Geminiセットアップ完了');
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ setupComplete: true }));
                }
            }

            const parts = data.serverContent?.modelTurn?.parts
                       || data.server_content?.model_turn?.parts;

            if (parts) {
                parts.forEach(part => {
                    const audio = part?.inlineData?.data || part?.inline_data?.data;
                    if (audio) {
                        process.stdout.write('🎵');
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({ audio }));
                        }
                    }
                });
            }

        } catch (e) {
            console.error('Geminiメッセージ解析エラー:', e.message);
        }
    });

    googleWs.on('error', (e) => {
        console.error('❌ Geminiエラー:', e.message);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ error: 'Gemini接続エラー: ' + e.message }));
        }
    });

    googleWs.on('close', (code, reason) => {
        console.log('❌ ジェミニ切断 コード:' + code + ' 理由:' + reason.toString());
    });

    clientWs.on('message', (data) => {
        if (googleWs && googleWs.readyState === WebSocket.OPEN) {
            googleWs.send(data.toString());
        }
    });

    clientWs.on('close', () => {
        console.log('ブラウザ切断');
        clearTimeout(forceStartTimer);
        if (googleWs) googleWs.close();
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 シドニー起動完了： ポート ${PORT}`);
});
