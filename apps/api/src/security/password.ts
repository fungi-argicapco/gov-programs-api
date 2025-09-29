const encoder = new TextEncoder();

function toHex(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordBytes = encoder.encode(password);
  const salted = new Uint8Array(salt.length + passwordBytes.length);
  salted.set(salt);
  salted.set(passwordBytes, salt.length);
  const digest = await crypto.subtle.digest('SHA-256', salted);
  return `${toHex(salt)}:${toHex(digest)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [saltHex, digestHex] = hash.split(':');
  if (!saltHex || !digestHex) {
    return false;
  }
  const salt = fromHex(saltHex);
  const passwordBytes = encoder.encode(password);
  const salted = new Uint8Array(salt.length + passwordBytes.length);
  salted.set(salt);
  salted.set(passwordBytes, salt.length);
  const digest = await crypto.subtle.digest('SHA-256', salted);
  return toHex(digest) === digestHex;
}
