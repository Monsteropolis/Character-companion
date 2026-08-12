# Browser QA harness

Two Playwright scripts that check things jsdom cannot. They are not part of `npm test` because
they need a real browser and a built app; run them when changing layout, theming, navigation or
the single-file build.

```bash
npm i -D playwright axe-core --no-save   # not permanent dependencies
npm run build
npm run preview &                        # serves http://127.0.0.1:4173

node qa/audit.mjs                        # accessibility, layout, touch targets
node qa/single-file.mjs                  # requires: npm run build:single
```

Chromium is expected at `/opt/pw-browsers/chromium`; change `executablePath` if yours is
elsewhere. Both scripts exit non-zero when they find something, so they can gate a release.

## `audit.mjs`

Drives the creation wizard to seed a real character, then runs **axe-core** (WCAG 2.1 A + AA) over
every route at phone, tablet and desktop widths, plus a dark-theme pass. It also checks for
horizontal overflow, touch targets under 40px, and that focus lands on the content region after a
client-side navigation.

Two notes on how it measures, both learned the hard way:

- **Dark theme gets its own browser context** with `colorScheme: 'dark'`, rather than flipping
  `data-theme` on a live page. Flipping it starts a `transition-colors` on every themed element,
  and axe samples the interpolated values — which reported a 1.04:1 contrast failure that no user
  could ever see. The settled value was 13:1.
- **The touch-target check exempts** visually-hidden controls (the skip link has no target until
  it is focused) and links that flow inline with text, which WCAG 2.2 exempts too.

## `single-file.mjs`

Serves `dist-single/` over HTTP — not `file://`, whose restricted storage would fail IndexedDB for
reasons unrelated to the build — and checks that the one-file build boots, routes on the hash,
creates a character from the inlined SRD data, survives a reload, and makes no external requests.

It caught the failure mode that build has: inlining the dynamic imports leaves Vite's
`__VITE_PRELOAD__` placeholder undefined, so every lazily-loaded route throws on first render.
`modulePreload: false` in `vite.config.single.ts` is what prevents it.
