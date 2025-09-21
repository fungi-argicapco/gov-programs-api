import { z } from 'zod';

// Government Program Types
export const GeographyLevel = z.enum(['local', 'regional', 'state', 'federal']);
export type GeographyLevel = z.infer<typeof GeographyLevel>;

export const ProgramType = z.enum(['funding', 'credit', 'rebate', 'incentive']);
export type ProgramType = z.infer<typeof ProgramType>;

export const IndustryCategory = z.enum([
  'agriculture',
  'automotive',
  'construction',
  'education',
  'energy',
  'healthcare',
  'manufacturing',
  'nonprofit',
  'small_business',
  'technology',
  'transportation',
  'renewable_energy',
  'other'
]);
export type IndustryCategory = z.infer<typeof IndustryCategory>;

export const ProgramStatus = z.enum(['active', 'inactive', 'pending', 'expired']);
export type ProgramStatus = z.infer<typeof ProgramStatus>;

// Main Program Schema
export const GovernmentProgram = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  type: ProgramType,
  status: ProgramStatus,
  geographyLevel: GeographyLevel,
  state: z.string().length(2).optional(), // US state code
  city: z.string().max(100).optional(),
  county: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  industries: z.array(IndustryCategory),
  eligibilityRequirements: z.string(),
  benefitAmount: z.string().optional(), // Flexible format for different benefit types
  applicationDeadline: z.string().datetime().optional(),
  programStartDate: z.string().datetime().optional(),
  programEndDate: z.string().datetime().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  applicationUrl: z.string().url().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastVerified: z.string().datetime().optional(),
});

export type GovernmentProgram = z.infer<typeof GovernmentProgram>;

// Search Query Schema
export const SearchQuery = z.object({
  query: z.string().optional(),
  type: ProgramType.optional(),
  geographyLevel: GeographyLevel.optional(),
  state: z.string().length(2).optional(),
  city: z.string().optional(),
  industries: z.array(IndustryCategory).optional(),
  status: ProgramStatus.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type SearchQuery = z.infer<typeof SearchQuery>;

// API Response Types
export const ProgramSearchResult = z.object({
  programs: z.array(GovernmentProgram),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type ProgramSearchResult = z.infer<typeof ProgramSearchResult>;

export const ApiError = z.object({
  error: z.string(),
  message: z.string(),
  status: z.number(),
});

export type ApiError = z.infer<typeof ApiError>;