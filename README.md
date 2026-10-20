# side-question

Chrome extension (MV3) for claude.ai: highlight a phrase in a Claude response, get a mini-toolbar
with **Explain** / **Ask**, and stream the answer into a small popover — without touching the main
conversation. Answers use your own Anthropic API key (BYOK).

**Phase 0** (this commit): scaffold + API path. The options page saves an API key and can stream a
test message from the Claude API. The content script is a stub that proves it runs on claude.ai.
The highlight toolbar arrives in Phase 1.

## Prerequisites

- Node 18+ and [pnpm](https://pnpm.io)

## Commands

| Command          | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm install`   | Install dependencies (runs `wxt prepare` to generate `.wxt/` types) |
| `pnpm dev`       | Dev mode — builds and opens a browser with the extension loaded     |
| `pnpm build`     | Production build to `.output/chrome-mv3`                            |
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

1. On `chrome://extensions`, find **side-question** → **Details** → **Extension options**
   (or right-click the extension icon → Options)
2. Paste your Anthropic API key — create one at
   <https://platform.claude.com/settings/keys> — pick a model, and click **Save**
3. Click **Test connection**. On success you'll see `OK — <model>` with the model's reply;
   on failure you'll see the error kind (`auth`, `rate_limit`, `credit`, `server`, `network`,
   `unknown`) and message.

The key lives only in `chrome.storage.local` and is read only by the background service worker.
The extension's sole network destination is `https://api.anthropic.com`.

## Phase 0 sanity check on claude.ai

Open <https://claude.ai>, then DevTools (F12) → Console:

- On page load: `[side-question] content script loaded`
- Select any text: `[side-question] selection length: <n>` (only the length is logged, never the text)
