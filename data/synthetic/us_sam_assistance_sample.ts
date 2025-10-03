export const SAM_ASSISTANCE_SYNTHETIC_RESPONSE = {
  searchResult: {
    searchResultCount: 2,
    searchResultItems: [
      {
        matchedObjectId: '00FAKE123',
        matchedObjectDescriptor: {
          assistanceListingTitle: 'Synthetic Resilience Accelerator',
          assistanceListingNumber: '00.001',
          assistanceListingDescription:
            'Demonstration listing seeded locally while SAM_API_KEY is unavailable. Funds climate resilience pilots.',
          businessCategories: ['climate', 'resilience'],
          uri: 'https://sam.gov/fal/00.001-synthetic'
        }
      },
      {
        matchedObjectId: '00FAKE456',
        matchedObjectDescriptor: {
          assistanceListingTitle: 'Synthetic Advanced Manufacturing Catalyst',
          assistanceListingNumber: '00.002',
          assistanceListingDescription:
            'Placeholder assistance listing aligned to NAICS-based manufacturing incentives for sandbox testing.',
          businessCategories: ['manufacturing', 'innovation'],
          uri: 'https://sam.gov/fal/00.002-synthetic'
        }
      }
    ]
  }
};
