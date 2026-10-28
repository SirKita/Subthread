# CLAUDE.md — Subthread

Orientation for Claude Code sessions in this repo. Read this before touching code.

## What this is

Subthread is a Chrome MV3 extension for claude.ai: highlight a phrase in a message, get an
Explain/Ask toolbar, and stream a side answer into a small popover without touching the main
conversation. Answers come from the Anthropic Messages API with the user's own key (BYOK);
follow-ups stay in the popover and threads are saved to a local, per-conversation history.

## Hard constraints (never change these)

- Manifest permissions are exactly `storage` plus the host permission
  `https://api.anthropic.com/*` (`wxt.config.ts`). No new permissions.
- The API key never reaches the content script. It lives in `chrome.storage.local`, is read only
  by the background worker, and `get-config` returns non-secret settings only (`handlers.ts`).
- `api.anthropic.com` is the only network destination. No other fetch, anywhere.
- No telemetry, analytics, or logging of user text. Dev dumps and logs carry lengths, never content.
- No new dependencies without flagging it first. Runtime dependency today: `preact` only.

## Repo map

- `wxt.config.ts` — manifest: name/description via `__MSG_appName__`/`__MSG_appDescription__`
  (`default_locale` en), permissions, icons; a Vite `load` hook slims the bundled English fallback.
- `public/_locales/<lang>/messages.json` — every user-visible string (en, de). `src/lib/i18n.ts` —
  `t(key, substitutions?)` over `chrome.i18n` with typed keys and an English fallback.
- `package.json` — scripts: `dev`, `build`, `zip`, `check` (typecheck + lint + test), `icons`.
- `src/entrypoints/background.ts` — service worker: streaming port, one-shot messages, action click.
- `src/entrypoints/claude.content.ts` — content script on `https://claude.ai/*`: mounts the
  shadow-root UI; Ctrl/Cmd+Shift+D structure dump hotkey.
- `src/entrypoints/options/` — settings page: key, model, context slider, web search, clear history.
- `src/lib/api/` — `claude-client.ts` (fetch + SSE stream, web search tool, citations → sources),
  `sse.ts` (parser), `errors.ts` (`ApiError` kinds), `prompts.ts` (system/user prompts, `buildRequest`).
- `src/lib/context/` — `adapter.ts` (types), `claude-ai.ts` (DOM adapter, `CLAUDE_AI_SELECTORS`),
  `naive.ts` (fallback), `budget.ts` (token estimate, trimming order), `dump.ts` (structure dump).
- `src/lib/messaging/` — `protocol.ts` (message types, port name), `port.ts` (content-side
  stream client), `handlers.ts` (background-side handlers).
- `src/lib/storage/settings.ts` — settings (key, model, context level, `webSearch`) and context
  levels. `src/lib/history/store.ts` — saved threads, 50 per conversation, 300 total.
- `src/lib/brand.ts` — product name; `_locales/en` `appName`/`appDescription` must match (tested).
- `src/ui/` — `App.tsx` (selection → toolbar → popover orchestration), `Toolbar.tsx`,
  `Popover.tsx` (streaming, follow-ups, sources line, drag, history view), `HistoryList.tsx`,
  `sources.ts`, `input-guard.ts`, `dom.ts` (shadow-DOM event helpers), `position.ts`, `styles.css`.
- `tests/setup.ts` — in-memory `chrome` fake for Vitest; `*.test.ts` files sit beside modules.
- `docs/dom-docs/` — real claude.ai DOM structure dumps (2026-10-21). Ground truth for every
  selector in `claude-ai.ts`: recalibrate from a fresh dump, never from guesses.
- `docs/PRIVACY.md`, `docs/STORE_LISTING.md` — store-facing docs; `scripts/icons.mjs` renders the PNGs.

## Non-obvious decisions (and why)

- **No Anthropic SDK.** `claude-client.ts` is a hand-rolled `fetch` plus SSE parser: one streaming
  endpoint is all we need, and the SDK would add bundle weight inside a service worker for no gain.
- **`anthropic-dangerous-direct-browser-access: true` header.** The service worker sends a
  `chrome-extension://` Origin, which the API treats as a browser request and rejects without it.
  Safe here: BYOK, the user's own key, stored only in `chrome.storage.local`, sent only to
  `api.anthropic.com`; there is no shared or embedded key.
- **`output_config: { effort: 'low' }`, no sampling params, no `thinking` field.** Side answers
  must be fast and cheap; current models reject `temperature`/`top_p`/`top_k`.
- **Model IDs `claude-haiku-5-5` (default) and `claude-sonnet-5-5` are real.** They were
  released after most training data. Do not "correct" them to older names. Current as of
  2026-10; if Test connection returns a model-not-found error, updating them is correct.
- **Web search is prompt-governed; no code gate per mode (deliberate).** With `webSearch` on
  (default), every side question offers `WEB_SEARCH_TOOL` (`web_search_20250305`, `max_uses: 3`),
  Explain included; Test connection never does. The `GROUNDING` block in `prompts.ts` (verbatim,
  Phase 5 brief) decides: search only for current, recent or verifiable specifics, so Explain
  searches only when the phrase needs it (a code gate would have to guess); "not in the
  conversation" is answered from the model's own knowledge, no hedging. Setting off:
  `buildSystemPrompt(mode, false)` drops the two search sentences (`get-config` carries the flag),
  so the model is never told to use a tool it lacks. Basic tool version on purpose:
  `_20260209`/`_20260318` route searches through code execution (slower, needs programmatic tool
  calling, no ZDR).
- **Stream events (`claude-client.ts`).** `text_delta` → `text`; `content_block_start` of a
  `server_tool_use` → `searching`; `citations_delta` (or `citations` on a text block start) →
  `{ url, title }`, unique by URL, as `sources` on `done`. `web_search_tool_result` (results or an
  error such as `max_uses_exceeded`), `input_json_delta`, thinking and unknown event/block/delta
  types are ignored, never thrown on; EOF without `message_stop` still yields `done`. Sources are
  display-only: follow-ups send plain-text assistant turns, never the search blocks back.
- **Window-capture input guard (`input-guard.ts`).** claude.ai's document-level key/clipboard
  handlers redirect input to its composer when `document.activeElement` is our shadow host. The
  guard listens at window capture and calls `stopPropagation` (not `preventDefault`) while focus
  is inside our shadow root: the page never sees the event, default actions still happen. Only
  Enter (submit) and Escape (close) are owned; the Ask input is uncontrolled, read through a ref.
- **`closest()` order in `findRow`.** `[data-transcript-row]` is an inner wrapper nested inside
  the real `[data-testid="transcript-row"]`. Try the primary selector on the whole ancestor chain
  before any fallback; interleaving per ancestor matches the inner wrapper and loses `data-index`.
- **The transcript is virtualized.** Only rows near the viewport exist in the DOM, by design.
  `position.earliestRenderedIndex` records the gap and the prompt adds "[earlier turns exist
  but are not shown]". Do not scroll or force-render rows to get more context.
- **Mousedown guards decide via `composedPath()[0]`.** Inside a shadow root `event.target` is
  retargeted to the host, so `eventTargetElement` in `dom.ts` reads the real target. Popover
  and toolbar `preventDefault` on mousedown to keep the page selection alive, but never on
  editable targets or on text selection inside the thread body (where the source links live).
- **Follow-ups switch to the ask prompt.** `buildRequest` uses the `ask` system prompt whenever
  the side thread is non-empty, even if the popover opened in Explain mode. The first exchange
  is embedded in the context message; later exchanges alternate as user/assistant turns.
- **`MessageKey` is `keyof` a typed JSON import** of `_locales/en/messages.json`: a typo fails
  typecheck, no generator. `t()` falls back to English when `chrome.i18n` lacks the key or is absent.

## Workflow

- `pnpm check` (typecheck + lint + test) must pass before every commit.
- One commit per brief item. Prefixes as in history: `feat(popover):`, `fix:`, `docs:`, `chore:`.
- `DEBUG` flags in `claude.content.ts` and `input-guard.ts` stay `false` in commits.
- No user-visible string literals in `src/`: add the string to `public/_locales/en/messages.json`
  (with a translator description) and use `t()`. Every locale file must carry the full key set;
  `i18n.test.ts` fails otherwise. Prompts in `prompts.ts` are not UI strings and stay English.
- Git tags `phase-0` … `phase-5` mark accepted states. A tag may be moved only for a hotfix to
  that same phase before the next phase starts; after that it is frozen.
- Status reports go to the CTO, sections in order: files changed (one line each); new/changed
  exported signatures; test results; deviations from the brief and why; unsure/guessed (be
  specific); dependencies wanted but not added; plus anything the brief asked to see verbatim.
- Dev loop: `pnpm dev` (temp profile, hot reload), or `pnpm build` and load `.output/chrome-mv3` unpacked.

## Known deferred items

- `zod` at the message boundary (`protocol.ts` messages are cast, not validated).
- `@floating-ui/dom` for placement (hand-rolled today in `Popover.tsx`, `Toolbar.tsx`, `position.ts`).
- Passive row cache for the virtualized transcript: backlog, not planned.
