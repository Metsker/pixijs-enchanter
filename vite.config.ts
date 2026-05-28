import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';

// Project Pages serves at https://<user>.github.io/pixijs-enchanter/
// so production builds need the repo path as the base. The CI workflow
// sets GITHUB_PAGES=1 before `vite build`; local dev / preview leaves
// it unset and uses the default `/`.

// Inject the short commit SHA so the UI can render a tiny version
// label. Falls back to 'dev' when git isn't available (e.g. tarball
// build).
const commit = ((): string => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  plugins: [svelte()],
  base: process.env.GITHUB_PAGES ? '/pixijs-enchanter/' : '/',
  define: {
    __COMMIT__: JSON.stringify(commit),
  },
  server: {
    host: true,
    port: 5173,
  },
});
