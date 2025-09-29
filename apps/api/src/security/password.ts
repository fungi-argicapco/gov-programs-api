const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const output = new Uint8Array(hex.length / 2);
  for (let i = 0; i < output.length; i += 1) {
    output[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return output;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordBytes = encoder.encode(password);
  const salted = new Uint8Array(salt.length + passwordBytes.length);
  salted.set(salt);
  salted.set(passwordBytes, salt.length);
  const digestBuffer = await crypto.subtle.digest('SHA-256', salted);
  const digest = new Uint8Array(digestBuffer);
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
  const digestBuffer = await crypto.subtle.digest('SHA-256', salted);
  const digest = new Uint8Array(digestBuffer);
  return toHex(digest) === digestHex;
}
