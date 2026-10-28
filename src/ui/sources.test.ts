import { describe, expect, it } from 'vitest';
import { domainOf, MAX_SOURCES_SHOWN } from './sources';

describe('domainOf', () => {
  it('reduces a URL to its host without www.', () => {
    expect(domainOf('https://www.example.com/path?q=1')).toBe('example.com');
    expect(domainOf('https://en.wikipedia.org/wiki/Claude_Shannon')).toBe('en.wikipedia.org');
  });

  it('returns unparsable input unchanged', () => {
    expect(domainOf('not a url')).toBe('not a url');
  });

  it('shows at most three sources', () => {
    expect(MAX_SOURCES_SHOWN).toBe(3);
  });
});
