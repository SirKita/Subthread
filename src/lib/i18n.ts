// Thin wrapper over chrome.i18n with typed keys and a bundled English fallback.
// Rule: no user-visible string literals in src/ — add a message to
// public/_locales/en/messages.json (and every other locale) and use t().
import en from '../../public/_locales/en/messages.json';

/** Every key of public/_locales/en/messages.json. A typo here fails typecheck. */
export type MessageKey = keyof typeof en;

const warned = new Set<string>();

/**
 * The message for `key` in the browser's UI language, with `$1`…`$9` replaced by
 * `substitutions`. Uses chrome.i18n; when that yields nothing — the active locale lacks the
 * key, or there is no chrome.i18n at all (unit tests) — returns the bundled English value.
 * Dev builds warn once per key when the active locale is missing it.
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  const i18n = typeof chrome !== 'undefined' ? chrome.i18n : undefined;
  if (i18n) {
    const message = i18n.getMessage(key, substitutions);
    if (message) return message;
    if (import.meta.env.DEV && !warned.has(key)) {
      warned.add(key);
      console.warn(`[subthread] i18n: "${key}" is missing from the active locale; using English`);
    }
  }
  return substitute(en[key].message, substitutions);
}

/** The browser's UI language tag (e.g. "de"), for number formatting; "en" without chrome.i18n. */
export function uiLanguage(): string {
  const i18n = typeof chrome !== 'undefined' ? chrome.i18n : undefined;
  return i18n?.getUILanguage() || 'en';
}

function substitute(message: string, substitutions?: string | string[]): string {
  const values =
    substitutions == null ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];
  return message.replace(/\$(\d)/g, (_match, n: string) => values[Number(n) - 1] ?? '');
}
