import { z } from 'zod';

export const CountryCode = z.enum(['US', 'CA', 'GB', 'FR', 'PE', 'SE', 'LA', 'UK']);
export type CountryCode = z.infer<typeof CountryCode>;

export const AuthorityLevel = z.enum([
  'federal',
  'state',
  'prov',
  'territory',
  'regional',
  'municipal'
]);
export type AuthorityLevel = z.infer<typeof AuthorityLevel>;

export const ProgramStatus = z.enum(['open', 'scheduled', 'closed', 'unknown']);
export type ProgramStatus = z.infer<typeof ProgramStatus>;

export const BenefitType = z.enum([
  'grant',
  'rebate',
  'tax_credit',
  'loan',
  'guarantee',
  'voucher',
  'other'
]);
export type BenefitType = z.infer<typeof BenefitType>;

export const ProgramBenefit = z.object({
  type: z.string().min(1),
  min_amount_cents: z.number().int().nullable().optional(),
  max_amount_cents: z.number().int().nullable().optional(),
  currency_code: z
    .string()
    .length(3)
    .optional(),
  notes: z.string().optional()
});
export type ProgramBenefit = z.infer<typeof ProgramBenefit>;

export const ProgramCriterion = z.object({
  kind: z.string().min(1),
  operator: z.enum(['=', '!=', '>', '>=', '<', '<=', 'in', 'contains', 'exists', 'not_exists']),
  value: z.string().min(1)
});
export type ProgramCriterion = z.infer<typeof ProgramCriterion>;

export const ProgramTag = z.string().min(1);
export type ProgramTag = z.infer<typeof ProgramTag>;

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const NormalizedProgramSchema = z.object({
  country_code: CountryCode,
  authority_level: AuthorityLevel,
  jurisdiction_code: z.string().min(2),
  title: z.string().min(1),
  summary: z.string().trim().min(1).optional(),
  benefit_type: BenefitType.optional(),
  status: ProgramStatus.default('unknown'),
  industry_codes: z.array(z.string().min(2)).default([]),
  start_date: IsoDate,
  end_date: IsoDate,
  url: z.string().url().optional(),
  source_id: z.number().int().positive().optional(),
  benefits: z.array(ProgramBenefit).default([]),
  criteria: z.array(ProgramCriterion).default([]),
  tags: z.array(ProgramTag).default([])
});
export type NormalizedProgramInput = z.input<typeof NormalizedProgramSchema>;
export type NormalizedProgram = z.infer<typeof NormalizedProgramSchema>;
