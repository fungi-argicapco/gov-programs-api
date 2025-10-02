import type { MacroMetricSource } from './types';

const commonMetadata = {
  metricGroup: 'Economy',
  metricName: 'GDP (current US$)',
  metricUnit: 'USD',
  indicatorId: 'NY.GDP.MKTP.CD',
  requestParameters: { format: 'json', per_page: '1000' },
  automation: {
    authentication: 'none' as const,
    rateLimit: 'Not specified',
    updateCadence: 'annual',
    changeDetection: 'N/A',
    statusPage: 'https://datahelpdesk.worldbank.org/',
    readiness: 'yes' as const,
    notes: 'World Bank GDP (current US$)'
  }
};

export const MACRO_SOURCES: MacroMetricSource[] = [
  {
    id: 'macro-gdp-us',
    provider: 'worldbank',
    countryCode: 'US',
    adminUnitCode: 'US',
    adminUnitName: 'United States',
    adminUnitLevel: 'country',
    metricGroup: commonMetadata.metricGroup,
    metricName: commonMetadata.metricName,
    metricUnit: commonMetadata.metricUnit,
    indicatorId: commonMetadata.indicatorId,
    request: {
      endpoint: 'https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD',
      parameters: commonMetadata.requestParameters
    },
    maxYears: 12,
    automation: {
      endpoint: 'https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD',
      parameters: commonMetadata.requestParameters,
      authentication: commonMetadata.automation.authentication,
      rateLimit: commonMetadata.automation.rateLimit,
      updateCadence: commonMetadata.automation.updateCadence,
      changeDetection: commonMetadata.automation.changeDetection,
      statusPage: commonMetadata.automation.statusPage,
      readiness: commonMetadata.automation.readiness,
      sourceUrl: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=US',
      verificationDate: '2025-10-01',
      notes: `${commonMetadata.automation.notes} – United States`
    },
    metadata: {
      provider: 'worldbank',
      frequency: 'annual'
    }
  },
  {
    id: 'macro-gdp-ca',
    provider: 'worldbank',
    countryCode: 'CA',
    adminUnitCode: 'CA',
    adminUnitName: 'Canada',
    adminUnitLevel: 'country',
    metricGroup: commonMetadata.metricGroup,
    metricName: commonMetadata.metricName,
    metricUnit: commonMetadata.metricUnit,
    indicatorId: commonMetadata.indicatorId,
    request: {
      endpoint: 'https://api.worldbank.org/v2/country/CAN/indicator/NY.GDP.MKTP.CD',
      parameters: commonMetadata.requestParameters
    },
    maxYears: 12,
    automation: {
      endpoint: 'https://api.worldbank.org/v2/country/CAN/indicator/NY.GDP.MKTP.CD',
      parameters: commonMetadata.requestParameters,
      authentication: commonMetadata.automation.authentication,
      rateLimit: commonMetadata.automation.rateLimit,
      updateCadence: commonMetadata.automation.updateCadence,
      changeDetection: commonMetadata.automation.changeDetection,
      statusPage: commonMetadata.automation.statusPage,
      readiness: commonMetadata.automation.readiness,
      sourceUrl: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=CA',
      verificationDate: '2025-10-01',
      notes: `${commonMetadata.automation.notes} – Canada`
    },
    metadata: {
      provider: 'worldbank',
      frequency: 'annual'
    }
  },
  {
    id: 'macro-gdp-se',
    provider: 'worldbank',
    countryCode: 'SE',
    adminUnitCode: 'SE',
    adminUnitName: 'Sweden',
    adminUnitLevel: 'country',
    metricGroup: commonMetadata.metricGroup,
    metricName: commonMetadata.metricName,
    metricUnit: commonMetadata.metricUnit,
    indicatorId: commonMetadata.indicatorId,
    request: {
      endpoint: 'https://api.worldbank.org/v2/country/SWE/indicator/NY.GDP.MKTP.CD',
      parameters: commonMetadata.requestParameters
    },
    maxYears: 12,
    automation: {
      endpoint: 'https://api.worldbank.org/v2/country/SWE/indicator/NY.GDP.MKTP.CD',
      parameters: commonMetadata.requestParameters,
      authentication: commonMetadata.automation.authentication,
      rateLimit: commonMetadata.automation.rateLimit,
      updateCadence: commonMetadata.automation.updateCadence,
      changeDetection: commonMetadata.automation.changeDetection,
      statusPage: commonMetadata.automation.statusPage,
      readiness: commonMetadata.automation.readiness,
      sourceUrl: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=SE',
      verificationDate: '2025-10-01',
      notes: `${commonMetadata.automation.notes} – Sweden`
    },
    metadata: {
      provider: 'worldbank',
      frequency: 'annual'
    }
  },
  {
    id: 'macro-gdp-fr',
    provider: 'worldbank',
    countryCode: 'FR',
    adminUnitCode: 'FR',
    adminUnitName: 'France',
    adminUnitLevel: 'country',
    metricGroup: commonMetadata.metricGroup,
    metricName: commonMetadata.metricName,
    metricUnit: commonMetadata.metricUnit,
    indicatorId: commonMetadata.indicatorId,
    request: {
      endpoint: 'https://api.worldbank.org/v2/country/FRA/indicator/NY.GDP.MKTP.CD',
      parameters: commonMetadata.requestParameters
    },
    maxYears: 12,
    automation: {
      endpoint: 'https://api.worldbank.org/v2/country/FRA/indicator/NY.GDP.MKTP.CD',
      parameters: commonMetadata.requestParameters,
      authentication: commonMetadata.automation.authentication,
      rateLimit: commonMetadata.automation.rateLimit,
      updateCadence: commonMetadata.automation.updateCadence,
      changeDetection: commonMetadata.automation.changeDetection,
      statusPage: commonMetadata.automation.statusPage,
      readiness: commonMetadata.automation.readiness,
      sourceUrl: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=FR',
      verificationDate: '2025-10-01',
      notes: `${commonMetadata.automation.notes} – France`
    },
    metadata: {
      provider: 'worldbank',
      frequency: 'annual'
    }
  }
];
