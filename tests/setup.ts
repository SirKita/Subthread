import { beforeEach } from 'vitest';

// Minimal in-memory fake for the chrome APIs the lib code touches.
// Deliberately tiny — no chrome-mock dependency.

type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type ChangeListener = (changes: StorageChanges, areaName: string) => void;

function createFakeChrome() {
  let store: Record<string, unknown> = {};
  const changeListeners = new Set<ChangeListener>();

  return {
    storage: {
      local: {
        async get(keys?: string | string[] | Record<string, unknown> | null) {
          if (keys == null) return { ...store };
          const defaults =
            typeof keys === 'object' && !Array.isArray(keys)
              ? keys
              : ({} as Record<string, unknown>);
          const wanted =
            typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
          const result: Record<string, unknown> = { ...defaults };
          for (const key of wanted) {
            if (key in store) result[key] = store[key];
          }
          return result;
        },
        async set(items: Record<string, unknown>) {
          const changes: StorageChanges = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: store[key], newValue: value };
            store[key] = value;
          }
          for (const listener of changeListeners) listener(changes, 'local');
        },
        async remove(keys: string | string[]) {
          for (const key of typeof keys === 'string' ? [keys] : keys) delete store[key];
        },
        async clear() {
          store = {};
        },
      },
      onChanged: {
        addListener: (listener: ChangeListener) => changeListeners.add(listener),
        removeListener: (listener: ChangeListener) => changeListeners.delete(listener),
        hasListener: (listener: ChangeListener) => changeListeners.has(listener),
      },
    },
    runtime: {
      sendMessage: async () => undefined,
      connect: () => {
        throw new Error('chrome.runtime.connect is not implemented in the test fake');
      },
      onMessage: { addListener: () => {}, removeListener: () => {} },
      onConnect: { addListener: () => {}, removeListener: () => {} },
    },
  };
}

(globalThis as { chrome?: unknown }).chrome = createFakeChrome();

beforeEach(async () => {
  await chrome.storage.local.clear();
});
