import { describe, it, expect } from 'vitest';
import { sanitizeImageUrl } from './userStorage.js';

describe('sanitizeImageUrl', () => {
  describe('Happy Path', () => {
    it('should return the trimmed URL for a valid HTTP URL', () => {
      expect(sanitizeImageUrl('http://example.com/image.png')).toBe('http://example.com/image.png');
    });

    it('should return the trimmed URL for a valid HTTPS URL', () => {
      expect(sanitizeImageUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
    });

    it('should trim surrounding whitespace from a valid URL', () => {
      expect(sanitizeImageUrl('  https://example.com/image.png  ')).toBe('https://example.com/image.png');
    });
  });

  describe('Edge Cases & Error Conditions', () => {
    it('should return null for null', () => {
      expect(sanitizeImageUrl(null)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(sanitizeImageUrl(undefined)).toBeNull();
    });

    it('should return null for non-string values', () => {
      expect(sanitizeImageUrl(123)).toBeNull();
      expect(sanitizeImageUrl({})).toBeNull();
      expect(sanitizeImageUrl([])).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(sanitizeImageUrl('')).toBeNull();
    });

    it('should return null for whitespace-only strings', () => {
      expect(sanitizeImageUrl('   ')).toBeNull();
      expect(sanitizeImageUrl('\t\n')).toBeNull();
    });

    it('should return null for data URIs', () => {
      expect(sanitizeImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')).toBeNull();
      expect(sanitizeImageUrl('  data:image/jpeg;base64,...')).toBeNull();
    });

    it('should return null for strings exceeding MAX_IMAGE_URL_LENGTH (2048)', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2048);
      expect(sanitizeImageUrl(longUrl)).toBeNull();
    });

    it('should return null for URLs that do not start with http:// or https://', () => {
      expect(sanitizeImageUrl('ftp://example.com/image.png')).toBeNull();
      expect(sanitizeImageUrl('relative/path/to/image.png')).toBeNull();
      expect(sanitizeImageUrl('/absolute/path/to/image.png')).toBeNull();
      expect(sanitizeImageUrl('file:///home/user/image.png')).toBeNull();
    });
  });
});
