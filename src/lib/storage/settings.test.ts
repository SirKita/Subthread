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

describe('context levels', () => {
  it('maps exact token counts to their levels', () => {
    expect(contextLevelForTokens(4000)).toBe('less');
    expect(contextLevelForTokens(8000)).toBe('standard');
    expect(contextLevelForTokens(16000)).toBe('more');
  });

  it('maps any stored number to the nearest level, rounding ties up', () => {
    expect(contextLevelForTokens(0)).toBe('less');
    expect(contextLevelForTokens(5000)).toBe('less');
    expect(contextLevelForTokens(6000)).toBe('standard'); // tie -> larger
    expect(contextLevelForTokens(7000)).toBe('standard');
    expect(contextLevelForTokens(12000)).toBe('more'); // tie -> larger
    expect(contextLevelForTokens(11_000)).toBe('standard');
    expect(contextLevelForTokens(100_000)).toBe('more');
  });

  it('round-trips levels to their token counts', () => {
    expect(tokensForContextLevel('less')).toBe(4000);
    expect(tokensForContextLevel('standard')).toBe(8000);
    expect(tokensForContextLevel('more')).toBe(16000);
  });
});
