# Subthread

Chrome extension (MV3) for claude.ai: highlight a phrase in a Claude response, get a mini-toolbar
with **Explain** / **Ask**, and stream the answer into a small popover — a subthread beside the
main conversation, without touching it. Follow-ups continue in the same popover, and threads are
saved to a local history per conversation. Answers use your own Anthropic API key (BYOK).

## Prerequisites

- Node 18+ and [pnpm](https://pnpm.io)

## Commands

| Command          | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm install`   | Install dependencies (runs `wxt prepare` to generate `.wxt/` types) |
| `pnpm dev`       | Dev mode — builds and opens a browser with the extension loaded     |
| `pnpm build`     | Production build to `.output/chrome-mv3`                            |
| `pnpm zip`       | Store-uploadable zip in `.output/`                                  |
| `pnpm icons`     | Re-render `public/icon/source.svg` to the manifest PNG sizes        |
| `pnpm test`      | Run the unit tests once (Vitest)                                    |
| `pnpm typecheck` | `tsc --noEmit`                                                      |
| `pnpm lint`      | ESLint                                                              |
| `pnpm check`     | typecheck + lint + test                                             |

## Load the unpacked extension

1. `pnpm build`
2. Open `chrome://extensions` and enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `.output/chrome-mv3` directory

(`pnpm dev` does this automatically in a temporary browser profile, with hot reload.)

## Configure the API key & test the connection

1. On `chrome://extensions`, find **Subthread** → **Details** → **Extension options**
   (or right-click the extension icon → Options)
2. Paste your Anthropic API key — create one at
   <https://platform.claude.com/settings/keys> — pick a model, and click **Save**
3. Click **Test connection**. On success you'll see `OK — <model>` with the model's reply;
   on failure you'll see the error kind (`auth`, `rate_limit`, `credit`, `server`, `network`,
   `unknown`) and message.

The key lives only in `chrome.storage.local` and is read only by the background service worker.
The extension's sole network destination is `https://api.anthropic.com`.

## Using it

Select text in a Claude response on claude.ai → **Explain** streams immediately, **Ask** takes a
question first. Ask follow-ups in the same popover. The toolbar icon (or the ☰ button in the
popover) opens the saved history for the current conversation.

Dev helpers: `Ctrl/Cmd+Shift+D` with a selection copies a structure-only DOM dump (lengths, never
text) for selector calibration; set `DEBUG = true` in `src/entrypoints/claude.content.ts` or
`src/ui/input-guard.ts` for verbose logging with a `[subthread]` prefix.

## Testing a locale

The UI follows the browser's UI language (`chrome.i18n`). English and German ship today, in
`public/_locales/<lang>/messages.json`; answers themselves follow the conversation's language, not
the browser's. To check a locale, start Chrome in that language and load the unpacked build:

- Windows: `chrome.exe --lang=de --user-data-dir=%TEMP%\chrome-de` (a fresh profile, so the
  language is not cached from an earlier run)
- Linux: `google-chrome --lang=de --user-data-dir=/tmp/chrome-de`
- macOS ignores `--lang`: set the system language under System Settings → General → Language &
  Region and restart Chrome
- `pnpm dev`: add `webExt: { chromiumArgs: ['--lang=de'] }` to `wxt.config.ts` (or to a local
  `web-ext.config.ts`) for the temporary profile it launches

Both surfaces must switch: the options page (tab title, labels, help text, buttons) and the content
UI on claude.ai (toolbar, popover placeholders and tooltips, history list, error messages). A key
missing from the active locale falls back to English and, in dev builds, logs one
`[subthread] i18n` warning per key in the console.
