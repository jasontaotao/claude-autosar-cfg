import { describe, expect, it } from 'vitest';

import { isAllowedExternalUrl } from '../window-open-allowlist.js';

describe('isAllowedExternalUrl', () => {
  describe('allowed', () => {
    it('accepts plain http URL', () => {
      expect(isAllowedExternalUrl('http://example.com')).toBe(true);
    });

    it('accepts https URL with path and query', () => {
      expect(isAllowedExternalUrl('https://example.com/path?q=1&r=2#frag')).toBe(true);
    });
  });

  describe('denied — dangerous schemes', () => {
    it.each([
      ['javascript:alert(1)'],
      ['JavaScript:alert(1)'], // case-insensitive URL spec
      ['file:///etc/passwd'],
      ['FILE:///c:/Windows/System32'],
      ['vbscript:msgbox(1)'],
      ['data:text/html,<script>alert(1)</script>'],
    ])('denies %s', (url) => {
      expect(isAllowedExternalUrl(url)).toBe(false);
    });
  });

  describe('denied — non-web schemes', () => {
    it.each([
      ['ftp://example.com'],
      ['chrome://settings'],
      ['about:blank'],
      ['mailto:foo@example.com'],
      ['tel:+15551234567'],
    ])('denies %s', (url) => {
      expect(isAllowedExternalUrl(url)).toBe(false);
    });
  });

  describe('denied — malformed', () => {
    it('denies empty string', () => {
      expect(isAllowedExternalUrl('')).toBe(false);
    });

    it('denies whitespace-only', () => {
      expect(isAllowedExternalUrl('   ')).toBe(false);
    });

    it('denies protocol-relative', () => {
      expect(isAllowedExternalUrl('//example.com')).toBe(false);
    });
  });
});
