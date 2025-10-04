import type { EvidenceBlockProps, ReportCardData } from '@atlas/components';

export type CapitalProgram = {
  id: string;
  title: string;
  category: string;
  geography: string;
  awardCeiling: string;
  closing: string;
  stackFit: 'High fit' | 'Medium fit' | 'Watch';
  report: ReportCardData & { accent?: 'primary' | 'info' | 'neutral' };
  evidence: EvidenceBlockProps[];
};

export const CAPITAL_PROGRAMS: CapitalProgram[] = [
  {
    id: 'doe-industrial-decarbonization',
    title: 'DOE Industrial Decarbonization Program',
    category: 'Clean Manufacturing',
    geography: 'United States · Federal',
    awardCeiling: '$12,000,000',
    closing: 'Apr 18, 2025',
    stackFit: 'High fit',
    report: {
      title: 'Industrial Decarbonization Cohort',
      subtitle: 'Supports retrofit of high-emissions industrial clusters with clean heat systems.',
      accent: 'primary',
      metrics: [
        {
          key: 'scale',
          label: 'Scale',
          score: 88,
          summary: 'Nationwide eligibility with emphasis on heavy industry corridors.',
          details: ['Aligns with TechLand-identified emissions hotspots.']
        },
        {
          key: 'focus',
          label: 'Focus',
          score: 74,
          summary: 'Targets deep decarbonization projects with measurable reductions.'
        },
        {
          key: 'speed',
          label: 'Speed',
          score: 69,
          summary: 'Average award turnaround of 120 days with phased disbursements.'
        },
        {
          key: 'reliability',
          label: 'Reliability',
          score: 71,
          summary: 'Strong DOE compliance history and quarterly reporting cadence.'
        },
        {
          key: 'additionality',
          label: 'Additionality',
          score: 82,
          summary: 'Stackable with state green bank facilities and industrial tax credits.'
        }
      ],
      references: [
        {
          label: 'FOA-2991 overview',
          href: 'https://www.energy.gov/'
        },
        {
          label: 'Stack builder template',
          href: 'https://techland.gov/stacks'
        }
      ]
    },
    evidence: [
      {
        source: 'DOE FOA Library',
        freshness: '2d ago',
        lineageHref: 'https://energy.gov/foa-2991'
      },
      {
        source: 'TechLand Ingest Pipeline',
        freshness: '4h ago',
        lineageHref: 'https://atlas.techland.gov/ingest/runs/1032'
      }
    ]
  },
  {
    id: 'hud-green-resilience',
    title: 'HUD Green Resilience Accelerator',
    category: 'Housing & Community',
    geography: 'United States · Metro priority',
    awardCeiling: '$7,500,000',
    closing: 'May 1, 2025',
    stackFit: 'Medium fit',
    report: {
      title: 'HUD Green Resilience',
      subtitle: 'Funds deep retrofits for public housing authorities with resilience co-benefits.',
      accent: 'info',
      metrics: [
        {
          key: 'scale',
          label: 'Scale',
          score: 62,
          summary: 'Limited to designated resilience corridors and tribal territories.'
        },
        {
          key: 'focus',
          label: 'Focus',
          score: 79,
          summary: 'Pairs energy savings with resilience and workforce outcomes.',
          details: ['Bonus scoring for local hire and apprenticeship commitments.']
        },
        {
          key: 'speed',
          label: 'Speed',
          score: 58,
          summary: 'Phase I planning grants; construction unlocks after milestone review.'
        },
        {
          key: 'reliability',
          label: 'Reliability',
          score: 83,
          summary: 'HUD-managed with strong oversight and obligational certainty.'
        },
        {
          key: 'additionality',
          label: 'Additionality',
          score: 68,
          summary: 'Pairs well with IRA home energy rebates and CDFI green bonds.'
        }
      ],
      references: [
        {
          label: 'NOFO 2025-412 guidance',
          href: 'https://hud.gov/nofo-2025-412'
        },
        {
          label: 'Eligible resilience corridors map',
          href: 'https://atlas.techland.gov/maps/resilience-corridors'
        }
      ]
    },
    evidence: [
      {
        source: 'HUD Grants Catalog',
        freshness: '1d ago',
        lineageHref: 'https://hud.gov/grants/green-resilience'
      }
    ]
  },
  {
    id: 'transport-smart-ports',
    title: 'DOT Smart Ports Initiative',
    category: 'Transportation',
    geography: 'United States · Coastal metros',
    awardCeiling: '$18,000,000',
    closing: 'Jun 14, 2025',
    stackFit: 'Watch',
    report: {
      title: 'DOT Smart Ports',
      subtitle: 'Pilots digital twins, automation, and port electrification stacks.',
      accent: 'neutral',
      metrics: [
        {
          key: 'scale',
          label: 'Scale',
          score: 54,
          summary: 'Select coastal metros with active port authority partnerships.'
        },
        {
          key: 'focus',
          label: 'Focus',
          score: 66,
          summary: 'Emphasis on throughput, emissions reduction, and community benefits.'
        },
        {
          key: 'speed',
          label: 'Speed',
          score: 45,
          summary: 'Lengthy environmental review and NEPA approvals expected.'
        },
        {
          key: 'reliability',
          label: 'Reliability',
          score: 72,
          summary: 'DOT discretionary grant with staged reporting requirements.'
        },
        {
          key: 'additionality',
          label: 'Additionality',
          score: 59,
          summary: 'Limited stacking with maritime tax credits; strong R&D fit.',
          details: ['Pairs with DOE SHIPP and state port electrification bonds.']
        }
      ],
      references: [
        {
          label: 'NOFO 24-118 technical appendix',
          href: 'https://transportation.gov/nofo-24-118'
        }
      ]
    },
    evidence: [
      {
        source: 'DOT Mariner',
        freshness: '6d ago',
        lineageHref: 'https://transportation.gov/dot-smart-ports'
      }
    ]
  }
];
