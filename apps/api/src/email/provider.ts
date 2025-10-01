import type { Env } from '../db';

export type MailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export interface MailService {
  send(message: MailMessage): Promise<void>;
}

class ConsoleMailService implements MailService {
  async send(message: MailMessage): Promise<void> {
    console.info('Email send (console provider)', {
      from: message.from,
      to: message.to,
      subject: message.subject
    });
  }
}

class PostmarkMailService implements MailService {
  private readonly token: string;
  private readonly endpoint: string;

  constructor(token: string, endpoint?: string) {
    this.token = token;
    this.endpoint = endpoint ?? 'https://api.postmarkapp.com/email';
  }

  async send(message: MailMessage): Promise<void> {
    const payload = {
      From: message.from,
      To: message.to,
      Subject: message.subject,
      HtmlBody: message.html,
      TextBody: message.text,
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': this.token,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new Error(
        `Postmark request failed (${response.status} ${response.statusText})` +
          (errorBody ? ` – ${JSON.stringify(errorBody)}` : '')
      );
    }
  }
}

/**
 * Factory that returns an email service based on the configured provider.
 * Defaults to the console provider when EMAIL_PROVIDER is not set.
 */
export function createMailService(env: Env): MailService {
  const provider = (env.EMAIL_PROVIDER ?? 'console').toLowerCase();

  switch (provider) {
    case 'postmark': {
      const token = env.POSTMARK_TOKEN;
      if (!token) {
        throw new Error('POSTMARK_TOKEN is required when EMAIL_PROVIDER=postmark');
      }
      return new PostmarkMailService(token, env.POSTMARK_API_BASE);
    }
    case 'console':
    default:
      return new ConsoleMailService();
  }
}
