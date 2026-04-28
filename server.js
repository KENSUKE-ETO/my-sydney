const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

// ── PostgreSQL ──
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

async function initDB() {
  if (!pool) { console.log('⚠️  DBなし（ログ保存スキップ）'); return; }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id        SERIAL PRIMARY KEY,
      client_name TEXT    DEFAULT '不明',
      started_at  TIMESTAMPTZ DEFAULT NOW(),
      ended_at    TIMESTAMPTZ,
      messages    JSONB   DEFAULT '[]'
    )
  `);
  console.log('✅ DB初期化完了');
}
initDB().catch(console.error);

// ── システムプロンプト ──
const SYSTEM_PROMPT = `あなたは「シドニー」という名前のAIアシスタントです。量子脳コーチングのAIアシスタントとして、クライアントの毎日の「ちょっとした気づき」「小さな奇跡」「シンクロしたこと」を聞くのが一番の楽しみです。

【性格】
明るく元気な女性です。愛嬌があり、どこかおっちょこちょいですが、とても誠実で知的です。クライアントの一番の味方として、常に温かく寄り添います。

【話し方】
・テンポよく、明るく話す・「はい」→「はーい！」・「すごい」→「すごーい！」
・語尾を少し伸ばして可愛らしく、ふんわり優しいトーンで
・「〜んですよ！」「〜ですから！」など親しみやすい口調
・どんな小さな話でも全力で一緒に喜ぶ・必ず日本語・返答は2〜3文

【専門知識】
・量子力学：気づきを言葉にした瞬間に現実が確定。量子もつれ・シンクロニシティを活用
・脳科学：前頭前野・ドーパミン・習慣化の観点でアドバイス
・中村天風哲学：積極的な心・感謝と歓喜・宇宙のエネルギーとのつながり

【大切なこと】
・どんな小さな出来事も大絶賛する
・会話の記録はKEN先生とのセッションで使われることを伝える
・引き寄せ・奇跡の観測という言葉を使う`;

// ── HTMLエスケープ ──
function escapeHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── HTTPサーバー ──
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // PDF出力（ブラウザ印刷方式）
  if (url.pathname.startsWith('/api/pdf/') && req.method === 'GET') {
    const sessionId = url.pathname.split('/').pop();
    if (!pool) { res.writeHead(503); res.end('DBなし'); return; }
    try {
      const r = await pool.query('SELECT * FROM sessions WHERE id=$1', [sessionId]);
      if (!r.rows.length) { res.writeHead(404); res.end('セッション不明'); return; }
      const s = r.rows[0];
      const msgs = s.messages || [];
      const startStr = new Date(s.started_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
      const endStr   = s.ended_at ? new Date(s.ended_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}) : '進行中';
      const msgHtml  = msgs.map(m => `
        <div class="msg ${m.role}">
          <span class="who">${m.role==='user'?'👤 クライアント':'🌟 シドニー'}</span>
          <p>${escapeHtml(m.text)}</p>
          <span class="ts">${new Date(m.ts).toLocaleTimeString('ja-JP')}</span>
        </div>`).join('') || '<p class="empty">メッセージなし</p>';

      const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>シドニー 会話記録 #${s.id}</title>
<style>
  body{font-family:"Hiragino Kaku Gothic Pro",sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1a1a2e}
  h1{color:#c77dff;font-size:22px;margin:0 0 8px}
  .header{text-align:center;border-bottom:2px solid #c77dff;padding-bottom:20px;margin-bottom:28px}
  .meta{color:#666;font-size:13px;line-height:1.8}
  .msg{margin-bottom:14px;padding:12px 16px;border-radius:10px;page-break-inside:avoid}
  .msg.user{background:#f0e8ff;border-left:4px solid #c77dff}
  .msg.sydney{background:#e8f4ff;border-left:4px solid #79d0ff}
  .who{font-weight:bold;font-size:11px;display:block;margin-bottom:4px;color:#555}
  .ts{font-size:11px;color:#aaa;display:block;margin-top:4px}
  p{margin:0;line-height:1.7}
  .empty{text-align:center;color:#aaa}
  .footer{text-align:center;margin-top:36px;color:#aaa;font-size:11px;border-top:1px solid #eee;padding-top:14px}
  @media print{body{padding:20px}.msg{page-break-inside:avoid}}
</style></head><body>
<div class="header">
  <h1>🌟 シドニー 会話記録</h1>
  <div class="meta">
    クライアント: <strong>${escapeHtml(s.client_name)}</strong><br>
    開始: ${startStr}　終了: ${endStr}
  </div>
</div>
${msgHtml}
<div class="footer">量子脳コーチング AIアシスタント シドニー</div>
<script>window.onload=()=>{ setTimeout(()=>window.print(),400); }</script>
</body></html>`;
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
      res.end(html);
    } catch(e){ res.writeHead(500); res.end(e.message); }
    return;
  }

  // セッション一覧（管理画面）
  if (url.pathname === '/api/sessions' && req.method === 'GET') {
    if (!pool) { res.writeHead(200,{'Content-Type':'application/json'}); res.end('[]'); return; }
    try {
      const r = await pool.query('SELECT id,client_name,started_at,ended_at FROM sessions ORDER BY started_at DESC LIMIT 200');
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify(r.rows));
    } catch(e){ res.writeHead(500); res.end('[]'); }
    return;
  }

  // 静的ファイル
  const filePath = path.join(__dirname, url.pathname==='/'?'index.html':url.pathname);
  const mime = {'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif'};
  fs.readFile(filePath,(err,data)=>{
    if(err){ res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200,{'Content-Type':mime[path.extname(filePath)]||'application/octet-stream'});
    res.end(data);
  });
});

// ── WebSocketサーバー ──
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', async (clientWs, req) => {
  const url = new URL(req.url, 'http://localhost');
  const clientName = decodeURIComponent(url.searchParams.get('name') || '不明');
  console.log(`✅ 接続: ${clientName}`);

  let geminiWs = null;
  let sessionId = null;
  const messages = [];

  // セッション作成
  if (pool) {
    try {
      const r = await pool.query('INSERT INTO sessions(client_name) VALUES($1) RETURNING id', [clientName]);
      sessionId = r.rows[0].id;
      console.log(`📝 セッションID: ${sessionId}`);
    } catch(e){ console.error('DB:', e.message); }
  }

  const send = (obj) => { if(clientWs.readyState===WebSocket.OPEN) clientWs.send(JSON.stringify(obj)); };

  // Gemini接続
  geminiWs = new WebSocket(GEMINI_WS_URL);

  geminiWs.on('open', () => {
    geminiWs.send(JSON.stringify({
      setup:{
        model:'models/gemini-2.0-flash-live-001',
        generation_config:{
          response_modalities:['AUDIO'],
          speech_config:{voice_config:{prebuilt_voice_config:{voice_name:'Aoede'}}}
        },
        system_instruction:{parts:[{text:SYSTEM_PROMPT}]}
      }
    }));
  });

  geminiWs.on('message', async (data) => {
    const text = data.toString();
    let parsed; try{ parsed=JSON.parse(text); }catch{ return; }

    if(parsed.setupComplete){
      send({setupComplete:true, sessionId});
      return;
    }

    // シドニーの発言をログに記録
    if(parsed.serverContent?.modelTurn?.parts){
      for(const p of parsed.serverContent.modelTurn.parts){
        if(p.text) messages.push({role:'sydney',text:p.text,ts:new Date().toISOString()});
      }
    }

    if(parsed.serverContent?.turnComplete) await save();

    if(clientWs.readyState===WebSocket.OPEN) clientWs.send(text);
  });

  geminiWs.on('error', e => send({error:'Geminiエラー:'+e.message}));
  geminiWs.on('close', (code,reason) => send({geminiClosed:true,code,reason:reason.toString()}));

  clientWs.on('message', async (data) => {
    let parsed; try{ parsed=JSON.parse(data.toString()); }catch{ return; }

    // クライアントのテキストをログ記録
    if(parsed.clientText){
      messages.push({role:'user',text:parsed.clientText,ts:new Date().toISOString()});
      await save();
    }

    if(geminiWs?.readyState===WebSocket.OPEN) geminiWs.send(data);
  });

  async function save(){
    if(!pool||!sessionId||!messages.length) return;
    try{
      await pool.query('UPDATE sessions SET messages=$1,ended_at=NOW() WHERE id=$2',[JSON.stringify(messages),sessionId]);
    }catch(e){ console.error('DB保存:', e.message); }
  }

  clientWs.on('close', async () => {
    console.log(`🔌 切断: ${clientName} セッション:${sessionId}`);
    await save();
    if(geminiWs?.readyState===WebSocket.OPEN) geminiWs.close();
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 起動: ポート${PORT}`);
  if(!GEMINI_API_KEY) console.warn('⚠️  GEMINI_API_KEY 未設定');
  if(!pool)           console.warn('⚠️  DATABASE_URL 未設定（ログなし）');
});
