# Store listing

Copy and settings for the Chrome Web Store dashboard. The zip to upload comes from `pnpm zip`
(`.output/subthread-<version>-chrome.zip`); the store icon and promo tile come from `pnpm icons`.

## Single-purpose description

Subthread lets you highlight any phrase in a claude.ai conversation and get a
quick explanation or answer about it in a small popover — a subthread beside
the main conversation, without touching it. Answers come from Anthropic's API
using your own API key, and your subthread history stays on your device.

## Long description (store copy, ≤ 1000 characters)

Subthread lets you highlight any phrase in a claude.ai conversation and get a quick answer about it
in a small popover, without touching the conversation itself.

• Explain or Ask on any highlight: select text in a Claude reply, click Explain for a short
explanation in context, or Ask to type your own question.
• Follow-ups stay in the popover: keep asking in the same side thread while the main conversation
stays exactly as it was.
• Local history: every subthread is saved per conversation, on your device only, and can be
reopened or deleted at any time.

Subthread uses your own Anthropic API key — nothing goes through our servers. No account, no
analytics, no tracking; the only network destination is api.anthropic.com.

Not affiliated with Anthropic.

## Permission justifications

Names match the manifest exactly (`permissions`, `host_permissions`, `content_scripts.matches`).

| Permission                                   | Justification                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                    | Stores your API key, settings and subthread history locally on this device. Nothing is synced or sent anywhere else.                                                                            |
| `https://api.anthropic.com/*` (host)         | Sends your highlighted text and question to Anthropic's API, authenticated with your own key, to get an answer. It is the extension's only network destination.                                 |
| `https://claude.ai/*` (content script match) | Shows the highlight toolbar and popover on claude.ai and reads the conversation text around your highlight so answers have context. It never changes the page or sends anything into your chat. |

## Listing fields

- Privacy policy URL: <https://github.com/SirKita/Subthread/blob/main/docs/PRIVACY.md>
- Support email: nikitayentus@berkeley.edu
- Category: Productivity → Tools
- Language: English (the UI also ships in German and follows the browser language)

## Assets

- Store icon: `public/icon/store-128.png` — 96×96 artwork centred on a transparent 128×128 canvas,
  as the dashboard requires. Dashboard upload only; the manifest keeps the full-bleed `128.png`.
- Small promo tile: `public/icon/promo-440x280.png` — warm background, cat mark, no text.
- Screenshots (1280×800), still to capture: toolbar on a selection; popover streaming an answer;
  history view; options page.
- Marquee (1400×560): optional, not made.

## Human checklist (before submission)

- [ ] Developer account identity verification + one-time registration fee
- [ ] Screenshots captured and uploaded
- [ ] Data-use disclosures in the dashboard: "user activity" (highlighted text) is sent to
      Anthropic via the user-provided key; no data sold or shared; no analytics
- [ ] If the product name ever changes: update `src/lib/brand.ts`, `appName`/`appDescription` in
      every `public/_locales/*/messages.json`, and `docs/PRIVACY.md`
