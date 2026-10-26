import { readFile } from 'node:fs/promises';
import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

/**
 * src/lib/i18n.ts imports public/_locales/en/messages.json as the typed English fallback.
 * Serve it to the bundler without the translator "description" fields so each bundle carries
 * only the messages (types still come from the full file via tsc).
 */
const slimEnglishMessages = {
  name: 'subthread:slim-english-messages',
  enforce: 'pre' as const,
  async load(id: string) {
    if (!/[\\/]_locales[\\/]en[\\/]messages\.json$/.test(id)) return null;
    const full = JSON.parse(await readFile(id, 'utf8')) as Record<string, { message: string }>;
    const slim = Object.fromEntries(
      Object.entries(full).map(([key, entry]) => [key, { message: entry.message }]),
    );
    return JSON.stringify(slim);
  },
};

export default defineConfig({
  srcDir: 'src',
  vite: () => ({
    plugins: [preact(), slimEnglishMessages],
  }),
  manifest: {
    // Name and description resolve from public/_locales/<lang>/messages.json; the English
    // values there must equal BRAND in src/lib/brand.ts (enforced by src/lib/i18n.test.ts).
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    permissions: ['storage'],
    host_permissions: ['https://api.anthropic.com/*'],
    action: {
      default_title: '__MSG_appName__',
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
