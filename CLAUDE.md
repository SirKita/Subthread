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

- `wxt.config.ts` — manifest: name/description from `src/lib/brand.ts`, permissions, icons.
- `package.json` — scripts: `dev`, `build`, `zip`, `check` (typecheck + lint + test), `icons`.
- `src/entrypoints/background.ts` — service worker: streaming port, one-shot messages, action click.
- `src/entrypoints/claude.content.ts` — content script on `https://claude.ai/*`: mounts the
  shadow-root UI; Ctrl/Cmd+Shift+D structure dump hotkey.
- `src/entrypoints/options/` — settings page: API key, model, context slider, clear history.
- `src/lib/api/` — `claude-client.ts` (fetch + SSE stream), `sse.ts` (parser), `errors.ts`
  (`ApiError` kinds), `prompts.ts` (system/user prompts, `buildRequest`).
- `src/lib/context/` — `adapter.ts` (types), `claude-ai.ts` (structured DOM adapter,
  `CLAUDE_AI_SELECTORS`), `naive.ts` (last-resort fallback), `budget.ts` (token estimate and
  trimming order), `dump.ts` (structure-only DOM dump).
- `src/lib/messaging/` — `protocol.ts` (message types, port name), `port.ts` (content-side
  stream client), `handlers.ts` (background-side handlers).
- `src/lib/storage/settings.ts` — settings and context levels. `src/lib/history/store.ts` —
  saved threads, 50 per conversation, 300 total.
- `src/lib/brand.ts` — the only place the product name lives.
- `src/ui/` — `App.tsx` (selection → toolbar → popover orchestration), `Toolbar.tsx`,
  `Popover.tsx` (streaming, follow-ups, drag, history view), `HistoryList.tsx`,
  `input-guard.ts`, `dom.ts` (shadow-DOM event helpers), `position.ts`, `styles.css`.
- `tests/setup.ts` — in-memory `chrome` fake for Vitest; `*.test.ts` files sit beside modules.
- `docs/dom-docs/` — real claude.ai DOM structure dumps (2026-10-21). Ground truth for every
  selector in `claude-ai.ts`: recalibrate from a fresh dump, never from guesses.
- `docs/PRIVACY.md`, `docs/STORE_LISTING.md` — store-facing docs. `scripts/icons.mjs` renders
  `public/icon/source.svg` to the manifest PNGs.

## Non-obvious decisions (and why)

- **No Anthropic SDK.** `claude-client.ts` is a hand-rolled `fetch` plus SSE parser. One
  streaming endpoint is all we need; the SDK would add bundle weight and a dependency inside a
  service worker for no gain.
- **`anthropic-dangerous-direct-browser-access: true` header.** The service worker sends a
  `chrome-extension://` Origin, which the API treats as a browser request and rejects without
  this header. Safe here because the key is the user's own (BYOK), stored only in
  `chrome.storage.local`, sent only to `api.anthropic.com`. There is no shared or embedded key.
- **`output_config: { effort: 'low' }`.** Side answers must be fast and cheap. No
  `temperature`/`top_p`/`top_k` (current models reject them) and no `thinking` field.
- **Model IDs `claude-haiku-5-5` (default) and `claude-sonnet-5-5` are real.** They were
  released after most training data. Do not "correct" them to older names.
- **Window-capture input guard (`input-guard.ts`).** claude.ai has document-level keyboard and
  clipboard handlers that redirect input to its composer when `document.activeElement` is our
  shadow host. The guard listens at window capture, ahead of any page listener, and calls
  `stopPropagation` (not `preventDefault`) while focus is inside our shadow root: the page never
  sees the event, but default actions (typing, paste, cut, copy, IME) still happen in our input.
  Only Enter (submit) and Escape (close) are owned. Consequence: events never reach our own
  elements either, so the Ask input is uncontrolled and its value is read through a ref.
- **`closest()` order in `findRow`.** `[data-transcript-row]` is an inner wrapper nested inside
  the real `[data-testid="transcript-row"]`. The primary selector must be tried on the whole
  ancestor chain before any fallback; interleaving per ancestor would match the inner wrapper
  and lose `data-index` and `data-perf-row`.
- **The transcript is virtualized.** Only rows near the viewport exist in the DOM, by design.
  `position.earliestRenderedIndex` records the gap and the prompt adds "[earlier turns exist
  but are not shown]". Do not scroll or force-render rows to get more context.
- **Mousedown guards decide via `composedPath()[0]`.** Inside a shadow root `event.target` is
  retargeted to the host, so `eventTargetElement` in `dom.ts` reads the real target. Popover
  and toolbar `preventDefault` on mousedown to keep the page selection alive, but never on
  editable targets or on text selection inside the thread body.
- **Follow-ups switch to the ask prompt.** `buildRequest` uses the `ask` system prompt whenever
  the side thread is non-empty, even if the popover opened in Explain mode. The first exchange
  is embedded in the context message; later exchanges alternate as user/assistant turns.

## Workflow

- `pnpm check` (typecheck + lint + test) must pass before every commit.
- One commit per brief item. Prefixes as in history: `feat(popover):`, `fix:`, `docs:`, `chore:`.
- `DEBUG` flags in `claude.content.ts` and `input-guard.ts` stay `false` in commits.
- Git tags `phase-0` … `phase-3.1` mark accepted states. Never move them; a newly accepted state
  gets a new tag.
- Status reports go to the CTO in the format used so far: per item, what changed and where;
  the `pnpm check` result; the commit hash; anything flagged (new deps, deviations, open
  questions); and whatever the brief asked to see verbatim.
- Dev loop: `pnpm dev` (temp profile, hot reload) or `pnpm build` then load `.output/chrome-mv3`
  unpacked.

## Known deferred items

- `zod` at the message boundary (`protocol.ts` messages are cast, not validated).
- `@floating-ui/dom` for placement (hand-rolled today in `Popover.tsx`, `Toolbar.tsx`, `position.ts`).
- Localized `aria-label` for `position.total`.
- Passive row cache for the virtualized transcript: backlog, not planned.
