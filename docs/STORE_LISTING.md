# Store listing — working notes

## Single-purpose description

Subthread lets you highlight any phrase in a claude.ai conversation and get a
quick explanation or answer about it in a small popover — a subthread beside
the main conversation, without touching it. Answers come from Anthropic's API
using your own API key, and your subthread history stays on your device.

## Permission justifications

| Permission                          | Justification (one sentence)                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `storage`                           | Stores your API key, settings, and subthread history locally on your device.                                               |
| Host permission `api.anthropic.com` | Sends your highlighted text and question to Anthropic's API — the extension's only network destination — to get an answer. |
| Content script on `claude.ai`       | Shows the highlight toolbar/popover and reads the conversation text around your highlight so answers have context.         |

## Human checklist (must be supplied before submission)

- [ ] Screenshots (1280×800): toolbar on a selection; popover streaming an
      answer; history view; options page
- [ ] Small promo tile (440×280), optional marquee (1400×560)
- [ ] Privacy policy URL — host `docs/PRIVACY.md` somewhere public and paste
      the URL into the dashboard
- [ ] Support email (shown publicly on the listing)
- [ ] Developer account identity verification + one-time registration fee
- [ ] Category (suggest "Productivity → Tools") and language
- [ ] If the product name ever changes again: update `src/lib/brand.ts` and
      `docs/PRIVACY.md`; manifest and UI read from the brand constant
- [ ] Data-use disclosures in the dashboard: check "user activity" (highlighted
      text) sent to Anthropic via user-provided key; no data sold/shared; no
      analytics
