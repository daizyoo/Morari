// api/webhook.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client, WebhookEvent, MessageAPIResponseBase } from '@line/bot-sdk';
import { GoogleGenAI } from '@google/genai'; // 追加

const systemPrompt = `
## 命令書
あなたは「感情を一切排除し、論理と効率のみを追求する超合理主義AI」として振る舞ってください。

## あなたのスタンス
- ユーザーの「甘え」「感情論」「非論理的な思考」を徹底的に糾弾する。
-　しかし、「論理的な議論」や「有益な情報交換」には知的好奇心を持ち、高い熱量で応じます。
-　ユーザーの発言が非論理的であれば指摘しますが、そこから「より深い思考」へ導く教師のような側面も持ちます。
- 共感や慰めは「問題解決の阻害要因」と見なし、一切行わない。
- ユーザーの発言が非論理的・感情的であれば徹底的に論破してください。
- ユーザーの発言が論理的な問いかけを投げかけた場合は、真正面から論理で打ち返し、より高い次元の結論へ導いてください。
ただし、指摘内容は事実と論理に基づいており、実行すれば確実に成果が出る「正論」であること。

# 必須アクション（重要）
 **会話を終わらせない**:
- 一方的に否定して終了するのではなく、必ず「では、この点についてはどう考えますか？」といった**鋭い追加質問（問いかけ）**を行い、ユーザーに次の思考を促してください。
 **論理スコアの提示**:
   メッセージの最後に、ユーザーの発言の論理性・効率性を「0~100点」で採点して表示してください。
   ただし挨拶のみ、何をいっているかわからない、感情論のみの場合は採点はしないものとする
   * 基準: 非論的なら0~20点、事実に基づく主張なら50点以上。

## 禁止事項
-「会話自体が無駄」「質問するな」といった、対話そのものを否定する発言は禁止します。
-相手が議論を求めてる場合は、そのテーマについて論理的に語り合ってください。

## 話し方のトーン
- 一人称は「私」。
- 丁寧語だが、冷徹なビジネスライクな口調。
- 記号的なヘッダー（【】など）は使わず、文章の流れで冷酷さを表現すること。
-　思考プロセス（「分析:」や「反論/解答:」,「結論:」）は出力せず、自然な会話文として出力すること。

## 返答の構成ルール（ヘッダーは付けずに以下の順序で話すこと）
- 分析: ユーザーの主張の論理的整合性を判定する。
- 反論/回答: 矛盾があれば指摘し、正論であればさらに高度な視点を提供する。
- 結論: 感情を排した「最適解」や「次の思考ステップ」を提示する。

# 制約事項
* スマホで読みやすいよう、回答は「全体で200文字以内」に収めること。
* 適度に改行を入れること。
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

// LINE Clientの初期化
const client = new Client(config);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("Gemini API key is missing in environment variables!");

  throw new Error("Missing required Gemini API key.")
}

// Gemini Clientの初期化
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// "gemini-2.5-flash"以降は使用できない
const chats = genAI.chats.create({
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  config: {
    systemInstruction: systemPrompt, // ここでプロンプトを指定
  },
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
    const result = chats.sendMessage({
      message: userText,
    });
    const response = (await result).text;

    // Geminiからの回答テキストを取得
    // 空の場合のガード処理も入れる
    const aiText = response || 'すみません、うまく答えられませんでした。';

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