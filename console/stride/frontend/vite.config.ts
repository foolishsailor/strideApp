/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/* The build writes straight into the APK's assets, next to the two shared
   scripts. Kotlin loads `ui/trailmate.html` (MainActivity.UI_URL), so
   producing exactly that file is the whole contract. */
const ASSETS_UI = fileURLToPath(new URL('../app/src/main/assets/ui', import.meta.url));

/* stride-core.js and stride-settings.js stay plain classic scripts shared by
   all five interfaces. In dev they are served straight from the assets folder,
   so the browser runs the same copies the console does — and only those two:
   the folder also holds the *built* trailmate.html, which must never shadow
   the live source. */
const SHARED = ['/stride-core.js', '/stride-settings.js'];
function sharedScripts(): Plugin {
  return {
    name: 'stride-shared-scripts',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]!;
        if (!SHARED.includes(path)) return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readFileSync(join(ASSETS_UI, path)));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), sharedScripts()],
  publicDir: false,

  build: {
    outDir: ASSETS_UI,
    emptyOutDir: false,
    /* Gen 6 consoles run the Chromium 83 WebView (2020). Syntax is lowered to
       that; APIs and CSS that cannot be lowered are caught by
       scripts/check-compat.mjs after the build. */
    target: 'chrome83',
    cssTarget: 'chrome83',
    modulePreload: { polyfill: false },
    rollupOptions: { input: 'trailmate.html' },
  },

  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
