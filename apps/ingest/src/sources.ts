import type { DataSource } from './types.js';

/**
 * Configuration for external data sources
 * In a production environment, these would be stored in environment variables or a configuration service
 */
export const DATA_SOURCES: DataSource[] = [
  {
    name: 'SBA Programs',
    url: 'https://api.sba.gov/v1/programs',
    type: 'api',
    enabled: true,
  },
  {
    name: 'USDA Rural Development',
    url: 'https://www.rd.usda.gov/api/programs',
    type: 'api',
    enabled: true,
  },
  {
    name: 'Energy.gov Incentives',
    url: 'https://developer.nrel.gov/api/transportation/incentives-laws/v1',
    type: 'api',
    enabled: true,
  },
  {
    name: 'State Business Incentives',
    url: 'https://data.gov/api/business-incentives',
    type: 'api',
    enabled: false, // Disabled by default - would need API keys
  },
  // Add more data sources as needed
];

/**
 * Sample mock data for demonstration purposes
 */
export const MOCK_PROGRAMS = [
  {
    title: 'Small Business Innovation Research (SBIR)',
    description: 'Federal program that encourages domestic small businesses to engage in Federal Research/Research and Development with the potential for commercialization.',
    type: 'funding' as const,
    status: 'active' as const,
    geographyLevel: 'federal' as const,
    industries: ['technology', 'manufacturing', 'healthcare'],
    eligibilityRequirements: 'Small business must be majority-owned by US citizens and have fewer than 500 employees.',
    benefitAmount: 'Phase I: Up to $275,000; Phase II: Up to $1,750,000',
    websiteUrl: 'https://www.sbir.gov/',
    tags: ['small business', 'research', 'innovation', 'technology'],
  },
  {
    title: 'California Solar Initiative',
    description: 'State program providing rebates for solar energy system installations on existing homes and businesses.',
    type: 'rebate' as const,
    status: 'active' as const,
    geographyLevel: 'state' as const,
    state: 'CA',
    industries: ['renewable_energy', 'construction'],
    eligibilityRequirements: 'Property owners in California with existing structures eligible for solar installations.',
    benefitAmount: 'Up to $3,000 per residential system',
    applicationDeadline: '2024-12-31T23:59:59.000Z',
    websiteUrl: 'https://www.californiasolaarinitiative.org/',
    tags: ['solar', 'renewable energy', 'rebate', 'california'],
  },
  {
    title: 'Austin Green Building Program',
    description: 'Local incentive program for sustainable building practices and energy-efficient construction in Austin, Texas.',
    type: 'incentive' as const,
    status: 'active' as const,
    geographyLevel: 'local' as const,
    state: 'TX',
    city: 'Austin',
    industries: ['construction', 'energy'],
    eligibilityRequirements: 'New construction or major renovation projects within Austin city limits meeting green building standards.',
    benefitAmount: 'Property tax reduction up to 10 years',
    websiteUrl: 'https://austintexas.gov/department/green-building',
    tags: ['green building', 'sustainability', 'property tax', 'austin'],
  },
  {
    title: 'USDA Rural Business Development Grants',
    description: 'Federal grants to support rural business development and job creation in rural communities.',
    type: 'funding' as const,
    status: 'active' as const,
    geographyLevel: 'federal' as const,
    industries: ['agriculture', 'small_business', 'manufacturing'],
    eligibilityRequirements: 'Businesses in rural areas with population under 50,000. Must demonstrate job creation potential.',
    benefitAmount: 'Up to $500,000 per grant',
    programStartDate: '2024-01-01T00:00:00.000Z',
    programEndDate: '2024-09-30T23:59:59.000Z',
    websiteUrl: 'https://www.rd.usda.gov/programs-services/business-programs/rural-business-development-grants',
    tags: ['rural development', 'business grants', 'job creation', 'usda'],
  },
  {
    title: 'New York State Manufacturing Extension Partnership',
    description: 'State program providing technical assistance and grants to manufacturing companies for productivity improvements.',
    type: 'credit' as const,
    status: 'active' as const,
    geographyLevel: 'state' as const,
    state: 'NY',
    industries: ['manufacturing', 'technology'],
    eligibilityRequirements: 'Manufacturing companies located in New York State with fewer than 500 employees.',
    benefitAmount: 'Tax credits up to $200,000 per year',
    websiteUrl: 'https://esd.ny.gov/manufacturing-extension-partnership',
    tags: ['manufacturing', 'productivity', 'tax credit', 'new york'],
  },
];