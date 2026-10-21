// Single source of truth for the product name and store-facing description.
// Renaming the product should be a change to this file only (internal
// identifiers like the port name, host element tag, and package name are
// deliberately not derived from it — they are not user-visible).
export const BRAND = {
  name: 'Subthread',
  shortDescription:
    'Open a quick subthread about any highlighted phrase on claude.ai — ask a side question without derailing the conversation.',
} as const;
