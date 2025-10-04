import type { EvidenceBlockProps, ReportCardData } from '@atlas/components';

export type PartnerProfile = {
  id: string;
  name: string;
  location: string;
  focusAreas: string[];
  deliveryModel: string;
  report: ReportCardData & { accent?: 'primary' | 'info' | 'neutral' };
  evidence: EvidenceBlockProps[];
};

export const PARTNERS: PartnerProfile[] = [
  {
    id: 'brightgrid',
    name: 'BrightGrid Cooperative',
    location: 'Portland, OR',
    focusAreas: ['Microgrid design', 'Resilience hubs', 'Workforce enablement'],
    deliveryModel: 'Non-profit systems integrator',
    report: {
      title: 'BrightGrid Cooperative',
      subtitle: 'Decentralized energy retrofit partner with strong community trust.',
      accent: 'info',
      metrics: [
        {
          key: 'scale',
          label: 'Scale',
          score: 76,
          summary: 'Active in nine states with public utility partnerships.'
        },
        {
          key: 'focus',
          label: 'Focus',
          score: 84,
          summary: 'Specialized in equitable microgrid deployments and co-ops.'
        },
        {
          key: 'speed',
          label: 'Speed',
          score: 71,
          summary: 'Can mobilize pre-qualified installers within six weeks.'
        },
        {
          key: 'reliability',
          label: 'Reliability',
          score: 88,
          summary: 'Audited quarterly with transparent delivery metrics.'
        },
        {
          key: 'additionality',
          label: 'Additionality',
          score: 74,
          summary: 'Unlocks philanthropic match and workforce credits.'
        }
      ],
      references: [
        { label: 'BrightGrid impact report 2024', href: 'https://brightgrid.coop/impact' }
      ]
    },
    evidence: [
      {
        source: 'TechLand partner diligence',
        freshness: '5d ago',
        lineageHref: 'https://atlas.techland.gov/partners/brightgrid'
      }
    ]
  },
  {
    id: 'synapse-labs',
    name: 'Synapse Labs',
    location: 'Boston, MA',
    focusAreas: ['Data platform', 'Blueprint automation', 'Interoperability'],
    deliveryModel: 'For-profit technology vendor',
    report: {
      title: 'Synapse Labs',
      subtitle: 'Modular civic data platform powering stack insights.',
      accent: 'primary',
      metrics: [
        {
          key: 'scale',
          label: 'Scale',
          score: 81,
          summary: 'Deployed across 40 jurisdictions with API-first approach.'
        },
        {
          key: 'focus',
          label: 'Focus',
          score: 72,
          summary: 'Strong capital planning and analytics modules.'
        },
        {
          key: 'speed',
          label: 'Speed',
          score: 64,
          summary: 'Blueprint workspace live within 30 days of award.'
        },
        {
          key: 'reliability',
          label: 'Reliability',
          score: 78,
          summary: 'SOC2 Type II with weekly uptime reports.'
        },
        {
          key: 'additionality',
          label: 'Additionality',
          score: 69,
          summary: 'Comes bundled with adoption playbooks and civic fellows.'
        }
      ],
      references: [
        { label: 'Synapse Labs security whitepaper', href: 'https://synapse.labs/security' }
      ]
    },
    evidence: [
      {
        source: 'Vendor security attestation',
        freshness: '9d ago',
        lineageHref: 'https://synapse.labs/trust'
      },
      {
        source: 'TechLand delivery dashboard',
        freshness: '12h ago',
        lineageHref: 'https://atlas.techland.gov/intelligence/vendors'
      }
    ]
  },
  {
    id: 'northwind-builders',
    name: 'Northwind Builders',
    location: 'Duluth, MN',
    focusAreas: ['Rural broadband', 'Critical facilities', 'Emergency shelters'],
    deliveryModel: 'Regional general contractor',
    report: {
      title: 'Northwind Builders',
      subtitle: 'Rural delivery partner with deep FEMA coordination credentials.',
      accent: 'neutral',
      metrics: [
        {
          key: 'scale',
          label: 'Scale',
          score: 58,
          summary: 'Operates across Great Lakes and Upper Midwest corridors.'
        },
        {
          key: 'focus',
          label: 'Focus',
          score: 61,
          summary: 'Resilience retrofits and shelter hardening.'
        },
        {
          key: 'speed',
          label: 'Speed',
          score: 66,
          summary: 'Rapid deployment with pre-certified subs for emergency work.'
        },
        {
          key: 'reliability',
          label: 'Reliability',
          score: 74,
          summary: 'Strong past performance with FEMA and state EOCs.'
        },
        {
          key: 'additionality',
          label: 'Additionality',
          score: 63,
          summary: 'Unlocks FEMA cost share waivers and local workforce credits.'
        }
      ],
      references: [
        { label: 'USACE past performance summary', href: 'https://usace.mil/northwind' }
      ]
    },
    evidence: [
      {
        source: 'TechLand partner verification',
        freshness: '3d ago',
        lineageHref: 'https://atlas.techland.gov/partners/northwind'
      }
    ]
  }
];
