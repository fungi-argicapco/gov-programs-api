import { z } from "zod";

/**
 * Zod schema definitions for TechLand's country playbooks.
 *
 * These schemas mirror the structure of the country playbook documents and can be
 * used to validate, parse or infer TypeScript types for programmatic access.
 */

export const ChangeLogEntrySchema = z.object({
  date: z
    .string()
    .describe("Date the change was recorded (ISO 8601 string)."),
  version: z.string().describe("Version identifier, e.g. v1.0."),
  author: z.string().describe("Author of the change."),
  change_summary: z.string().describe("Summary of what changed."),
});
export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;

export const CoreTeamSchema = z.object({
  responsible: z
    .array(z.string())
    .default([])
    .describe(
      "Individuals or roles responsible for executing the playbook.",
    ),
  accountable: z
    .string()
    .optional()
    .describe("Person ultimately accountable for the playbook."),
  consulted: z
    .array(z.string())
    .default([])
    .describe(
      "Stakeholders or functions consulted during development.",
    ),
  informed: z
    .array(z.string())
    .default([])
    .describe("Stakeholders who must be kept informed about progress."),
});
export type CoreTeam = z.infer<typeof CoreTeamSchema>;

export const DocumentControlSchema = z.object({
  sponsor: z
    .string()
    .optional()
    .describe("Executive sponsor for the playbook."),
  country_gm: z
    .string()
    .optional()
    .describe("Country General Manager or lead."),
  core_team: CoreTeamSchema.optional().describe(
    "RACI structure for the core team.",
  ),
  related_docs: z
    .array(z.string())
    .default([])
    .describe("Links or identifiers to related documentation."),
  change_log: z
    .array(ChangeLogEntrySchema)
    .default([])
    .describe("Chronological log of changes made to the document."),
});
export type DocumentControl = z.infer<typeof DocumentControlSchema>;

export const KpiSchema = z.object({
  name: z.string().describe("Name of the KPI."),
  baseline: z
    .string()
    .optional()
    .describe("Baseline value or description."),
  target_6mo: z
    .string()
    .optional()
    .describe("Six-month target value."),
  target_12mo: z
    .string()
    .optional()
    .describe("Twelve-month target value."),
});
export type KPI = z.infer<typeof KpiSchema>;

export const InvestmentReturnSchema = z.object({
  year1_opex: z
    .string()
    .optional()
    .describe("Year-one operating expenditure."),
  capex: z.string().optional().describe("Capital expenditure, if any."),
  run_rate_month12: z
    .string()
    .optional()
    .describe("Expected run-rate revenue at month twelve."),
  breakeven_month: z
    .string()
    .optional()
    .describe("Expected month to breakeven."),
  irr_or_npv: z
    .string()
    .optional()
    .describe(
      "Internal rate of return or net present value for the base case.",
    ),
});
export type InvestmentReturn = z.infer<typeof InvestmentReturnSchema>;

export const ExecutiveSummarySchema = z.object({
  opportunity_thesis: z
    .array(z.string())
    .default([])
    .describe("Bullet points summarising the opportunity and thesis."),
  ask: z.string().optional().describe("Go/No-Go ask and scope definition."),
  initial_scope: z
    .array(z.string())
    .default([])
    .describe(
      "Initial segments, regions, products or channels in scope.",
    ),
  launch_window: z
    .string()
    .optional()
    .describe("Timeframe for launching the initiative."),
  kpis: z
    .array(KpiSchema)
    .default([])
    .describe("List of top KPIs and their targets."),
  investment_return: InvestmentReturnSchema.optional().describe(
    "Headline investment and return metrics.",
  ),
  key_risks: z
    .array(z.string())
    .default([])
    .describe("Top risks and associated mitigations."),
});
export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

export const SnapshotAttributeSchema = z.object({
  attribute: z
    .string()
    .describe("Name of the attribute, e.g., Population."),
  value: z
    .string()
    .optional()
    .describe("The numeric or descriptive value."),
  source: z
    .string()
    .optional()
    .describe("Citation or source for the value."),
});
export type SnapshotAttribute = z.infer<typeof SnapshotAttributeSchema>;

export const CountrySnapshotSchema = z.object({
  attributes: z
    .array(SnapshotAttributeSchema)
    .default([])
    .describe(
      "At-a-glance attributes such as population, GDP, internet penetration.",
    ),
  context_callouts: z
    .array(z.string())
    .default([])
    .describe(
      "Notable behavioural, cultural or regulatory nuances.",
    ),
});
export type CountrySnapshot = z.infer<typeof CountrySnapshotSchema>;

export const SegmentSchema = z.object({
  rank: z
    .number()
    .int()
    .min(1)
    .describe("Rank or priority of the segment."),
  name: z.string().describe("Segment name."),
  tam_sam_som: z
    .string()
    .optional()
    .describe("Market sizing (TAM/SAM/SOM)."),
  problem: z
    .string()
    .optional()
    .describe("Customer pain or job-to-be-done."),
  winning_proposition: z
    .string()
    .optional()
    .describe("Why TechLand wins for this segment."),
  entry_motion: z
    .string()
    .optional()
    .describe(
      "Channel or method to enter the market (e.g., direct, partner).",
    ),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const PersonaSchema = z.object({
  name: z.string().describe("Persona name."),
  role: z.string().optional().describe("Professional role of the persona."),
  buying_power: z
    .string()
    .optional()
    .describe("Estimated purchasing power or budget."),
  triggers: z
    .string()
    .optional()
    .describe("Factors that trigger buying behaviour."),
  objections: z
    .string()
    .optional()
    .describe("Typical objections raised by this persona."),
  required_proof: z
    .string()
    .optional()
    .describe("Evidence needed to convince the persona."),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const SegmentationSchema = z.object({
  segments: z
    .array(SegmentSchema)
    .default([])
    .describe("Ranked list of target customer segments."),
  personas: z
    .array(PersonaSchema)
    .default([])
    .describe("Top personas within the target segments."),
});
export type Segmentation = z.infer<typeof SegmentationSchema>;

export const ValuePropositionSchema = z.object({
  elevator_pitch: z
    .string()
    .optional()
    .describe("Concise country-specific elevator pitch."),
  value_pillars: z
    .array(z.string())
    .default([])
    .describe("Key value pillars or differentiators."),
  proof_points: z
    .array(z.string())
    .default([])
    .describe("Proof such as case studies, pilots or metrics."),
  competitive_positioning: z
    .string()
    .optional()
    .describe(
      "Positioning category (e.g., leader/challenger) and differentiators.",
    ),
});
export type ValueProposition = z.infer<typeof ValuePropositionSchema>;

export const LandscapeEntrySchema = z.object({
  category: z.string().describe("Category name, e.g., Healthcare platforms."),
  local_incumbents: z
    .string()
    .optional()
    .describe("Local incumbent players."),
  global_entrants: z
    .string()
    .optional()
    .describe("International entrants."),
  substitutes: z
    .string()
    .optional()
    .describe("Alternative or do-it-yourself solutions."),
});
export type LandscapeEntry = z.infer<typeof LandscapeEntrySchema>;

export const PartnerEntrySchema = z.object({
  name: z.string().describe("Name of the partner."),
  why_them: z.string().describe("Rationale for choosing this partner."),
  value_exchange: z
    .string()
    .optional()
    .describe("Proposed value exchange."),
  intro_path: z
    .string()
    .optional()
    .describe("How to get introduced to the partner."),
  owner: z
    .string()
    .optional()
    .describe("Individual responsible for engaging this partner."),
});
export type PartnerEntry = z.infer<typeof PartnerEntrySchema>;

export const CompetitiveEcosystemSchema = z.object({
  landscape: z
    .array(LandscapeEntrySchema)
    .default([])
    .describe(
      "Categories with local, global and substitute players.",
    ),
  partners: z
    .array(PartnerEntrySchema)
    .default([])
    .describe("Shortlist of potential partners to pursue."),
});
export type CompetitiveEcosystem = z.infer<typeof CompetitiveEcosystemSchema>;

export const LocalizationChecklistSchema = z.object({
  language_tone: z
    .string()
    .optional()
    .describe("Language and tone considerations."),
  payments: z
    .string()
    .optional()
    .describe("Supported payment methods and taxes."),
  identity_kyc: z
    .string()
    .optional()
    .describe("ID flows and acceptable types."),
  addresses_formats: z
    .string()
    .optional()
    .describe("Postal, phone and date formats."),
  accessibility: z
    .string()
    .optional()
    .describe("Accessibility standards to meet."),
  data_residency_privacy: z
    .string()
    .optional()
    .describe("Data residency and privacy requirements."),
  reporting_fields: z
    .string()
    .optional()
    .describe("Reporting fields such as tax IDs."),
  support_content_slas: z
    .string()
    .optional()
    .describe("Support languages and SLAs."),
});
export type LocalizationChecklist = z.infer<typeof LocalizationChecklistSchema>;

export const TechDependencySchema = z.object({
  dependency: z
    .string()
    .describe("Name of the dependency, e.g., payment gateway."),
  mode: z
    .string()
    .optional()
    .describe("Build versus configuration approach."),
  effort: z
    .string()
    .optional()
    .describe("Effort estimate (S/M/L)."),
  owner: z.string().optional().describe("Owner responsible for delivering."),
  due_date: z
    .string()
    .optional()
    .describe("Due date for the dependency."),
});
export type TechDependency = z.infer<typeof TechDependencySchema>;

export const ProductLocalizationSchema = z.object({
  checklist: LocalizationChecklistSchema.optional().describe(
    "Checklist of localization items.",
  ),
  dependencies: z
    .array(TechDependencySchema)
    .default([])
    .describe("List of technical dependencies for localization."),
});
export type ProductLocalization = z.infer<typeof ProductLocalizationSchema>;

export const RegulatoryScopeSchema = z.object({
  entity_licensing: z
    .string()
    .optional()
    .describe("Required entity type and licensing."),
  employment_labor: z
    .string()
    .optional()
    .describe("Employment or labor constraints and benefits."),
  privacy_data: z
    .string()
    .optional()
    .describe("Key privacy statutes and regulators."),
  advertising_claims: z
    .string()
    .optional()
    .describe("Summary of permissible advertising claims."),
  tax: z
    .string()
    .optional()
    .describe("Indirect and corporate tax regimes with rates."),
});
export type RegulatoryScope = z.infer<typeof RegulatoryScopeSchema>;

export const RegulatoryComplianceSchema = z.object({
  scope: RegulatoryScopeSchema.optional().describe(
    "Broad scope of legal requirements.",
  ),
  readiness_gates: z
    .array(z.string())
    .default([])
    .describe(
      "Checklist of compliance gates to clear before launch.",
    ),
});
export type RegulatoryCompliance = z.infer<typeof RegulatoryComplianceSchema>;

export const PricePackageSchema = z.object({
  package_name: z
    .string()
    .describe("Name of the package, e.g., Starter or Pro."),
  list_price: z
    .string()
    .optional()
    .describe("Local list price for the package."),
  floor_price: z
    .string()
    .optional()
    .describe("Minimum acceptable price."),
  target_discount: z
    .string()
    .optional()
    .describe("Typical discount offered off the list price."),
  notes: z
    .string()
    .optional()
    .describe("Additional notes about the package."),
});
export type PricePackage = z.infer<typeof PricePackageSchema>;

export const UnitEconomicsSchema = z.object({
  cac: z
    .string()
    .optional()
    .describe("Customer acquisition cost."),
  gross_margin: z
    .string()
    .optional()
    .describe("Gross margin percentage."),
  payback_months: z
    .string()
    .optional()
    .describe("Months to recover CAC."),
  ltv_cac_ratio: z
    .string()
    .optional()
    .describe("Lifetime value to CAC ratio."),
});
export type UnitEconomics = z.infer<typeof UnitEconomicsSchema>;

export const PricingPackagingSchema = z.object({
  packages: z
    .array(PricePackageSchema)
    .default([])
    .describe(
      "List of pricing packages with prices and discount guardrails.",
    ),
  unit_economics: UnitEconomicsSchema.optional().describe(
    "Base case unit economics assumptions.",
  ),
});
export type PricingPackaging = z.infer<typeof PricingPackagingSchema>;

export const ChannelMotionSchema = z.object({
  motion: z.string().describe("Name of the motion, e.g., Direct sales."),
  role_of_channel: z
    .string()
    .optional()
    .describe("Role of the channel."),
  tooling: z
    .string()
    .optional()
    .describe("Tools used in this motion."),
  owner: z
    .string()
    .optional()
    .describe("Owner of the motion."),
});
export type ChannelMotion = z.infer<typeof ChannelMotionSchema>;

export const CampaignEntrySchema = z.object({
  month: z
    .string()
    .describe("Month of the campaign, e.g., Jan or Q1."),
  campaign: z.string().describe("Name or theme of the campaign."),
  segment: z
    .string()
    .optional()
    .describe("Target segment for the campaign."),
  offer: z
    .string()
    .optional()
    .describe("Offer or hook used in the campaign."),
  kpi: z
    .string()
    .optional()
    .describe("Primary KPI for the campaign."),
});
export type CampaignEntry = z.infer<typeof CampaignEntrySchema>;

export const QuotaEntrySchema = z.object({
  role: z.string().describe("Sales or support role."),
  count: z
    .number()
    .int()
    .optional()
    .describe("Number of headcount needed."),
  quota: z
    .string()
    .optional()
    .describe("Annualized quota amount."),
  territory: z
    .string()
    .optional()
    .describe("Assigned territory or accounts."),
});
export type QuotaEntry = z.infer<typeof QuotaEntrySchema>;

export const GoToMarketPlanSchema = z.object({
  channels: z
    .array(ChannelMotionSchema)
    .default([])
    .describe("Channel and motion descriptions."),
  campaigns: z
    .array(CampaignEntrySchema)
    .default([])
    .describe("Planned campaigns over the next two quarters."),
  quotas: z
    .array(QuotaEntrySchema)
    .default([])
    .describe("Quota assignments and coverage."),
});
export type GoToMarketPlan = z.infer<typeof GoToMarketPlanSchema>;

export const SupportModelSchema = z.object({
  hours_languages: z
    .string()
    .optional()
    .describe("Support hours and languages."),
  slas: z
    .string()
    .optional()
    .describe(
      "Service level agreements for response and resolution.",
    ),
  escalations: z
    .string()
    .optional()
    .describe("Escalation tiers and on-call procedures."),
  top_help_topics: z
    .array(z.string())
    .default([])
    .describe("Top localized help topics to prepare for."),
});
export type SupportModel = z.infer<typeof SupportModelSchema>;

export const SuccessMotionSchema = z.object({
  motion: z.string().describe("Type of success motion, e.g., Onboarding."),
  trigger: z.string().describe("Event that triggers the motion."),
  owner: z.string().optional().describe("Owner of the motion."),
  success_metric: z
    .string()
    .optional()
    .describe("Metric to measure success."),
});
export type SuccessMotion = z.infer<typeof SuccessMotionSchema>;

export const ServiceSupportSchema = z.object({
  support_model: SupportModelSchema.optional().describe(
    "Support model details.",
  ),
  success_motions: z
    .array(SuccessMotionSchema)
    .default([])
    .describe("Customer success motions and triggers."),
});
export type ServiceSupport = z.infer<typeof ServiceSupportSchema>;

export const OperatingSetupEntrySchema = z.object({
  area: z
    .string()
    .describe("Area of operations, e.g., payroll & benefits."),
  decision: z
    .string()
    .optional()
    .describe("Decision taken for this area."),
  vendor_or_tool: z
    .string()
    .optional()
    .describe("Vendor or tool selected."),
  owner: z.string().optional().describe("Person responsible for this decision."),
  status: z
    .string()
    .optional()
    .describe("Status indicator or checklist."),
});
export type OperatingSetupEntry = z.infer<typeof OperatingSetupEntrySchema>;

export const HiringPlanEntrySchema = z.object({
  role: z.string().describe("Position or role to be hired."),
  seniority: z
    .string()
    .optional()
    .describe("Level of seniority required."),
  count: z
    .number()
    .int()
    .optional()
    .describe("Number of hires required."),
  month_needed: z
    .string()
    .optional()
    .describe("Month when the role is required."),
});
export type HiringPlanEntry = z.infer<typeof HiringPlanEntrySchema>;

export const OperationsPeopleSchema = z.object({
  operating_setup: z
    .array(OperatingSetupEntrySchema)
    .default([])
    .describe(
      "Decisions regarding logistics, payroll, procurement and IT.",
    ),
  hiring_plan: z
    .array(HiringPlanEntrySchema)
    .default([])
    .describe("Plan for hiring key roles in the first two quarters."),
});
export type OperationsPeople = z.infer<typeof OperationsPeopleSchema>;

export const BudgetSummaryEntrySchema = z.object({
  category: z.string().describe("Category name, e.g., People or Marketing."),
  q1: z.string().optional().describe("Q1 budget."),
  q2: z.string().optional().describe("Q2 budget."),
  q3: z.string().optional().describe("Q3 budget."),
  q4: z.string().optional().describe("Q4 budget."),
  year_total: z.string().optional().describe("Full year budget."),
});
export type BudgetSummaryEntry = z.infer<typeof BudgetSummaryEntrySchema>;

export const FinancialPlanSchema = z.object({
  budget_summary: z
    .array(BudgetSummaryEntrySchema)
    .default([])
    .describe("Summary of quarterly and annual budget."),
  upside: z.string().optional().describe("Upside scenario lever."),
  downside: z.string().optional().describe("Downside scenario description."),
  buffers: z
    .string()
    .optional()
    .describe("Buffer actions for risk mitigation."),
});
export type FinancialPlan = z.infer<typeof FinancialPlanSchema>;

export const MilestoneEntrySchema = z.object({
  period: z
    .string()
    .describe("Time period, e.g., M1 or Week 2."),
  milestone: z.string().describe("Milestone description."),
  exit_criteria: z
    .string()
    .optional()
    .describe("Criteria to consider the milestone complete."),
  owner: z
    .string()
    .optional()
    .describe("Responsible owner for the milestone."),
  status: z
    .string()
    .optional()
    .describe("Status indicator, e.g., [ ] or completed."),
});
export type MilestoneEntry = z.infer<typeof MilestoneEntrySchema>;

export const StageGateEntrySchema = z.object({
  name: z
    .string()
    .describe("Gate description, e.g., Legal approvals complete."),
  status: z
    .string()
    .optional()
    .describe("Checklist status for the gate."),
});
export type StageGateEntry = z.infer<typeof StageGateEntrySchema>;

export const MilestonesSchema = z.object({
  plan: z
    .array(MilestoneEntrySchema)
    .default([])
    .describe(
      "90-/180-day plan with milestones and exit criteria.",
    ),
  stage_gates: z
    .array(StageGateEntrySchema)
    .default([])
    .describe("List of gate criteria that must be met."),
});
export type Milestones = z.infer<typeof MilestonesSchema>;

export const RaidEntrySchema = z.object({
  type: z
    .string()
    .describe("Type of entry: Risk, Assumption, Issue or Dependency."),
  description: z
    .string()
    .describe("Detailed description of the entry."),
  impact: z
    .string()
    .optional()
    .describe("High/Medium/Low impact."),
  likelihood: z
    .string()
    .optional()
    .describe("High/Medium/Low likelihood for risks."),
  owner: z
    .string()
    .optional()
    .describe("Owner responsible for this item."),
  mitigation: z
    .string()
    .optional()
    .describe("Mitigation plan or next steps for the entry."),
  status: z
    .string()
    .optional()
    .describe("Status indicator or checklist."),
});
export type RAIDEntry = z.infer<typeof RaidEntrySchema>;

export const RaidSchema = z.object({
  entries: z
    .array(RaidEntrySchema)
    .default([])
    .describe(
      "Living log of risks, assumptions, issues and dependencies.",
    ),
});
export type RAID = z.infer<typeof RaidSchema>;

export const CountryPlaybookSchema = z.object({
  country: z.string().describe("Country name."),
  version: z.string().optional().describe("Version of the playbook."),
  last_updated: z
    .string()
    .optional()
    .describe("Date of last update to the playbook (ISO 8601)."),
  doc_owner: z
    .string()
    .optional()
    .describe("Document owner or author."),
  document_control: DocumentControlSchema.optional().describe(
    "Cover and document control metadata.",
  ),
  executive_summary: ExecutiveSummarySchema.optional().describe(
    "One-page executive summary.",
  ),
  snapshot: CountrySnapshotSchema.optional().describe(
    "Macro and context snapshot for the country.",
  ),
  segmentation: SegmentationSchema.optional().describe(
    "Customer segmentation and personas.",
  ),
  value_proposition: ValuePropositionSchema.optional().describe(
    "Value proposition and positioning.",
  ),
  ecosystem: CompetitiveEcosystemSchema.optional().describe(
    "Competitive landscape and ecosystem mapping.",
  ),
  product_localization: ProductLocalizationSchema.optional().describe(
    "Product and localization readiness.",
  ),
  regulatory_compliance: RegulatoryComplianceSchema.optional().describe(
    "Regulatory, tax and compliance details.",
  ),
  pricing_packaging: PricingPackagingSchema.optional().describe(
    "Pricing, packaging and commercial model.",
  ),
  go_to_market: GoToMarketPlanSchema.optional().describe(
    "Sales and marketing plan.",
  ),
  service_support: ServiceSupportSchema.optional().describe(
    "Service, support and customer success plan.",
  ),
  operations_people: OperationsPeopleSchema.optional().describe(
    "Operations and people setup details.",
  ),
  financial_plan: FinancialPlanSchema.optional().describe(
    "Financial plan and scenarios.",
  ),
  milestones: MilestonesSchema.optional().describe(
    "Milestones, timeline and stage gates.",
  ),
  raid: RaidSchema.optional().describe(
    "Risk, assumptions, issues and dependencies log.",
  ),
  regional_focus: z
    .string()
    .optional()
    .describe(
      "Optional region-specific notes, such as Pacific Northwest grants.",
    ),
});
export type CountryPlaybook = z.infer<typeof CountryPlaybookSchema>;

export const CountryPlaybooksSchema = z.object({
  playbooks: z
    .array(CountryPlaybookSchema)
    .default([])
    .describe(
      "List of playbooks covering different countries.",
    ),
});
export type CountryPlaybooks = z.infer<typeof CountryPlaybooksSchema>;

export const schemas = {
  ChangeLogEntrySchema,
  CoreTeamSchema,
  DocumentControlSchema,
  KpiSchema,
  InvestmentReturnSchema,
  ExecutiveSummarySchema,
  SnapshotAttributeSchema,
  CountrySnapshotSchema,
  SegmentSchema,
  PersonaSchema,
  SegmentationSchema,
  ValuePropositionSchema,
  LandscapeEntrySchema,
  PartnerEntrySchema,
  CompetitiveEcosystemSchema,
  LocalizationChecklistSchema,
  TechDependencySchema,
  ProductLocalizationSchema,
  RegulatoryScopeSchema,
  RegulatoryComplianceSchema,
  PricePackageSchema,
  UnitEconomicsSchema,
  PricingPackagingSchema,
  ChannelMotionSchema,
  CampaignEntrySchema,
  QuotaEntrySchema,
  GoToMarketPlanSchema,
  SupportModelSchema,
  SuccessMotionSchema,
  ServiceSupportSchema,
  OperatingSetupEntrySchema,
  HiringPlanEntrySchema,
  OperationsPeopleSchema,
  BudgetSummaryEntrySchema,
  FinancialPlanSchema,
  MilestoneEntrySchema,
  StageGateEntrySchema,
  MilestonesSchema,
  RaidEntrySchema,
  RaidSchema,
  CountryPlaybookSchema,
  CountryPlaybooksSchema,
};
