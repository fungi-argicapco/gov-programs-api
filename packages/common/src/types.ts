import { z } from 'zod';

export const ProgramTag = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1),
  label: z.string().min(1)
});

export const ProgramCriterion = z.object({
  id: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  category: z.enum(['eligibility', 'application', 'award', 'other']).default('other'),
  label: z.string().min(1),
  value: z.string().optional(),
  notes: z.string().optional()
});

export const Program = z.object({
  id: z.string().uuid().optional(),
  sourceId: z.string().optional(),
  sourceName: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  authorityLevel: z.enum(['local', 'regional', 'state', 'federal']).optional(),
  stateCode: z.string().length(2).optional(),
  industries: z.array(z.string()).default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['open', 'scheduled', 'closed', 'unknown']).default('unknown'),
  benefitType: z.enum(['grant', 'rebate', 'tax_credit', 'loan', 'guarantee', 'voucher', 'other']).optional(),
  websiteUrl: z.string().url().optional(),
  applicationUrl: z.string().url().optional(),
  tags: z.array(ProgramTag).default([]),
  criteria: z.array(ProgramCriterion).default([]),
  lastIndexedAt: z.string().optional()
});

export type ProgramT = z.infer<typeof Program>;
export type ProgramTagT = z.infer<typeof ProgramTag>;
export type ProgramCriterionT = z.infer<typeof ProgramCriterion>;

export interface AdapterContext {
  readonly fetch: typeof fetch;
}

export interface AdapterResult {
  programs: ProgramT[];
  raw: unknown;
}

export interface Adapter {
  name: string;
  supports: (sourceUrl: string) => boolean;
  execute: (sourceUrl: string, context: AdapterContext) => Promise<AdapterResult>;
}
