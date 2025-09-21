import type { GovernmentProgram, SearchQuery } from './types.js';

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Create an ISO datetime string for the current time
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Validate if a string is a valid UUID
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitize search query string for FTS5
 */
export function sanitizeSearchQuery(query: string): string {
  // Remove special FTS5 characters and escape quotes
  return query
    .replace(/[*"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build FTS5 search query from user input
 */
export function buildFTSQuery(query: string): string {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return '';
  
  // Split into words and create a phrase query for better matching
  const words = sanitized.split(' ').filter(word => word.length > 0);
  if (words.length === 1) {
    return `${words[0]}*`;
  }
  
  // Use phrase query for multi-word searches
  return `"${sanitized}"`;
}

/**
 * Create a default program object with generated ID and timestamps
 */
export function createProgramDefaults(): Pick<GovernmentProgram, 'id' | 'createdAt' | 'updatedAt'> {
  const now = getCurrentTimestamp();
  return {
    id: generateUUID(),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Parse search parameters from URL search params
 */
export function parseSearchParams(searchParams: URLSearchParams): Partial<SearchQuery> {
  const params: Partial<SearchQuery> = {};
  
  const query = searchParams.get('q') || searchParams.get('query');
  if (query) params.query = query;
  
  const type = searchParams.get('type');
  if (type) params.type = type as any;
  
  const geographyLevel = searchParams.get('geography') || searchParams.get('level');
  if (geographyLevel) params.geographyLevel = geographyLevel as any;
  
  const state = searchParams.get('state');
  if (state) params.state = state;
  
  const city = searchParams.get('city');
  if (city) params.city = city;
  
  const industries = searchParams.get('industries');
  if (industries) {
    params.industries = industries.split(',') as any;
  }
  
  const status = searchParams.get('status');
  if (status) params.status = status as any;
  
  const startDate = searchParams.get('startDate');
  if (startDate) params.startDate = startDate;
  
  const endDate = searchParams.get('endDate');
  if (endDate) params.endDate = endDate;
  
  const limit = searchParams.get('limit');
  if (limit) params.limit = parseInt(limit, 10);
  
  const offset = searchParams.get('offset');
  if (offset) params.offset = parseInt(offset, 10);
  
  return params;
}