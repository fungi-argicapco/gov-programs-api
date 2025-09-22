export type NormalizedProgram = {
  uid: string;
  country_code: 'US'|'CA';
  authority_level: 'federal'|'state'|'prov'|'territory'|'regional'|'municipal';
  jurisdiction_code: string; // e.g., US-WA, CA-ON
  title: string;
  summary?: string;
  benefit_type?: 'grant'|'rebate'|'tax_credit'|'loan'|'guarantee'|'voucher'|'other';
  status: 'open'|'scheduled'|'closed'|'unknown';
  industry_codes?: string[];  // NAICS
  start_date?: string;
  end_date?: string;
  url?: string;
  source_id?: number;
};

async function stableUID(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  // portable SHA-256 using crypto.subtle (available in Workers & Node >=18)
  // fall back to Node.js crypto if subtle missing, otherwise use simple hash (not for production)
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Try Node.js crypto module if available
    try {
      const { createHash } = await import('node:crypto').catch(async () => {
        return import('crypto');
      });
      const hash = createHash('sha256').update(input).digest('hex');
      return `p-${hash.slice(0, 32)}`; // 16 bytes = 32 hex chars
    } catch (e) {
      // Fallback: FNV-1a 32-bit hash (not cryptographically secure, but better distribution than polynomial rolling hash)
      let h = 0x811c9dc5;
      for (let i = 0; i < enc.length; i++) {
        h ^= enc[i];
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return `p-${h.toString(16)}`;
    }
  }
  const buf = await subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(buf))
    .slice(0, 16)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `p-${hex}`;
}

export async function normalizeToProgram(input: Omit<NormalizedProgram,'uid'>): Promise<NormalizedProgram> {
  const uid = await stableUID(`${input.authority_level}|${input.jurisdiction_code}|${input.title}`.toLowerCase());
  return { uid, ...input };
}
