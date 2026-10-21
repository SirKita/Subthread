import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { BRAND } from './src/lib/brand';

export default defineConfig({
  srcDir: 'src',
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: BRAND.name,
    description: BRAND.shortDescription,
    permissions: ['storage'],
    host_permissions: ['https://api.anthropic.com/*'],
    action: {
      default_title: BRAND.name,
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
