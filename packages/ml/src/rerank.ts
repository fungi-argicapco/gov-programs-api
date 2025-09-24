export type LtrWeights = {
  bias: number;
  w_jur: number;
  w_ind: number;
  w_time: number;
  w_size: number;
  w_fresh: number;
  w_text: number;
};

const DEFAULT_WEIGHTS: LtrWeights = {
  bias: 0,
  w_jur: 0.7,
  w_ind: 0.6,
  w_time: 0.5,
  w_size: 0.3,
  w_fresh: 0.2,
  w_text: 0.8
};

const SIGMOID_CLAMP_MIN = -20;
const SIGMOID_CLAMP_MAX = 20;
const TOKEN_SCORE_WEIGHT = 0.6;
const BIGRAM_SCORE_WEIGHT = 0.4;

function sigmoid(value: number): number {
  const clamped = Math.max(SIGMOID_CLAMP_MIN, Math.min(SIGMOID_CLAMP_MAX, value));
  return 1 / (1 + Math.exp(-clamped));
}

function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function buildNGrams(tokens: string[], n: number): Set<string> {
  const grams = new Set<string>();
  if (tokens.length < n || n <= 0) return grams;
  for (let i = 0; i <= tokens.length - n; i += 1) {
    grams.add(tokens.slice(i, i + n).join(' '));
  }
  return grams;
}

function expandTokens(tokens: string[], synonyms?: Record<string, string[]>): Set<string> {
  const expanded = new Set<string>();
  for (const token of tokens) {
    const lower = token.toLowerCase();
    expanded.add(lower);
    if (!synonyms) continue;
    const direct = synonyms[lower];
    if (direct) {
      for (const alt of direct) {
        expanded.add(alt.toLowerCase());
      }
    }
  }
  return expanded;
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const value of a) {
    if (b.has(value)) {
      overlap += 1;
    }
  }
  return overlap / Math.sqrt(a.size * b.size);
}

type LookupEnv = { LOOKUPS_KV?: KVNamespace };

export async function loadLtrWeights(env: LookupEnv): Promise<LtrWeights> {
  if (!env.LOOKUPS_KV) {
    return DEFAULT_WEIGHTS;
  }
  try {
    const stored = await env.LOOKUPS_KV.get('ltr:weights:v1', 'json');
    if (stored && typeof stored === 'object') {
      const data = stored as Partial<LtrWeights>;
      return {
        bias: typeof data.bias === 'number' ? data.bias : DEFAULT_WEIGHTS.bias,
        w_jur: typeof data.w_jur === 'number' ? data.w_jur : DEFAULT_WEIGHTS.w_jur,
        w_ind: typeof data.w_ind === 'number' ? data.w_ind : DEFAULT_WEIGHTS.w_ind,
        w_time: typeof data.w_time === 'number' ? data.w_time : DEFAULT_WEIGHTS.w_time,
        w_size: typeof data.w_size === 'number' ? data.w_size : DEFAULT_WEIGHTS.w_size,
        w_fresh: typeof data.w_fresh === 'number' ? data.w_fresh : DEFAULT_WEIGHTS.w_fresh,
        w_text: typeof data.w_text === 'number' ? data.w_text : DEFAULT_WEIGHTS.w_text
      };
    }
  } catch (err) {
    console.warn('ltr_weights_load_failed', err);
  }
  return DEFAULT_WEIGHTS;
}

export function textSim(
  q: string,
  title: string,
  summary?: string,
  syn?: Record<string, string[]>
): number {
  const qTokens = normalise(q);
  const titleTokens = normalise(title ?? '');
  const summaryTokens = summary ? normalise(summary) : [];

  const qExpanded = expandTokens(qTokens, syn);
  const docTokens = expandTokens([...titleTokens, ...summaryTokens], syn);

  const qBigrams = buildNGrams(Array.from(qExpanded), 2);
  const docBigrams = buildNGrams(Array.from(docTokens), 2);

  const tokenScore = overlapScore(qExpanded, docTokens);
  const bigramScore = overlapScore(qBigrams, docBigrams);

  return Number.isFinite(tokenScore + bigramScore)
    ? Math.min(1, Math.max(0, TOKEN_SCORE_WEIGHT * tokenScore + BIGRAM_SCORE_WEIGHT * bigramScore))
    : 0;
}

export type RerankCandidate = {
  row: any;
  feats: {
    jur: number;
    ind: number;
    time: number;
    size: number;
    fresh: number;
    text: number;
  };
};

export type RerankResult = RerankCandidate & {
  score: number;
  reasons: {
    bias: number;
    jur: number;
    ind: number;
    time: number;
    size: number;
    fresh: number;
    text: number;
  };
};

export function rerank(cands: RerankCandidate[], weights: LtrWeights): RerankResult[] {
  const results = cands.map((cand) => {
    const jur = Number.isFinite(cand.feats.jur) ? cand.feats.jur : 0;
    const ind = Number.isFinite(cand.feats.ind) ? cand.feats.ind : 0;
    const time = Number.isFinite(cand.feats.time) ? cand.feats.time : 0;
    const size = Number.isFinite(cand.feats.size) ? cand.feats.size : 0;
    const fresh = Number.isFinite(cand.feats.fresh) ? cand.feats.fresh : 0;
    const text = Number.isFinite(cand.feats.text) ? cand.feats.text : 0;

    const reasons = {
      bias: weights.bias,
      jur: weights.w_jur * jur,
      ind: weights.w_ind * ind,
      time: weights.w_time * time,
      size: weights.w_size * size,
      fresh: weights.w_fresh * fresh,
      text: weights.w_text * text
    };
    const linear =
      reasons.bias +
      reasons.jur +
      reasons.ind +
      reasons.time +
      reasons.size +
      reasons.fresh +
      reasons.text;
    const score = sigmoid(linear);
    return { ...cand, score, reasons };
  });
  results.sort((a, b) => b.score - a.score);
  return results;
}
