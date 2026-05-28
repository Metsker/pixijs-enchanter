import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';

// Project Pages serves at https://<user>.github.io/pixijs-enchanter/
// so production builds need the repo path as the base. The CI workflow
// sets GITHUB_PAGES=1 before `vite build`; local dev / preview leaves
// it unset and uses the default `/`.

// Inject git info so the UI can render a tiny version label.
// __VERSION__ = v<commit-count> for the visible badge, __COMMIT__ =
// short SHA for the GitHub permalink. Both fall back to dev / 0
// when git isn't available (e.g. tarball build).
const commit = ((): string => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

const version = ((): string => {
  try {
    return 'v' + execSync('git rev-list --count HEAD').toString().trim();
  } catch {
    return 'v0';
  }
})();

export default defineConfig({
  plugins: [svelte()],
  base: process.env.GITHUB_PAGES ? '/pixijs-enchanter/' : '/',
  define: {
    __COMMIT__: JSON.stringify(commit),
    __VERSION__: JSON.stringify(version),
  },
  server: {
    host: true,
    port: 5173,
  },
});
