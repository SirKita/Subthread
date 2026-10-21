# Subthread — Privacy

## The short version

Subthread lets you highlight a phrase on claude.ai and ask a quick side question
about it. Everything it does happens between your browser and Anthropic's API,
using your own API key. Nothing is ever sent to us — we don't run any servers,
and there are no analytics, trackers, or telemetry of any kind.

## What leaves your browser

When you press Explain or Ask, the extension sends one request to
`api.anthropic.com` (Anthropic's official API). That request contains:

- the text you highlighted,
- nearby conversation text (so the answer understands the context),
- your question, if you typed one,
- your Anthropic API key, which authenticates the request.

That is the only network destination the extension can talk to — the browser
enforces this through the extension's permissions. Your use of the Anthropic
API is governed by Anthropic's own privacy policy and terms.

## What is stored on your device

Stored in your browser's local extension storage, and nowhere else:

- your Anthropic API key,
- your settings (model choice, how much conversation context to send),
- your subthread history: the highlighted phrases, short snippets of the
  surrounding conversation, and the questions and answers from each thread.

History is capped (at most 50 threads per conversation, 300 in total) and old
entries are deleted automatically.

## How to delete your data

- Delete a single history entry with the × next to it, or use "Clear history
  for this conversation" in the popover.
- Use "Clear all history" on the settings page to remove every saved thread.
- Removing the extension deletes everything it stored, including your API key.

## Access to claude.ai pages

The extension runs only on `claude.ai`. It reads the page solely to find the
conversation text around your highlight, and it never modifies or sends
anything into your Claude conversation. It does not read other tabs or any
other website.

## Questions

Contact: see the support address on the store listing.
