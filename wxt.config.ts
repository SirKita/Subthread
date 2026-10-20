import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: 'src',
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: 'side-question',
    description: 'Ask Claude a side question about any highlighted phrase on claude.ai.',
    permissions: ['storage'],
    host_permissions: ['https://api.anthropic.com/*'],
    options_ui: {
      open_in_tab: true,
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
