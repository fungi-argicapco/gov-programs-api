import { describe, expect, it } from 'vitest';

import { mapCkanGC, mapCkanProvON, mapGrantsGov, mapSamAssistance } from './mappers';

describe('mapGrantsGov', () => {
  it('normalizes opportunity rows and derives status', () => {
    const result = mapGrantsGov({
      opportunity: {
        OpportunityTitle: 'Water Infrastructure Grants',
        Synopsis: 'Funding for municipal water projects.',
        PostDate: '2024-01-01',
        CloseDate: '2100-12-31',
        OpportunityNumber: 'WATER-123',
        category: ['infrastructure'],
        eligibilityCategory: ['municipalities']
      }
    });

    expect(result.title).toBe('Water Infrastructure Grants');
    expect(result.summary).toContain('municipal water');
    expect(result.url).toBe('https://www.grants.gov/search-results-detail/WATER-123');
    expect(result.status).toBe('open');
    expect(result.tags).toEqual(['infrastructure']);
    expect(result.criteria).toEqual([
      { kind: 'eligibility', operator: 'matches', value: 'municipalities' }
    ]);
  });
});

describe('mapSamAssistance', () => {
  it('extracts listing metadata from matched object descriptors', () => {
    const result = mapSamAssistance({
      matchedObjectId: '12.345',
      matchedObjectDescriptor: {
        assistanceListingTitle: 'Energy Efficiency Support',
        assistanceListingNumber: '12.345',
        assistanceListingDescription: 'Support for state-level energy upgrades.',
        applicantTypes: ['state'],
        businessCategories: ['energy']
      }
    });

    expect(result.title).toBe('Energy Efficiency Support');
    expect(result.summary).toContain('energy upgrades');
    expect(result.url).toBe('https://sam.gov/fal/12.345');
    expect(result.tags).toEqual(['energy']);
    expect(result.criteria).toEqual([
      { kind: 'applicant_type', operator: 'eq', value: 'state' }
    ]);
  });
});

describe('mapCkanGC', () => {
  it('selects preferred resource links and flattens tag names', () => {
    const result = mapCkanGC({
      result: {},
      resources: [
        { url: 'https://example.com/data.csv', format: 'CSV' },
        { url: 'https://example.com/info', format: 'HTML' }
      ],
      title: 'Innovation Assistance',
      notes: 'Program details',
      tags: [{ name: 'innovation' }]
    });

    expect(result.title).toBe('Innovation Assistance');
    expect(result.url).toBe('https://example.com/info');
    expect(result.tags).toEqual(['innovation']);
  });

  it('normalizes mixed CKAN tag representations and defaults the title', () => {
    const result = mapCkanGC({
      resources: [],
      tags: ['clean-tech', { name: 'manufacturing' }, { value: 'ignored' }]
    });

    expect(result.title).toBe('Government of Canada Program');
    expect(result.tags).toEqual(['clean-tech', 'manufacturing']);
  });
});

describe('mapCkanProvON', () => {
  it('handles provincial CKAN payloads', () => {
    const result = mapCkanProvON({
      title: 'Ontario Technology Grants',
      description: 'Support for technology firms.',
      resources: [{ url: 'https://ontario.ca/program', format: 'HTML' }],
      tags: ['technology']
    });

    expect(result.title).toBe('Ontario Technology Grants');
    expect(result.summary).toContain('technology firms');
    expect(result.url).toBe('https://ontario.ca/program');
    expect(result.tags).toEqual(['technology']);
  });
});
