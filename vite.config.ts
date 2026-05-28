import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Project Pages serves at https://<user>.github.io/pixijs-enchanter/
// so production builds need the repo path as the base. The CI workflow
// sets GITHUB_PAGES=1 before `vite build`; local dev / preview leaves
// it unset and uses the default `/`.
export default defineConfig({
  plugins: [svelte()],
  base: process.env.GITHUB_PAGES ? '/pixijs-enchanter/' : '/',
  server: {
    host: true,
    port: 5173,
  },
});
