import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    console.log('[side-question] content script loaded');

    let debounce: number | undefined;
    document.addEventListener('selectionchange', () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        // Log only the LENGTH — never the selected text itself.
        const length = window.getSelection()?.toString().length ?? 0;
        console.log('[side-question] selection length:', length);
      }, 150);
    });

    // Empty shadow-root mount; Phase 1 renders the mini-toolbar here.
    const ui = await createShadowRootUi(ctx, {
      name: 'side-question-ui',
      position: 'inline',
      anchor: 'body',
      onMount: () => {},
    });
    ui.mount();
  },
});
