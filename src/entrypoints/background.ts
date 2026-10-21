import { defineBackground } from 'wxt/utils/define-background';
import { handleAsk, handleGetConfig, handleTestConnection } from '../lib/messaging/handlers';
import { PORT_NAME } from '../lib/messaging/protocol';
import type {
  BackgroundToContent,
  ContentToBackground,
  OpenHistoryMessage,
} from '../lib/messaging/protocol';

export default defineBackground(() => {
  // Toolbar icon: open history in the claude.ai tab, or the options page elsewhere.
  chrome.action.onClicked.addListener((tab) => {
    const openOptions = () => void chrome.runtime.openOptionsPage();
    if (tab.id == null) {
      openOptions();
      return;
    }
    const message: OpenHistoryMessage = { type: 'open-history' };
    chrome.tabs.sendMessage(tab.id, message).catch(openOptions);
  });

  // Streaming channel: one port per content-script page, many requests per port.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;

    const inFlight = new Map<string, AbortController>();
    const post = (out: BackgroundToContent): void => {
      try {
        port.postMessage(out);
      } catch {
        // Port closed mid-stream; the abort below cleans up the request.
      }
    };

    port.onMessage.addListener((raw) => {
      const msg = raw as ContentToBackground;
      if (msg.type === 'ask') {
        void handleAsk(msg, post, inFlight);
      } else if (msg.type === 'abort') {
        inFlight.get(msg.requestId)?.abort();
      }
    });

    port.onDisconnect.addListener(() => {
      for (const controller of inFlight.values()) controller.abort();
      inFlight.clear();
    });
  });

  // One-shot messages (options page + content script).
  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = raw as { type?: string };
    if (msg?.type === 'test-connection') {
      void handleTestConnection().then(sendResponse);
      return true; // keep the channel open for the async response
    }
    if (msg?.type === 'get-config') {
      void handleGetConfig().then(sendResponse);
      return true;
    }
    if (msg?.type === 'open-options') {
      void chrome.runtime.openOptionsPage();
    }
    return undefined;
  });
});
