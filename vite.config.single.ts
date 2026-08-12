import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * A one-file build, for handing someone a link.
 *
 * Everything — code, styles and the whole SRD dataset — is inlined into a single HTML document
 * that runs from any static host, or straight off a filesystem, with no server. It gives up the
 * lazy loading the real build depends on, so it is a demo artifact and not the shipping build:
 * `npm run build` remains the one that has a bundle budget.
 */

function inlineEverything(): Plugin {
  return {
    name: 'inline-everything',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (file) => file.type === 'asset' && file.fileName.endsWith('.html'),
      );
      if (!html || html.type !== 'asset') return;

      let source = String(html.source);

      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk') {
          // Escape a literal </script> in the code so it cannot close the tag it lives in.
          const code = file.code.replace(/<\/script>/gi, '<\\/script>');
          // Replacer functions, not strings: minified code is full of `$&` and backtick-dollar
          // sequences, which String.replace would expand as match patterns and splice chunks of
          // the surrounding HTML into the middle of the bundle.
          source = source.replace(
            new RegExp(`<script[^>]*src="[^"]*${escapeRegExp(file.fileName)}"[^>]*></script>`),
            () => `<script type="module">${code}</script>`,
          );
          delete bundle[name];
        } else if (file.fileName.endsWith('.css')) {
          source = source.replace(
            new RegExp(`<link[^>]*href="[^"]*${escapeRegExp(file.fileName)}"[^>]*>`),
            () => `<style>${String(file.source)}</style>`,
          );
          delete bundle[name];
        }
      }

      html.source = source;
    },
  };
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig({
  plugins: [react(), tailwindcss(), inlineEverything()],
  base: './',
  define: {
    'import.meta.env.VITE_HASH_ROUTER': 'true',
    /*
     * Vite rewrites every dynamic import to `__vitePreload(() => import(...), __VITE_PRELOAD__)`
     * and substitutes that placeholder with the chunk's dependency list while emitting chunks.
     * Inlined into a single document there are no chunks to list, the substitution never happens,
     * and the placeholder survives into the output — so every lazily-loaded route throws
     * `__VITE_PRELOAD__ is not defined` on first render. `void 0` tells the helper there is
     * nothing to preload, which is exactly true here.
     */
    __VITE_PRELOAD__: 'void 0',
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    // Without this, the lazily-imported routes keep Vite's `__VITE_PRELOAD__` placeholder, which
    // is only substituted when chunks are emitted as separate files. Inlined into one document it
    // stays undefined and every code-split route throws on first render.
    modulePreload: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
