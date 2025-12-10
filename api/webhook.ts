// api/webhook.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client, WebhookEvent, MessageAPIResponseBase } from '@line/bot-sdk';

// 環境変数から設定を読み込み
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET || '',
};

// LINE Clientの初期化
const client = new Client(config);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GETリクエスト（ブラウザ確認用）は200を返す
  if (req.method === 'GET') {
    return res.status(200).send('LINE Bot is running!');
  }

  // POST以外は拒否
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    // 署名検証は本来行うべきですが、Vercelの関数ではreq.bodyがパース済みのため
    // 初心者向けに一旦省略し、イベント処理に集中します。
    // 本番運用の際は rawBody を取得して validateSignature を行う必要があります。

    const events: WebhookEvent[] = req.body.events;

    // イベントを並列処理
    const results = await Promise.all(
      events.map(async (event: WebhookEvent) => {
        return handleEvent(event);
      })
    );

    return res.status(200).json({ status: 'success', results });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: 'error' });
  }
}

// イベントハンドラー
async function handleEvent(event: WebhookEvent): Promise<MessageAPIResponseBase | undefined> {
  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(undefined);
  }

  // ユーザーが送ったテキスト
  const userText = event.message.text;

  // オウム返しをする
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `あなたは「${userText}」と言いましたね！`,
  });
}