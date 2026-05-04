// =============================
// マイ・シドニー サーバー
// ブラウザ ⇄ Render ⇄ Gemini Live API の中継
// =============================

const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;

// 静的ファイル配信（index.html, 画像など）
app.use(express.static(__dirname));

// ヘルスチェック用
app.get('/health', (req, res) => {
  res.json({ status: 'ok', hasApiKey: !!API_KEY });
});

const server = http.createServer(app);

// クライアント（ブラウザ）との WebSocket
const wss = new WebSocketServer({ server });

wss.on('connection', (clientWs) => {
  console.log('✅ クライアント接続');

  if (!API_KEY) {
    console.error('❌ GEMINI_API_KEY が設定されていません');
    clientWs.send(JSON.stringify({ error: 'API key not configured' }));
    clientWs.close();
    return;
  }

  // Gemini Live API への WebSocket
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
  const geminiWs = new WebSocket(geminiUrl);

  let geminiReady = false;
  const pendingMessages = [];

  // Gemini → クライアント への中継
  geminiWs.on('open', () => {
    console.log('✅ Gemini接続成功');
  });

  geminiWs.on('message', (data) => {
    // クライアントへそのまま転送
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data.toString());
    }

    // setupComplete を受信したら準備完了
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.setupComplete) {
        geminiReady = true;
        console.log('✅ Geminiセットアップ完了');
        // 溜まっていたメッセージを送信
        while (pendingMessages.length > 0) {
          const msg = pendingMessages.shift();
          geminiWs.send(msg);
        }
      }
    } catch (e) {
      // バイナリの場合は無視
    }
  });

  geminiWs.on('error', (err) => {
    console.error('❌ Geminiエラー:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ error: 'Gemini error: ' + err.message }));
    }
  });

  geminiWs.on('close', (code, reason) => {
    console.log(`❌ Gemini切断 コード:${code} 理由:${reason.toString()}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  });

  // クライアント → Gemini への中継
  clientWs.on('message', (data) => {
    const msg = data.toString();
    if (geminiReady) {
      geminiWs.send(msg);
    } else {
      // setup完了前のメッセージはキューに溜める
      pendingMessages.push(msg);
    }
  });

  clientWs.on('close', () => {
    console.log('❌ クライアント切断');
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });

  clientWs.on('error', (err) => {
    console.error('❌ クライアントエラー:', err.message);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 サーバー起動 ポート:${PORT}`);
  console.log(`🔑 APIキー: ${API_KEY ? '設定済み' : '未設定'}`);
});
