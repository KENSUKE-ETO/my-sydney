// =============================
// マイ・シドニー サーバー
// =============================

const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;

app.use(express.static(__dirname));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', hasApiKey: !!API_KEY });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (clientWs) => {
  console.log('✅ クライアント接続');

  if (!API_KEY) {
    console.error('❌ GEMINI_API_KEY 未設定');
    clientWs.send(JSON.stringify({ error: 'API key not configured' }));
    clientWs.close();
    return;
  }

  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
  const geminiWs = new WebSocket(geminiUrl);

  let geminiReady = false;
  const pendingMessages = [];

  geminiWs.on('open', () => {
    console.log('✅ Gemini接続成功');
  });

  geminiWs.on('message', (data) => {
    const text = data.toString();

    // クライアントへ転送
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(text);
    }

    // setupComplete 検知
    try {
      const parsed = JSON.parse(text);
      if (parsed.setupComplete) {
        geminiReady = true;
        console.log('✅ Geminiセットアップ完了');
        // 溜まっていたメッセージを送信
        while (pendingMessages.length > 0) {
          const msg = pendingMessages.shift();
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(msg);
          }
        }
      }
      // エラーがあればログに出す
      if (parsed.error) {
        console.error('❌ Geminiエラー応答:', JSON.stringify(parsed.error));
      }
    } catch (e) {
      // バイナリ等は無視
    }
  });

  geminiWs.on('error', (err) => {
    console.error('❌ Geminiエラー:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ error: 'Gemini error: ' + err.message }));
    }
  });

  geminiWs.on('close', (code, reason) => {
    const reasonStr = reason ? reason.toString() : '(empty)';
    console.log(`❌ Gemini切断 コード:${code} 理由:${reasonStr}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  });

  clientWs.on('message', (data) => {
    const msg = data.toString();
    if (geminiWs.readyState !== WebSocket.OPEN) {
      // Gemini接続前ならキュー
      pendingMessages.push(msg);
      return;
    }
    // setup メッセージは即送信、それ以外はsetupComplete後
    try {
      const parsed = JSON.parse(msg);
      if (parsed.setup) {
        // setup は最初に必ず送る
        geminiWs.send(msg);
        return;
      }
    } catch (e) {}

    if (geminiReady) {
      geminiWs.send(msg);
    } else {
      pendingMessages.push(msg);
    }
  });

  clientWs.on('close', () => {
    console.log('❌ クライアント切断');
    if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
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
