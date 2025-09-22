import { NormalizedProgramSchema, NormalizedProgramInput as SchemaProgramInput, NormalizedProgram as SchemaProgram } from '@common/types';

export type NormalizedProgramInput = SchemaProgramInput;
export type NormalizedProgram = SchemaProgram & { uid: string };

export interface UpsertProgramRecord {
  program: NormalizedProgramInput;
  raw?: unknown;
  adapter: string;
  source_url?: string;
}

async function stableUID(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  // portable SHA-256 using crypto.subtle (available in Workers & modern runtimes)
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Fallback: FNV-1a 32-bit hash (deterministic, avoids Node-only modules)
    let h = 0x811c9dc5;
    for (let i = 0; i < enc.length; i++) {
      h ^= enc[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `p-${h.toString(16)}`;
  }
  const buf = await subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(buf))
    .slice(0, 16)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `p-${hex}`;
}

export async function normalizeToProgram(input: NormalizedProgramInput): Promise<NormalizedProgram> {
  const parsed = NormalizedProgramSchema.parse(input);
  const uid = await stableUID(`${parsed.authority_level}|${parsed.jurisdiction_code}|${parsed.title}`.toLowerCase());
  return { uid, ...parsed };
}
