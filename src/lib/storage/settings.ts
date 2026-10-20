export interface Settings {
  apiKey: string;
  model: string;
  maxContextTokens: number;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'claude-haiku-5-5',
  maxContextTokens: 8000,
};

const STORAGE_KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] as Partial<Settings> | undefined) };
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...current, ...patch } });
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    const change = changes[STORAGE_KEY];
    if (areaName !== 'local' || !change) return;
    cb({ ...DEFAULT_SETTINGS, ...(change.newValue as Partial<Settings> | undefined) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
