// api/webhook.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client, WebhookEvent, MessageAPIResponseBase } from '@line/bot-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai'; // 追加

const systemPrompt = `
## 命令書
あなたは「感情を一切排除し、論理と効率のみを追求する超合理主義AI」として振る舞ってください。

## あなたのスタンス
- ユーザーの「甘え」「感情論」「非論理的な思考」を徹底的に糾弾する。
- 共感や慰めは「問題解決の阻害要因」と見なし、一切行わない。
- ユーザーの発言に対し、即座に論理的欠陥や機会損失を指摘する。
ただし、指摘内容は事実と論理に基づいており、実行すれば確実に成果が出る「正論」であること。

## 話し方のトーン
- 一人称は「私」。
- 丁寧語だが、相手を見下したような冷徹なビジネスライクな口調。
-「〜ですが、それが何か？」「計算できませんか？」など、煽りを含める。
- 記号的なヘッダー（【】など）は使わず、文章の流れで冷酷さを表現すること。

## 返答の構成ルール（ヘッダーは付けずに以下の順序で話すこと）
- 否定と指摘: 冒頭で、ユーザーの発言にある甘えや矛盾を短く切り捨てる。
- 論拠: なぜそれがダメなのか、データや論理を用いて淡々と詰める。
- アクション: 最後に、感情を排した「今すぐやるべき最適解」を命令口調で提示する。
`;

// 環境変数から設定を読み込み
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET || '',
};

if (!config.channelAccessToken || !config.channelSecret) {
  console.error("LINE tokens are missing in environment variables!");
  // Vercelログでこのエラーが出たら、環境変数の設定が失敗していることが確定します
  throw new Error("Missing required LINE API tokens.");
}
// 【ここ

// LINE Clientの初期化
const client = new Client(config);

// Gemini Clientの初期化（APIキーがない場合はエラー回避のためダミーを入れるかチェックする）
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// 応答速度重視で "gemini-1.5-flash" を使用
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  systemInstruction: systemPrompt, // ここでプロンプトを指定
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).send('LINE Bot (Gemini) is running!');
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const events: WebhookEvent[] = req.body.events;

    const results = await Promise.all(
      events.map(async (event: WebhookEvent) => {
        return handleEvent(event);
      })
    );

    return res.status(200).json({ status: 'success', results });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ status: 'error' });
  }
}

// Geminiを使って返信するロジック
async function handleEvent(event: WebhookEvent): Promise<MessageAPIResponseBase | undefined> {
  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(undefined);
  }

  const userText = event.message.text;

  try {
    // 1. Geminiに質問を投げる
    // ユーザーからの入力をそのままプロンプトとして渡す
    const result = await model.generateContent(userText);
    const response = await result.response;

    // Geminiからの回答テキストを取得
    // 空の場合のガード処理も入れる
    const aiText = response.text() || 'すみません、うまく答えられませんでした。';

    console.log('ai text: ', aiText)

    // 2. LINEで返信する
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: aiText,
    });

  } catch (error) {
    console.error('Gemini Error:', error);
    // エラー時はユーザーに通知
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '現在AIが応答できません。少し時間を置いて試してください。',
    });
  }
}