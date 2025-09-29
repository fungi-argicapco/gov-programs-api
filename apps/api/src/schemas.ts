import { z } from 'zod';

const isoTimestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected ISO8601 timestamp'
});

export const schemaVersion = z.literal(1);

export const mfaMethodSchema = z.object({
  id: z.string(),
  type: z.enum(['totp', 'webauthn']),
  verified_at: isoTimestamp.nullable()
});

export const userProfileSchema = z.object({
  schema_version: schemaVersion,
  id: z.string(),
  email: z.string().email(),
  display_name: z.string(),
  status: z.enum(['pending', 'active', 'disabled']),
  apps: z.object({
    website: z.boolean(),
    program: z.boolean(),
    canvas: z.boolean()
  }),
  roles: z.array(z.string()),
  mfa_enrolled: z.boolean(),
  mfa_methods: z.array(mfaMethodSchema),
  last_login_at: isoTimestamp.nullable(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const accountRequestCreateSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1),
  requested_apps: z.object({
    website: z.boolean().default(false),
    program: z.boolean().default(true),
    canvas: z.boolean().default(true)
  }),
  justification: z.string().max(1000).optional()
});

export const accountRequestSchema = accountRequestCreateSchema.extend({
  schema_version: schemaVersion,
  id: z.string(),
  status: z.enum(['pending', 'approved', 'declined']),
  created_at: isoTimestamp,
  decided_at: isoTimestamp.optional()
});

export type AccountRequest = z.infer<typeof accountRequestSchema>;

export const decisionTokenSchema = z.object({
  token: z.string(),
  decision: z.enum(['approve', 'decline']),
  reviewer_comment: z.string().max(1000).optional()
});

export const sessionSchema = z.object({
  schema_version: schemaVersion,
  id: z.string(),
  user_id: z.string(),
  issued_at: isoTimestamp,
  expires_at: isoTimestamp,
  mfa_required: z.boolean(),
  ip: z.string().optional(),
  ua: z.string().optional()
});

export type SessionPayload = z.infer<typeof sessionSchema>;

export const canvasSchema = z.object({
  schema_version: schemaVersion,
  id: z.string(),
  owner_id: z.string(),
  title: z.string().min(1),
  summary: z.string().optional(),
  content: z.record(z.string(), z.unknown()),
  status: z.enum(['active', 'archived']),
  created_at: isoTimestamp,
  updated_at: isoTimestamp
});

export const canvasCreateSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  content: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(['active', 'archived']).default('active')
});

export const canvasUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['active', 'archived']).optional(),
  revision: z.number().int().nonnegative().optional()
});

export const canvasVersionSchema = z.object({
  schema_version: schemaVersion,
  id: z.string(),
  canvas_id: z.string(),
  revision: z.number().int(),
  content: z.record(z.string(), z.unknown()),
  diff: z.record(z.string(), z.unknown()).optional(),
  created_at: isoTimestamp,
  created_by: z.string()
});

export const emailTokenPayload = z.object({
  schema_version: schemaVersion,
  id: z.string(),
  token: z.string(),
  purpose: z.string(),
  user_id: z.string().optional(),
  account_request_id: z.string().optional(),
  expires_at: isoTimestamp,
  used_at: isoTimestamp.nullable(),
  created_at: isoTimestamp
});

export type EmailTokenPayload = z.infer<typeof emailTokenPayload>;

export const exampleCanvasContent = {
  problem: [
    'Teams juggle spreadsheets, sticky notes, and slide decks when ideating business models.',
    'New founders struggle to understand how to turn insights into a cohesive plan.'
  ],
  solution: [
    'Provide an interactive Lean Canvas editor built for collaboration and rapid iteration.',
    'Guide each section with industry best practices and real-world examples.'
  ],
  uniqueValueProposition: 'The fastest way to capture, validate, and share your venture hypothesis across the fungiagricap ecosystem.',
  customerSegments: [
    'Internal fungiagricap innovation teams',
    'Program applicants exploring financing options',
    'Partner accelerators and incubators'
  ],
  keyMetrics: [
    'Time-to-first-canvas',
    'Number of validated experiments',
    'Conversion from canvas to submitted program application'
  ],
  channels: [
    'program.fungiagricap.com onboarding',
    'Email nudges from register@fungiagricap.com',
    'Shared templates embedded in community forums'
  ],
  costStructure: [
    'Cloudflare Workers execution costs',
    'Design & UX research',
    'Customer success enablement'
  ],
  revenueStreams: [
    'Program upgrades with premium analytics',
    'Enterprise workspace licensing',
    'Advisory services for high-growth ventures'
  ],
  unfairAdvantage: [
    'Deep integration with fungiagricap funding insights',
    'Multi-app experience spanning website, program, and canvas properties'
  ]
};
