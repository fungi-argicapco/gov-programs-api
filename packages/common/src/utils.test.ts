import { describe, it, expect } from 'vitest';
import { generateUUID, isValidUUID, sanitizeSearchQuery, buildFTSQuery, parseSearchParams } from './utils.js';

describe('Utils', () => {
  describe('generateUUID', () => {
    it('should generate a valid UUID', () => {
      const uuid = generateUUID();
      expect(isValidUUID(uuid)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('isValidUUID', () => {
    it('should return true for valid UUIDs', () => {
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUUID('00000000-0000-4000-8000-000000000000')).toBe(true);
    });

    it('should return false for invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('123e4567-e89b-12d3-a456')).toBe(false);
      expect(isValidUUID('')).toBe(false);
    });
  });

  describe('sanitizeSearchQuery', () => {
    it('should remove special characters', () => {
      expect(sanitizeSearchQuery('test*query"')).toBe('testquery');
    });

    it('should normalize whitespace', () => {
      expect(sanitizeSearchQuery('  test   query  ')).toBe('test query');
    });

    it('should handle empty strings', () => {
      expect(sanitizeSearchQuery('')).toBe('');
      expect(sanitizeSearchQuery('   ')).toBe('');
    });
  });

  describe('buildFTSQuery', () => {
    it('should add wildcard for single words', () => {
      expect(buildFTSQuery('test')).toBe('test*');
    });

    it('should create phrase query for multiple words', () => {
      expect(buildFTSQuery('test query')).toBe('"test query"');
    });

    it('should handle empty strings', () => {
      expect(buildFTSQuery('')).toBe('');
    });
  });

  describe('parseSearchParams', () => {
    it('should parse query parameters correctly', () => {
      const params = new URLSearchParams('q=test&type=funding&state=CA&limit=10');
      const parsed = parseSearchParams(params);
      
      expect(parsed.query).toBe('test');
      expect(parsed.type).toBe('funding');
      expect(parsed.state).toBe('CA');
      expect(parsed.limit).toBe(10);
    });

    it('should parse industries array', () => {
      const params = new URLSearchParams('industries=tech,healthcare,energy');
      const parsed = parseSearchParams(params);
      
      expect(parsed.industries).toEqual(['tech', 'healthcare', 'energy']);
    });

    it('should handle empty parameters', () => {
      const params = new URLSearchParams('');
      const parsed = parseSearchParams(params);
      
      expect(Object.keys(parsed)).toHaveLength(0);
    });
  });
});