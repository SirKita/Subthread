import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  getSettings,
  onSettingsChanged,
  setSettings,
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
