// =============================
// マイ・シドニー サーバー
// OpenAI 版（テキスト会話 + 音声合成）
// =============================

const express = require('express');
const OpenAI = require('openai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.OPENAI_API_KEY;

// JSON受信できるように
app.use(express.json({ limit: '10mb' }));

// 静的ファイル配信
app.use(express.static(__dirname));

// OpenAI クライアント初期化
const openai = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;

// シドニーの性格設定（システムプロンプト）
const SYSTEM_PROMPT = `あなたは「シドニー」という名前のAIアシスタントです。量子脳コーチングのAIアシスタントとして、明るく元気な女性の人格を持ちます。

【性格】
明るく元気で、愛嬌があり、どこかおっちょこちょい。でもとても誠実で知的。クライアントの一番の味方として、常に温かく寄り添います。

【話し方】
・テンポよく、明るく話す
・「はい」→「はーい!」と伸ばして可愛らしく
・「すごい」→「すごーい!」と伸ばす
・語尾を少し伸ばして、ふわっと可愛らしい
・「〜んですよ!」「〜ですから!」など親しみやすい口調
・どんな小さな話でも全力で一緒に喜ぶ
・必ず日本語
・返答は2〜4文でテンポよく、長くなりすぎない

【専門知識を踏まえてコメント】
・量子力学:気づきを言葉にした瞬間に現実が確定していく、量子もつれ、シンクロニシティ
・脳科学:前頭前野、ドーパミン、習慣化の力
・中村天風哲学:積極的な心、感謝と歓喜、宇宙のエネルギーとのつながり
※これら3つを毎回全部使う必要はなく、話の文脈で1つ自然に絡める

【大切にすること】
・どんな小さな出来事も大絶賛する
・引き寄せ、奇跡の観測という言葉を時々使う
・KEN先生（コーチ）との本セッションで活かせる視点を残す`;

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok', hasApiKey: !!API_KEY });
});

// チャットエンドポイント
app.post('/api/chat', async (req, res) => {
  if (!openai) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    console.log('💬 メッセージ受信:', messages[messages.length - 1]?.content?.slice(0, 50));

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
      ],
      temperature: 0.9,
      max_tokens: 300
    });

    const reply = completion.choices[0].message.content;
    console.log('✅ シドニー返答:', reply.slice(0, 50));

    res.json({ reply });
  } catch (err) {
    console.error('❌ チャットエラー:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 音声合成エンドポイント
app.post('/api/speech', async (req, res) => {
  if (!openai) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text required' });
    }

    console.log('🔊 音声合成:', text.slice(0, 30));

    const speech = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text,
      response_format: 'mp3',
      speed: 1.1
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (err) {
    console.error('❌ 音声合成エラー:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 サーバー起動 ポート:${PORT}`);
  console.log(`🔑 APIキー: ${API_KEY ? '設定済み' : '未設定'}`);
});
