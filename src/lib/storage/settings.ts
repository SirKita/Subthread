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

// User-facing "Conversation context" levels; Settings.maxContextTokens stays
// numeric for compatibility, the options page maps it to the nearest level.
export type ContextLevel = 'less' | 'standard' | 'more';

export const CONTEXT_LEVELS: Array<{ id: ContextLevel; tokens: number; label: string }> = [
  { id: 'less', tokens: 4000, label: 'Less' },
  { id: 'standard', tokens: 8000, label: 'Standard' },
  { id: 'more', tokens: 16000, label: 'More' },
];

/** Nearest level for a stored token count; ties round up to the larger level. */
export function contextLevelForTokens(tokens: number): ContextLevel {
  let best = CONTEXT_LEVELS[0]!;
  for (const level of CONTEXT_LEVELS) {
    if (Math.abs(tokens - level.tokens) <= Math.abs(tokens - best.tokens)) {
      best = level;
    }
  }
  return best.id;
}

export function tokensForContextLevel(level: ContextLevel): number {
  return (
    CONTEXT_LEVELS.find((entry) => entry.id === level)?.tokens ?? DEFAULT_SETTINGS.maxContextTokens
  );
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
