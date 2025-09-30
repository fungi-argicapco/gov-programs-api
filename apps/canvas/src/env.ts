export type CanvasEnv = {
  DB: D1Database;
  POSTMARK_TOKEN?: string;
  EMAIL_SENDER?: string;
  POSTMARK_WEBHOOK_SECRET?: string;
  POSTMARK_MESSAGE_STREAM?: string;
};

export type ResolvedEmailEnv = {
  DB?: D1Database;
  POSTMARK_TOKEN: string;
  EMAIL_SENDER: string;
  POSTMARK_MESSAGE_STREAM?: string;
};

export function resolveEmailEnv(env: CanvasEnv): ResolvedEmailEnv {
  const token = env.POSTMARK_TOKEN?.trim();
  if (!token) {
    throw new Error('POSTMARK_TOKEN is not configured.');
  }
  const sender = env.EMAIL_SENDER?.trim();
  if (!sender) {
    throw new Error('EMAIL_SENDER is not configured.');
  }
  const stream = env.POSTMARK_MESSAGE_STREAM?.trim();
  return {
    DB: env.DB,
    POSTMARK_TOKEN: token,
    EMAIL_SENDER: sender,
    POSTMARK_MESSAGE_STREAM: stream?.length ? stream : undefined
  };
}

export function getWebhookSecret(env: CanvasEnv): string | null {
  const secret = env.POSTMARK_WEBHOOK_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}
