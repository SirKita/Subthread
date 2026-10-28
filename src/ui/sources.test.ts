import { describe, expect, it } from 'vitest';
import { domainOf, MAX_SOURCES_SHOWN, visibleSources } from './sources';

describe('domainOf', () => {
  it('reduces a URL to its host without www.', () => {
    expect(domainOf('https://www.example.com/path?q=1')).toBe('example.com');
    expect(domainOf('https://en.wikipedia.org/wiki/Claude_Shannon')).toBe('en.wikipedia.org');
  });

  it('returns unparsable input unchanged', () => {
    expect(domainOf('not a url')).toBe('not a url');
  });
});

describe('visibleSources', () => {
  const sources = Array.from({ length: 5 }, (_, i) => ({
    url: `https://example${i}.com/`,
    title: `Example ${i}`,
  }));

  it('lists everything when there are three or fewer', () => {
    expect(MAX_SOURCES_SHOWN).toBe(3);
    expect(visibleSources(sources.slice(0, 3), false)).toEqual({
      shown: sources.slice(0, 3),
      hidden: 0,
    });
    expect(visibleSources([], false)).toEqual({ shown: [], hidden: 0 });
  });

  it('lists three and counts the rest while collapsed', () => {
    expect(visibleSources(sources, false)).toEqual({ shown: sources.slice(0, 3), hidden: 2 });
  });

  it('lists everything once expanded', () => {
    expect(visibleSources(sources, true)).toEqual({ shown: sources, hidden: 0 });
  });
});
