// Single source of truth for the product name and store-facing description.
// Renaming the product: change this file and the appName/appDescription
// messages in every public/_locales/*/messages.json (the manifest reads those;
// src/lib/i18n.test.ts asserts the English ones equal BRAND). Internal
// identifiers like the port name, host element tag, and package name are
// deliberately not derived from it — they are not user-visible.
export const BRAND = {
  name: 'Subthread',
  shortDescription:
    'Open a quick subthread about any highlighted phrase on claude.ai — ask a side question without derailing the conversation.',
} as const;
