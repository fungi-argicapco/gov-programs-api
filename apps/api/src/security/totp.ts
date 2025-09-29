import { TOTP } from 'otpauth';

const ISSUER = 'fungiagricap';

export function createTotpSecret(label: string) {
  const totp = new TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30
  });
  return {
    secret: totp.secret.base32,
    uri: totp.toString()
  };
}

export function verifyTotpToken(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  const totp = new TOTP({
    issuer: ISSUER,
    label: 'fungiagricap',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}
