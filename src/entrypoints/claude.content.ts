import { h, render } from 'preact';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { describeAncestry } from '../lib/context/dump';
import { App } from '../ui/App';
import { HOST_TAG, isSelectionInOwnUi } from '../ui/dom';
import '../ui/styles.css';

const DEBUG = false;

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    if (DEBUG) {
      console.log('[subthread] content script loaded');
      let debounce: number | undefined;
      document.addEventListener('selectionchange', () => {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(() => {
          // Log only the LENGTH — never the selected text itself.
          console.log('[subthread] selection length:', selectionLength());
        }, 150);
      });
    }

    // Dev helper: Ctrl+Shift+D / Cmd+Shift+D dumps the DOM structure around the selection.
    document.addEventListener('keydown', onDumpHotkey, true);

    const ui = await createShadowRootUi(ctx, {
      name: HOST_TAG,
      position: 'overlay',
      anchor: 'body',
      zIndex: 2147483646,
      onMount: (container) => {
        render(h(App, {}), container);
        return container;
      },
      onRemove: (container) => {
        if (container) render(null, container);
      },
    });
    ui.mount();
  },
});

function selectionLength(): number {
  return window.getSelection()?.toString().length ?? 0;
}

function onDumpHotkey(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'd') {
    return;
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  if (isSelectionInOwnUi(selection)) return; // dumps describe the page, not our UI
  event.preventDefault();

  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  if (!element) return;

  // describeAncestry never includes text content — structure and lengths only.
  const dump = { ...describeAncestry(element), selectionLength: selection.toString().length };
  console.log('[subthread] DOM structure dump', dump);
  void navigator.clipboard.writeText(JSON.stringify(dump, null, 2)).catch(() => {});
}
