import type { Env } from './db';
import { loadFxToUSD } from '@common/lookups';

export type Profile = {
  country_code: 'US' | 'CA' | 'UK';
  jurisdiction_code?: string;
  naics: string[];
  capex_cents?: number;
  start_date?: string;
  end_date?: string;
};

type ProgramBenefit = {
  type?: string | null;
  notes?: string | null;
  max_amount_cents: number | null;
  min_amount_cents: number | null;
  currency_code: string | null;
};

type ProgramRecord = {
  id: number;
  uid?: string;
  source_id?: number | null;
  country_code: 'US' | 'CA' | 'UK';
  jurisdiction_code?: string | null;
  authority_level?: string | null;
  industry_codes: string[];
  start_date?: string | null;
  end_date?: string | null;
  updated_at: number;
  title?: string;
  summary?: string | null;
  benefit_type?: string | null;
  status?: string | null;
  url?: string | null;
  benefits: ProgramBenefit[];
  criteria?: any[];
  tags: string[];
  score?: number;
};

type Weights = {
  jurisdiction: number;
  industry: number;
  timing: number;
  size: number;
  freshness: number;
};

type ScoreReasons = {
  jurisdiction: number;
  industry: number;
  timing: number;
  size: number;
  freshness: number;
};

type ScoreResult = { score: number; reasons: ScoreReasons };

type ScoreOptions = { fxRates?: Record<string, number>; now?: number };

type StackOptions = {
  env?: Env;
  fxRates?: Record<string, number>;
  now?: number;
};

type StackSelection = ProgramRecord & { stack_value_usd: number };

const DEFAULT_WEIGHTS: Weights = {
  jurisdiction: 30,
  industry: 25,
  timing: 20,
  size: 15,
  freshness: 10
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function loadWeights(env: Env): Promise<Weights> {
  if (!env.LOOKUPS_KV) {
    return DEFAULT_WEIGHTS;
  }
  try {
    const value = await env.LOOKUPS_KV.get('match:weights:v1', 'json');
    if (value && typeof value === 'object') {
      const data = value as Partial<Weights>;
      return {
        jurisdiction: data.jurisdiction ?? DEFAULT_WEIGHTS.jurisdiction,
        industry: data.industry ?? DEFAULT_WEIGHTS.industry,
        timing: data.timing ?? DEFAULT_WEIGHTS.timing,
        size: data.size ?? DEFAULT_WEIGHTS.size,
        freshness: data.freshness ?? DEFAULT_WEIGHTS.freshness
      };
    }
  } catch (err) {
    console.warn('weights_lookup_failed', err);
  }
  return DEFAULT_WEIGHTS;
}

function computeJurisdictionScore(profile: Profile, program: ProgramRecord): number {
  if (program.country_code !== profile.country_code) return 0;
  if (!profile.jurisdiction_code) return 1;
  return program.jurisdiction_code === profile.jurisdiction_code ? 1 : 0.5;
}

function computeIndustryScore(profile: Profile, program: ProgramRecord): number {
  const programCodes = Array.isArray(program.industry_codes) ? program.industry_codes : [];
  const profileCodes = Array.isArray(profile.naics) ? profile.naics : [];
  if (programCodes.length === 0 && profileCodes.length === 0) return 1;
  const setA = new Set(programCodes);
  const setB = new Set(profileCodes);
  let intersection = 0;
  for (const code of setA) {
    if (setB.has(code)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection / union.size;
}

function parseDate(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeTimingScore(profile: Profile, program: ProgramRecord): number {
  const profileStart = parseDate(profile.start_date) ?? Number.NEGATIVE_INFINITY;
  const profileEnd = parseDate(profile.end_date) ?? Number.POSITIVE_INFINITY;
  const programStart = parseDate(program.start_date) ?? Number.NEGATIVE_INFINITY;
  const programEnd = parseDate(program.end_date) ?? Number.POSITIVE_INFINITY;

  const overlapStart = Math.max(profileStart, programStart);
  const overlapEnd = Math.min(profileEnd, programEnd);
  if (overlapStart > overlapEnd) return 0;

  const overlapDuration = overlapEnd - overlapStart;
  if (!Number.isFinite(overlapDuration) || overlapDuration <= 0) {
    return 1;
  }

  const profileDuration = profileEnd - profileStart;
  const programDuration = programEnd - programStart;

  // The overlap ratio is measured against the shortest finite duration so that
  // a full overlap of a short window is rewarded just as much as a long window.
  // Using the smaller bound also guards against overstating alignment when one
  // side has an open-ended range (treated as infinite) by falling back to the
  // finite period that is actually constrained.
  const reference = [profileDuration, programDuration]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)[0];
  if (!reference || reference <= 0) return 1;
  const ratio = overlapDuration / reference;
  return Math.min(1, Math.max(0, ratio));
}

function computeBenefitValueUsd(benefit: ProgramBenefit, fxRates: Record<string, number>): number {
  const amountCents = benefit.max_amount_cents ?? benefit.min_amount_cents ?? 0;
  if (!amountCents) return 0;
  const currency = benefit.currency_code?.toUpperCase() ?? 'USD';
  const rate = fxRates[currency] ?? (currency === 'USD' ? 1 : 0);
  if (!rate) return 0;
  return (amountCents / 100) * rate;
}

function computeProgramValueUsd(program: ProgramRecord, fxRates: Record<string, number>): number {
  const benefits = Array.isArray(program.benefits) ? program.benefits : [];
  let total = 0;
  for (const benefit of benefits) {
    total += computeBenefitValueUsd(benefit, fxRates);
  }
  return total;
}

function computeSizeScore(profile: Profile, program: ProgramRecord, fxRates: Record<string, number>): number {
  const capex = profile.capex_cents ?? 0;
  if (!capex) return 0.5;
  const valueUsd = computeProgramValueUsd(program, fxRates);
  if (valueUsd <= 0) return 0.5;
  const capexUsd = capex / 100;
  if (capexUsd <= 0) return 0.5;
  const ratio = valueUsd / capexUsd;
  return Math.min(1, Math.max(0, ratio));
}

function computeFreshnessScore(program: ProgramRecord, now: number): number {
  const updatedAt = Number(program.updated_at ?? 0);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return 0;
  const ageDays = (now - updatedAt) / ONE_DAY_MS;
  if (ageDays <= 7) return 1;
  if (ageDays >= 180) return 0;
  const slope = (180 - ageDays) / (180 - 7);
  return Math.min(1, Math.max(0, slope));
}

function computeScore(
  profile: Profile,
  program: ProgramRecord,
  weights: Weights,
  fxRates: Record<string, number>,
  now: number
): ScoreResult {
  const jurisdiction = computeJurisdictionScore(profile, program);
  const industry = computeIndustryScore(profile, program);
  const timing = computeTimingScore(profile, program);
  const size = computeSizeScore(profile, program, fxRates);
  const freshness = computeFreshnessScore(program, now);

  const totalWeight =
    weights.jurisdiction + weights.industry + weights.timing + weights.size + weights.freshness;
  const weighted =
    jurisdiction * weights.jurisdiction +
    industry * weights.industry +
    timing * weights.timing +
    size * weights.size +
    freshness * weights.freshness;
  const score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0;
  return {
    score,
    reasons: { jurisdiction, industry, timing, size, freshness }
  };
}

export function scoreProgram(
  profile: Profile,
  program: ProgramRecord,
  weights: Weights,
  opts: ScoreOptions = {}
): number {
  const fxRates = opts.fxRates ?? { USD: 1 };
  if (!fxRates.USD) fxRates.USD = 1;
  const now = opts.now ?? Date.now();
  return computeScore(profile, program, weights, fxRates, now).score;
}

export async function scoreProgramWithReasons(
  profile: Profile,
  program: ProgramRecord,
  weights: Weights,
  env: Env,
  opts: ScoreOptions = {}
): Promise<ScoreResult> {
  const fxRates = opts.fxRates ?? (await loadFxToUSD(env));
  if (!fxRates.USD) fxRates.USD = 1;
  const now = opts.now ?? Date.now();
  return computeScore(profile, program, weights, fxRates, now);
}

function parseCapPercentage(tag: string): number | null {
  const prefix = 'cap:max:';
  if (!tag.startsWith(prefix)) return null;
  const value = tag.slice(prefix.length).trim();
  if (!value.endsWith('%')) return null;
  const numeric = Number(value.slice(0, -1));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric / 100;
}

function cloneProgram(program: ProgramRecord): ProgramRecord {
  return {
    ...program,
    benefits: Array.isArray(program.benefits) ? [...program.benefits] : [],
    tags: Array.isArray(program.tags) ? [...program.tags] : []
  };
}

export async function suggestStack(
  profile: Profile,
  programs: ProgramRecord[],
  opts: StackOptions = {}
): Promise<{ selected: StackSelection[]; value_usd: number; coverage_ratio: number; constraints_hit: string[] }>
{
  const fxRates = opts.fxRates ?? (opts.env ? await loadFxToUSD(opts.env) : { USD: 1 });
  if (!fxRates.USD) fxRates.USD = 1;
  const sorted = [...programs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const selected: StackSelection[] = [];
  const constraints = new Set<string>();
  const bannedTags = new Set<string>();
  const selectedTags = new Set<string>();
  const seenSources = new Set<number>();
  const capexCents = profile.capex_cents ?? 0;
  const capexUsd = capexCents > 0 ? capexCents / 100 : null;
  let totalValueUsd = 0;

  let capexLimitReached = false;

  for (const raw of sorted) {
    const remainingCapexUsd = capexUsd ? capexUsd - totalValueUsd : null;
    if (remainingCapexUsd !== null && remainingCapexUsd <= 0) {
      constraints.add('capex_exhausted');
      break;
    }

    const program = cloneProgram(raw);
    if (program.country_code !== profile.country_code) {
      constraints.add('jurisdiction');
      continue;
    }
    if (profile.jurisdiction_code && program.jurisdiction_code !== profile.jurisdiction_code) {
      constraints.add('jurisdiction');
      continue;
    }
    if (program.source_id && seenSources.has(program.source_id)) {
      constraints.add(`duplicate_source:${program.source_id}`);
      continue;
    }
    const tags = Array.isArray(program.tags) ? program.tags : [];
    let blocked = false;
    for (const tag of tags) {
      if (!tag || tag.startsWith('exclude:') || tag.startsWith('cap:max:')) continue;
      if (bannedTags.has(tag)) {
        constraints.add(`excluded:${tag}`);
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const excludeTags = tags.filter((tag) => tag.startsWith('exclude:'));
    for (const tag of excludeTags) {
      const name = tag.slice('exclude:'.length);
      if (name && selectedTags.has(name)) {
        constraints.add(`mutual_exclusion:${name}`);
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const valueUsd = computeProgramValueUsd(program, fxRates);
    if (valueUsd <= 0) continue;
    let adjustedValueUsd = valueUsd;
    const capTags = tags.map((tag) => ({ tag, pct: parseCapPercentage(tag) })).filter((item) => item.pct);
    if (capTags.length && remainingCapexUsd !== null) {
      let capLimit = remainingCapexUsd;
      for (const item of capTags) {
        if (!item.pct) continue;
        const limit = capexUsd * item.pct;
        capLimit = Math.min(capLimit, limit);
        constraints.add(item.tag);
      }
      adjustedValueUsd = Math.min(adjustedValueUsd, capLimit);
    }
    if (remainingCapexUsd !== null && adjustedValueUsd > remainingCapexUsd) {
      adjustedValueUsd = remainingCapexUsd;
    }
    if (adjustedValueUsd <= 0) continue;

    for (const tag of tags) {
      if (tag.startsWith('exclude:')) {
        const name = tag.slice('exclude:'.length);
        if (name) bannedTags.add(name);
      } else if (!tag.startsWith('cap:max:')) {
        selectedTags.add(tag);
      }
    }

    if (program.source_id) seenSources.add(program.source_id);

    selected.push({ ...program, stack_value_usd: adjustedValueUsd });
    totalValueUsd += adjustedValueUsd;

    if (capexUsd !== null && totalValueUsd >= capexUsd) {
      capexLimitReached = true;
      break;
    }
  }

  if (capexLimitReached) {
    constraints.add('capex_exhausted');
  }

  const denominator = capexUsd && capexUsd > 0 ? capexUsd : totalValueUsd || 1;
  const coverageRatio = denominator > 0 ? Math.min(totalValueUsd / denominator, 1) : 0;

  return {
    selected,
    value_usd: totalValueUsd,
    coverage_ratio: coverageRatio,
    constraints_hit: Array.from(constraints)
  };
}

export type { ProgramRecord, Weights, ScoreReasons, StackSelection };
