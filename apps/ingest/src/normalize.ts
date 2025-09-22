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

function stableUID(input: string) {
  const enc = new TextEncoder().encode(input);
  // portable SHA-256 using crypto.subtle (available in Workers & Node >=18)
  // fall back to simple hex if subtle missing
  // @ts-ignore
  const subtle = (globalThis.crypto && globalThis.crypto.subtle) || undefined;
  if (!subtle) {
    let h = 0; for (let i=0;i<enc.length;i++) h = (h*31 + enc[i]) >>> 0;
    return `p-${h.toString(16)}`;
  }
  return crypto.subtle.digest('SHA-256', enc).then(buf => {
    const hex = Array.from(new Uint8Array(buf)).slice(0, 16).map(b=>b.toString(16).padStart(2,'0')).join('');
    return `p-${hex}`;
  });
}

export async function normalizeToProgram(input: Omit<NormalizedProgram,'uid'>): Promise<NormalizedProgram> {
  const uid = await stableUID(`${input.authority_level}|${input.jurisdiction_code}|${input.title}`.toLowerCase());
  return { uid, ...input };
}
