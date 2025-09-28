"""Pydantic v2 schema definitions for TechLand's country playbooks.

This module defines a set of data models that mirror the structure of the
country playbooks maintained by TechLand. Each playbook describes
governmental, market and operational considerations for launching and
expanding TechLand initiatives in a specific country. The models here
capture the hierarchical nature of the playbooks and provide typing
annotations for all known fields. Optional fields are marked accordingly.

These models are compatible with Pydantic v2 and can be used for
serialising/deserialising playbook data or validating programmatic
generations of the playbooks.
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class ChangeLogEntry(BaseModel):
    """Represents a single change log record for a playbook."""

    date: date = Field(..., description="Date the change was recorded.")
    version: str = Field(..., description="Version identifier, e.g. v1.0.")
    author: str = Field(..., description="Author of the change.")
    change_summary: str = Field(..., description="Summary of what changed.")


class CoreTeam(BaseModel):
    """RACI matrix representing the core team for a country playbook."""

    responsible: List[str] = Field(
        default_factory=list,
        description="Individuals or roles responsible for executing the playbook."
    )
    accountable: Optional[str] = Field(
        None, description="Person ultimately accountable for the playbook."
    )
    consulted: List[str] = Field(
        default_factory=list,
        description="Stakeholders or functions consulted during development."
    )
    informed: List[str] = Field(
        default_factory=list,
        description="Stakeholders who must be kept informed about progress."
    )


class DocumentControl(BaseModel):
    """Document control metadata for a country playbook."""

    sponsor: Optional[str] = Field(None, description="Executive sponsor for the playbook.")
    country_gm: Optional[str] = Field(None, description="Country General Manager or lead.")
    core_team: Optional[CoreTeam] = Field(
        None, description="RACI structure for the core team."
    )
    related_docs: List[str] = Field(
        default_factory=list,
        description="Links or identifiers to related documentation."
    )
    change_log: List[ChangeLogEntry] = Field(
        default_factory=list,
        description="Chronological log of changes made to the document."
    )


class KPI(BaseModel):
    """Represents a key performance indicator with targets."""

    name: str = Field(..., description="Name of the KPI.")
    baseline: Optional[str] = Field(None, description="Baseline value or description.")
    target_6mo: Optional[str] = Field(None, description="Six‑month target value.")
    target_12mo: Optional[str] = Field(None, description="Twelve‑month target value.")


class InvestmentReturn(BaseModel):
    """High‑level investment and return parameters for the playbook."""

    year1_opex: Optional[str] = Field(None, description="Year‑one operating expenditure.")
    capex: Optional[str] = Field(None, description="Capital expenditure, if any.")
    run_rate_month12: Optional[str] = Field(
        None, description="Expected run‑rate revenue at month twelve."
    )
    breakeven_month: Optional[str] = Field(None, description="Expected month to breakeven.")
    irr_or_npv: Optional[str] = Field(
        None, description="Internal rate of return or net present value for the base case."
    )


class ExecutiveSummary(BaseModel):
    """One‑page executive summary for decision makers."""

    opportunity_thesis: List[str] = Field(
        default_factory=list,
        description="Bullet points summarising the opportunity and thesis."
    )
    ask: Optional[str] = Field(None, description="Go/No‑Go ask and scope definition.")
    initial_scope: List[str] = Field(
        default_factory=list,
        description="Initial segments, regions, products or channels in scope."
    )
    launch_window: Optional[str] = Field(
        None, description="Timeframe for launching the initiative."
    )
    kpis: List[KPI] = Field(
        default_factory=list,
        description="List of top KPIs and their targets."
    )
    investment_return: Optional[InvestmentReturn] = Field(
        None, description="Headline investment and return metrics."
    )
    key_risks: List[str] = Field(
        default_factory=list,
        description="Top risks and associated mitigations."
    )


class SnapshotAttribute(BaseModel):
    """Represents a single attribute in the country snapshot."""

    attribute: str = Field(..., description="Name of the attribute, e.g., Population.")
    value: Optional[str] = Field(None, description="The numeric or descriptive value.")
    source: Optional[str] = Field(None, description="Citation or source for the value.")


class CountrySnapshot(BaseModel):
    """Macro and context information for a country."""

    attributes: List[SnapshotAttribute] = Field(
        default_factory=list,
        description="At‑a‑glance attributes such as population, GDP, internet penetration."
    )
    context_callouts: List[str] = Field(
        default_factory=list,
        description="Notable behavioural, cultural or regulatory nuances."
    )


class Segment(BaseModel):
    """A target customer segment with accompanying details."""

    rank: int = Field(..., ge=1, description="Rank or priority of the segment.")
    name: str = Field(..., description="Segment name.")
    tam_sam_som: Optional[str] = Field(None, description="Market sizing (TAM/SAM/SOM).")
    problem: Optional[str] = Field(None, description="Customer pain or job‑to‑be‑done.")
    winning_proposition: Optional[str] = Field(
        None, description="Why TechLand wins for this segment."
    )
    entry_motion: Optional[str] = Field(
        None, description="Channel or method to enter the market (e.g., direct, partner)."
    )


class Persona(BaseModel):
    """A simplified persona used for marketing or sales focus."""

    name: str = Field(..., description="Persona name.")
    role: Optional[str] = Field(None, description="Professional role of the persona.")
    buying_power: Optional[str] = Field(None, description="Estimated purchasing power or budget.")
    triggers: Optional[str] = Field(None, description="Factors that trigger buying behaviour.")
    objections: Optional[str] = Field(None, description="Typical objections raised by this persona.")
    required_proof: Optional[str] = Field(None, description="Evidence needed to convince the persona.")


class Segmentation(BaseModel):
    """Customer and segmentation section."""

    segments: List[Segment] = Field(
        default_factory=list,
        description="Ranked list of target customer segments."
    )
    personas: List[Persona] = Field(
        default_factory=list,
        description="Top personas within the target segments."
    )


class ValueProposition(BaseModel):
    """Value proposition and positioning details."""

    elevator_pitch: Optional[str] = Field(None, description="Concise country‑specific elevator pitch.")
    value_pillars: List[str] = Field(
        default_factory=list,
        description="Key value pillars or differentiators."
    )
    proof_points: List[str] = Field(
        default_factory=list,
        description="Proof such as case studies, pilots or metrics."
    )
    competitive_positioning: Optional[str] = Field(
        None,
        description="Positioning category (e.g., leader/challenger) and differentiators."
    )


class LandscapeEntry(BaseModel):
    """Represents competitive or ecosystem entries for a category."""

    category: str = Field(..., description="Category name, e.g., Healthcare platforms.")
    local_incumbents: Optional[str] = Field(None, description="Local incumbent players.")
    global_entrants: Optional[str] = Field(None, description="International entrants.")
    substitutes: Optional[str] = Field(None, description="Alternative or do‑it‑yourself solutions.")


class PartnerEntry(BaseModel):
    """Top potential partners in the ecosystem."""

    name: str = Field(..., description="Name of the partner.")
    why_them: str = Field(..., description="Rationale for choosing this partner.")
    value_exchange: Optional[str] = Field(None, description="Proposed value exchange.")
    intro_path: Optional[str] = Field(None, description="How to get introduced to the partner.")
    owner: Optional[str] = Field(None, description="Individual responsible for engaging this partner.")


class CompetitiveEcosystem(BaseModel):
    """Competitive and ecosystem mapping."""

    landscape: List[LandscapeEntry] = Field(
        default_factory=list,
        description="Categories with local, global and substitute players."
    )
    partners: List[PartnerEntry] = Field(
        default_factory=list,
        description="Shortlist of potential partners to pursue."
    )


class LocalizationChecklist(BaseModel):
    """Checklist of localization requirements."""

    language_tone: Optional[str] = Field(None, description="Language and tone considerations.")
    payments: Optional[str] = Field(None, description="Supported payment methods and taxes.")
    identity_kyc: Optional[str] = Field(None, description="ID flows and acceptable types.")
    addresses_formats: Optional[str] = Field(None, description="Postal, phone and date formats.")
    accessibility: Optional[str] = Field(None, description="Accessibility standards to meet.")
    data_residency_privacy: Optional[str] = Field(None, description="Data residency and privacy requirements.")
    reporting_fields: Optional[str] = Field(None, description="Reporting fields such as tax IDs.")
    support_content_slas: Optional[str] = Field(None, description="Support languages and SLAs.")


class TechDependency(BaseModel):
    """Represents a technical dependency required for localization."""

    dependency: str = Field(..., description="Name of the dependency, e.g., payment gateway.")
    mode: Optional[str] = Field(None, description="Build versus configuration approach.")
    effort: Optional[str] = Field(None, description="Effort estimate (S/M/L).")
    owner: Optional[str] = Field(None, description="Owner responsible for delivering.")
    due_date: Optional[str] = Field(None, description="Due date for the dependency.")


class ProductLocalization(BaseModel):
    """Section describing localization readiness."""

    checklist: Optional[LocalizationChecklist] = Field(
        None, description="Checklist of localization items."
    )
    dependencies: List[TechDependency] = Field(
        default_factory=list, description="List of technical dependencies for localization."
    )


class RegulatoryScope(BaseModel):
    """Regulatory and compliance scope details."""

    entity_licensing: Optional[str] = Field(
        None, description="Required entity type and licensing."
    )
    employment_labor: Optional[str] = Field(
        None, description="Employment or labor constraints and benefits."
    )
    privacy_data: Optional[str] = Field(
        None, description="Key privacy statutes and regulators."
    )
    advertising_claims: Optional[str] = Field(
        None, description="Summary of permissible advertising claims."
    )
    tax: Optional[str] = Field(
        None, description="Indirect and corporate tax regimes with rates."
    )


class RegulatoryCompliance(BaseModel):
    """Regulatory, tax and compliance section."""

    scope: Optional[RegulatoryScope] = Field(
        None, description="Broad scope of legal requirements."
    )
    readiness_gates: List[str] = Field(
        default_factory=list,
        description="Checklist of compliance gates to clear before launch."
    )


class PricePackage(BaseModel):
    """Represents a pricing package within the pricing architecture."""

    package_name: str = Field(..., description="Name of the package, e.g., Starter or Pro.")
    list_price: Optional[str] = Field(None, description="Local list price for the package.")
    floor_price: Optional[str] = Field(None, description="Minimum acceptable price.")
    target_discount: Optional[str] = Field(
        None, description="Typical discount offered off the list price."
    )
    notes: Optional[str] = Field(None, description="Additional notes about the package.")


class UnitEconomics(BaseModel):
    """Unit economics used to evaluate business viability."""

    cac: Optional[str] = Field(None, description="Customer acquisition cost.")
    gross_margin: Optional[str] = Field(None, description="Gross margin percentage.")
    payback_months: Optional[str] = Field(None, description="Months to recover CAC.")
    ltv_cac_ratio: Optional[str] = Field(None, description="Lifetime value to CAC ratio.")


class PricingPackaging(BaseModel):
    """Pricing, packaging and commercial model."""

    packages: List[PricePackage] = Field(
        default_factory=list,
        description="List of pricing packages with prices and discount guardrails."
    )
    unit_economics: Optional[UnitEconomics] = Field(
        None, description="Base case unit economics assumptions."
    )


class ChannelMotion(BaseModel):
    """Represents a go‑to‑market channel and its role."""

    motion: str = Field(..., description="Name of the motion, e.g., Direct sales.")
    role_of_channel: Optional[str] = Field(None, description="Role of the channel.")
    tooling: Optional[str] = Field(None, description="Tools used in this motion.")
    owner: Optional[str] = Field(None, description="Owner of the motion.")


class CampaignEntry(BaseModel):
    """Represents a marketing campaign in the channel plan."""

    month: str = Field(..., description="Month of the campaign, e.g., Jan or Q1.")
    campaign: str = Field(..., description="Name or theme of the campaign.")
    segment: Optional[str] = Field(None, description="Target segment for the campaign.")
    offer: Optional[str] = Field(None, description="Offer or hook used in the campaign.")
    kpi: Optional[str] = Field(None, description="Primary KPI for the campaign.")


class QuotaEntry(BaseModel):
    """Represents quota and coverage for a sales role."""

    role: str = Field(..., description="Sales or support role.")
    count: Optional[int] = Field(None, description="Number of headcount needed.")
    quota: Optional[str] = Field(None, description="Annualized quota amount.")
    territory: Optional[str] = Field(None, description="Assigned territory or accounts.")


class GoToMarketPlan(BaseModel):
    """Sales and marketing strategy for the country."""

    channels: List[ChannelMotion] = Field(
        default_factory=list,
        description="Channel and motion descriptions."
    )
    campaigns: List[CampaignEntry] = Field(
        default_factory=list,
        description="Planned campaigns over the next two quarters."
    )
    quotas: List[QuotaEntry] = Field(
        default_factory=list,
        description="Quota assignments and coverage."
    )


class SupportModel(BaseModel):
    """Support and customer success parameters."""

    hours_languages: Optional[str] = Field(None, description="Support hours and languages.")
    slas: Optional[str] = Field(None, description="Service level agreements for response and resolution.")
    escalations: Optional[str] = Field(None, description="Escalation tiers and on‑call procedures.")
    top_help_topics: List[str] = Field(
        default_factory=list,
        description="Top localized help topics to prepare for."
    )


class SuccessMotion(BaseModel):
    """Represents a customer success motion."""

    motion: str = Field(..., description="Type of success motion, e.g., Onboarding.")
    trigger: str = Field(..., description="Event that triggers the motion.")
    owner: Optional[str] = Field(None, description="Owner of the motion.")
    success_metric: Optional[str] = Field(None, description="Metric to measure success.")


class ServiceSupport(BaseModel):
    """Service, support and customer success plan."""

    support_model: Optional[SupportModel] = Field(None, description="Support model details.")
    success_motions: List[SuccessMotion] = Field(
        default_factory=list,
        description="Customer success motions and triggers."
    )


class OperatingSetupEntry(BaseModel):
    """Represents a decision in the operations setup."""

    area: str = Field(..., description="Area of operations, e.g., payroll & benefits.")
    decision: Optional[str] = Field(None, description="Decision taken for this area.")
    vendor_or_tool: Optional[str] = Field(None, description="Vendor or tool selected.")
    owner: Optional[str] = Field(None, description="Person responsible for this decision.")
    status: Optional[str] = Field(None, description="Status indicator or checklist.")


class HiringPlanEntry(BaseModel):
    """Represents an entry in the hiring plan."""

    role: str = Field(..., description="Position or role to be hired.")
    seniority: Optional[str] = Field(None, description="Level of seniority required.")
    count: Optional[int] = Field(None, description="Number of hires required.")
    month_needed: Optional[str] = Field(
        None, description="Month when the role is required."
    )


class OperationsPeople(BaseModel):
    """Operations and people plan for the country."""

    operating_setup: List[OperatingSetupEntry] = Field(
        default_factory=list,
        description="Decisions regarding logistics, payroll, procurement and IT."
    )
    hiring_plan: List[HiringPlanEntry] = Field(
        default_factory=list,
        description="Plan for hiring key roles in the first two quarters."
    )


class BudgetSummaryEntry(BaseModel):
    """Represents quarterly budget allocations."""

    category: str = Field(..., description="Category name, e.g., People or Marketing.")
    q1: Optional[str] = Field(None, description="Q1 budget.")
    q2: Optional[str] = Field(None, description="Q2 budget.")
    q3: Optional[str] = Field(None, description="Q3 budget.")
    q4: Optional[str] = Field(None, description="Q4 budget.")
    year_total: Optional[str] = Field(None, description="Full year budget.")


class FinancialPlan(BaseModel):
    """Financial planning information."""

    budget_summary: List[BudgetSummaryEntry] = Field(
        default_factory=list,
        description="Summary of quarterly and annual budget."
    )
    upside: Optional[str] = Field(None, description="Upside scenario lever.")
    downside: Optional[str] = Field(None, description="Downside scenario description.")
    buffers: Optional[str] = Field(None, description="Buffer actions for risk mitigation.")


class MilestoneEntry(BaseModel):
    """Represents a milestone and its exit criteria."""

    period: str = Field(..., description="Time period, e.g., M1 or Week 2.")
    milestone: str = Field(..., description="Milestone description.")
    exit_criteria: Optional[str] = Field(
        None, description="Criteria to consider the milestone complete."
    )
    owner: Optional[str] = Field(None, description="Responsible owner for the milestone.")
    status: Optional[str] = Field(None, description="Status indicator, e.g., [ ] or completed.")


class StageGateEntry(BaseModel):
    """Represents a stage gate criterion."""

    name: str = Field(..., description="Gate description, e.g., Legal approvals complete.")
    status: Optional[str] = Field(None, description="Checklist status for the gate.")


class Milestones(BaseModel):
    """Milestones, timeline and stage gates."""

    plan: List[MilestoneEntry] = Field(
        default_factory=list,
        description="90‑/180‑day plan with milestones and exit criteria."
    )
    stage_gates: List[StageGateEntry] = Field(
        default_factory=list,
        description="List of gate criteria that must be met."
    )


class RAIDEntry(BaseModel):
    """Represents a risk, assumption, issue or dependency."""

    type: str = Field(..., description="Type of entry: Risk, Assumption, Issue or Dependency.")
    description: str = Field(..., description="Detailed description of the entry.")
    impact: Optional[str] = Field(None, description="High/Medium/Low impact.")
    likelihood: Optional[str] = Field(None, description="High/Medium/Low likelihood for risks.")
    owner: Optional[str] = Field(None, description="Owner responsible for this item.")
    mitigation: Optional[str] = Field(
        None, description="Mitigation plan or next steps for the entry."
    )
    status: Optional[str] = Field(None, description="Status indicator or checklist.")


class RAID(BaseModel):
    """Risk, Assumption, Issue and Dependency log."""

    entries: List[RAIDEntry] = Field(
        default_factory=list,
        description="Living log of risks, assumptions, issues and dependencies."
    )


class CountryPlaybook(BaseModel):
    """Top‑level model for a single country playbook."""

    country: str = Field(..., description="Country name.")
    version: Optional[str] = Field(None, description="Version of the playbook.")
    last_updated: Optional[date] = Field(
        None, description="Date of last update to the playbook."
    )
    doc_owner: Optional[str] = Field(None, description="Document owner or author.")
    document_control: Optional[DocumentControl] = Field(
        None, description="Cover and document control metadata."
    )
    executive_summary: Optional[ExecutiveSummary] = Field(
        None, description="One‑page executive summary."
    )
    snapshot: Optional[CountrySnapshot] = Field(
        None, description="Macro and context snapshot for the country."
    )
    segmentation: Optional[Segmentation] = Field(
        None, description="Customer segmentation and personas."
    )
    value_proposition: Optional[ValueProposition] = Field(
        None, description="Value proposition and positioning."
    )
    ecosystem: Optional[CompetitiveEcosystem] = Field(
        None, description="Competitive landscape and ecosystem mapping."
    )
    product_localization: Optional[ProductLocalization] = Field(
        None, description="Product and localization readiness."
    )
    regulatory_compliance: Optional[RegulatoryCompliance] = Field(
        None, description="Regulatory, tax and compliance details."
    )
    pricing_packaging: Optional[PricingPackaging] = Field(
        None, description="Pricing, packaging and commercial model."
    )
    go_to_market: Optional[GoToMarketPlan] = Field(
        None, description="Sales and marketing plan."
    )
    service_support: Optional[ServiceSupport] = Field(
        None, description="Service, support and customer success plan."
    )
    operations_people: Optional[OperationsPeople] = Field(
        None, description="Operations and people setup details."
    )
    financial_plan: Optional[FinancialPlan] = Field(
        None, description="Financial plan and scenarios."
    )
    milestones: Optional[Milestones] = Field(
        None, description="Milestones, timeline and stage gates."
    )
    raid: Optional[RAID] = Field(
        None, description="Risk, assumptions, issues and dependencies log."
    )
    regional_focus: Optional[str] = Field(
        None,
        description="Optional region‑specific notes, such as Pacific Northwest grants."
    )


class CountryPlaybooks(BaseModel):
    """Container for multiple country playbooks."""

    playbooks: List[CountryPlaybook] = Field(
        default_factory=list,
        description="List of playbooks covering different countries."
    )
