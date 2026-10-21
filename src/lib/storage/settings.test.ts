import { describe, expect, it } from 'vitest';
import {
  contextLevelForTokens,
  DEFAULT_SETTINGS,
  getSettings,
  onSettingsChanged,
  setSettings,
  tokensForContextLevel,
  type Settings,
} from './settings';

describe('settings', () => {
  it('returns defaults when storage is empty', async () => {
    const settings = await getSettings();
    expect(settings).toEqual({
      apiKey: '',
      model: 'claude-haiku-5-5',
      maxContextTokens: 8000,
    });
  });

  it('merges partial updates with existing values', async () => {
    await setSettings({ apiKey: 'sk-ant-test' });
    await setSettings({ maxContextTokens: 4000 });

    const settings = await getSettings();
    expect(settings).toEqual({
      apiKey: 'sk-ant-test',
      model: DEFAULT_SETTINGS.model,
      maxContextTokens: 4000,
    });
  });

  it('fires onSettingsChanged and supports unsubscribe', async () => {
    const seen: Settings[] = [];
    const unsubscribe = onSettingsChanged((s) => seen.push(s));

    await setSettings({ apiKey: 'sk-ant-live' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      apiKey: 'sk-ant-live',
      model: DEFAULT_SETTINGS.model,
      maxContextTokens: DEFAULT_SETTINGS.maxContextTokens,
    });

    unsubscribe();
    await setSettings({ apiKey: 'sk-ant-later' });
    expect(seen).toHaveLength(1);
  });
});

describe('context levels (five slider stops)', () => {
  it('maps exact token counts to their level index', () => {
    expect(contextLevelForTokens(2000)).toBe(0);
    expect(contextLevelForTokens(4000)).toBe(1);
    expect(contextLevelForTokens(8000)).toBe(2);
    expect(contextLevelForTokens(16000)).toBe(3);
    expect(contextLevelForTokens(32000)).toBe(4);
  });

  it('maps any stored number to the nearest level, rounding ties up', () => {
    expect(contextLevelForTokens(0)).toBe(0);
    expect(contextLevelForTokens(3000)).toBe(1); // tie 2000/4000 -> larger
    expect(contextLevelForTokens(5000)).toBe(1);
    expect(contextLevelForTokens(6000)).toBe(2); // tie 4000/8000 -> larger
    expect(contextLevelForTokens(10_000)).toBe(2);
    expect(contextLevelForTokens(12_000)).toBe(3); // tie 8000/16000 -> larger
    expect(contextLevelForTokens(24_000)).toBe(4); // tie 16000/32000 -> larger
    expect(contextLevelForTokens(20_000)).toBe(3);
    expect(contextLevelForTokens(100_000)).toBe(4);
  });

  it('round-trips level indexes to token counts, defaulting out-of-range', () => {
    expect(tokensForContextLevel(0)).toBe(2000);
    expect(tokensForContextLevel(1)).toBe(4000);
    expect(tokensForContextLevel(2)).toBe(8000);
    expect(tokensForContextLevel(3)).toBe(16000);
    expect(tokensForContextLevel(4)).toBe(32000);
    expect(tokensForContextLevel(99)).toBe(DEFAULT_SETTINGS.maxContextTokens);
  });
});
