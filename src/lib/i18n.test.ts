import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRAND } from './brand';
import { t, uiLanguage } from './i18n';

const LOCALES_DIR = fileURLToPath(new URL('../../public/_locales', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

type Messages = Record<string, { message: string; description?: string }>;

const locales: Record<string, Messages> = Object.fromEntries(
  readdirSync(LOCALES_DIR).map((locale) => [
    locale,
    JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'messages.json'), 'utf8')) as Messages,
  ]),
);
const en = locales.en!;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const placeholders = (message: string): string[] =>
  [...message.matchAll(/\$\d/g)].map((m) => m[0]).sort();

describe('_locales/*/messages.json', () => {
  it('has an English catalog and at least one key', () => {
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });

  it('every locale has exactly the English key set', () => {
    const expected = Object.keys(en).sort();
    for (const [locale, messages] of Object.entries(locales)) {
      expect(Object.keys(messages).sort(), locale).toEqual(expected);
    }
  });

  it('no message is empty', () => {
    for (const [locale, messages] of Object.entries(locales)) {
      for (const [key, entry] of Object.entries(messages)) {
        expect(entry.message.trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('every English message carries a description for translators', () => {
    for (const [key, entry] of Object.entries(en)) {
      expect(entry.description?.trim(), key).toBeTruthy();
    }
  });

  it('placeholders ($1…) match English in every locale', () => {
    for (const [locale, messages] of Object.entries(locales)) {
      for (const [key, entry] of Object.entries(messages)) {
        expect(placeholders(entry.message), `${locale}.${key}`).toEqual(
          placeholders(en[key]!.message),
        );
      }
    }
  });

  it('manifest name and description come from BRAND', () => {
    expect(en.appName!.message).toBe(BRAND.name);
    expect(en.appDescription!.message).toBe(BRAND.shortDescription);
  });

  it('every t() key used in src/ exists in en', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(SRC_DIR)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bt\(\s*['"]([A-Za-z0-9_]+)['"]/g)) used.add(match[1]!);
    }
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((key) => !(key in en))).toEqual([]);
  });
});

describe('t()', () => {
  const fakeChrome = globalThis.chrome as unknown as { i18n?: unknown };
  const install = (getMessage: (key: string, subs?: string | string[]) => string) => {
    fakeChrome.i18n = { getMessage, getUILanguage: () => 'de' };
  };
  afterEach(() => {
    delete fakeChrome.i18n;
    vi.restoreAllMocks();
  });

  it('returns the active-locale message from chrome.i18n', () => {
    const getMessage = vi.fn(() => 'Erklären');
    install(getMessage);
    expect(t('toolbarExplain')).toBe('Erklären');
    expect(getMessage).toHaveBeenCalledWith('toolbarExplain', undefined);
    expect(uiLanguage()).toBe('de');
  });

  it('falls back to English with substitutions when the locale lacks the key, warning once', () => {
    install(() => '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(t('timeMinutesAgo', '3')).toBe('3m ago');
    expect(t('timeMinutesAgo', ['5'])).toBe('5m ago');
    expect(t('errorRequestStatus', '500')).toBe('Request failed with status 500');
    expect(
      warn.mock.calls.filter((call) => String(call[0]).includes('timeMinutesAgo')),
    ).toHaveLength(1);
  });

  it('falls back to English without chrome.i18n (unit tests, plain pages)', () => {
    expect(t('toolbarAsk')).toBe('Ask');
    expect(uiLanguage()).toBe('en');
  });
});
