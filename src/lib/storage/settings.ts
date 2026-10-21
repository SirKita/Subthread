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

// User-facing "Conversation context" slider stops; Settings.maxContextTokens
// stays numeric for compatibility, the options page maps it to the nearest stop.
export const CONTEXT_LEVELS: ReadonlyArray<{ tokens: number; label?: string }> = [
  { tokens: 2000, label: 'Less' },
  { tokens: 4000 },
  { tokens: 8000, label: 'Standard' },
  { tokens: 16000 },
  { tokens: 32000, label: 'More' },
];

/** Index of the nearest level for a stored token count; ties round up. */
export function contextLevelForTokens(tokens: number): number {
  let best = 0;
  for (let i = 0; i < CONTEXT_LEVELS.length; i++) {
    if (
      Math.abs(tokens - CONTEXT_LEVELS[i]!.tokens) <=
      Math.abs(tokens - CONTEXT_LEVELS[best]!.tokens)
    ) {
      best = i;
    }
  }
  return best;
}

export function tokensForContextLevel(index: number): number {
  return CONTEXT_LEVELS[index]?.tokens ?? DEFAULT_SETTINGS.maxContextTokens;
}

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
