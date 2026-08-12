# Character Companion

A persistent digital companion for **D&D 5e (2014 ruleset)** characters — built to feel like an
RPG interface rather than a PDF character sheet, and to survive an entire campaign.

> **Status: all nine phases complete.** 607 tests, typecheck, bundle budget and production build
> clean; every phase verified end-to-end in a real browser.
> [`QA_CHECKLIST.md`](./QA_CHECKLIST.md) is the manual pass.

## What this is

Character creation, a live play dashboard, inventory, spellbook, leveling, a public/private
campaign journal, linked campaign notes, and character portraits/sprites with an emote system.
Local-first, offline-capable, mobile- and table-friendly.

Everything is stored in the browser on your device. There is no account, no server and nothing is
uploaded; export/import is the backup and transfer route.

## Documentation

These documents are the source of truth and are maintained as development proceeds.

| Document | Contents |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Stack, module boundaries, data flow, navigation, sync-readiness |
| [`DATA_MODEL.md`](./DATA_MODEL.md) | Entities, persistence layout, the rules/character/custom split |
| [`RULES_ENGINE.md`](./RULES_ENGINE.md) | Derived stats, the effects layer, calculation order, testing |
| [`API_INTEGRATION.md`](./API_INTEGRATION.md) | API evaluation, licensing limits, data-integrity findings |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | Phases, assumptions, risks, what each phase found |
| [`QA_CHECKLIST.md`](./QA_CHECKLIST.md) | Manual test pass, and the known limits that are not bugs |

## Three findings that shaped the design

**1. The SRD is much smaller than the Player's Handbook, and no API can fix that.**
Measured against the 2014 dataset: **1 background** (Acolyte), **1 feat** (Grappler),
**12 subclasses** (one per class), **4 subraces**, and 319 spells. Races and classes are complete.
Only SRD 5.1 is freely licensed; the rest of the PHB is proprietary. So **custom content is a
core feature, not an add-on** — it is how a player represents the character they're actually
playing. See [`API_INTEGRATION.md`](./API_INTEGRATION.md) §2.

**2. Rules data describes features in English, not in code.**
Barbarian Unarmored Defense arrives as the sentence *"your Armor Class equals 10 + your Dexterity
modifier + your Constitution modifier."* No 5e API computes that. The app therefore carries a
hand-authored **effects layer** translating features into machine-readable modifiers, with an
explicit `prose-only` fallback so an unencoded feature still displays its text instead of
silently doing nothing. See [`RULES_ENGINE.md`](./RULES_ENGINE.md) §3.

**3. The dataset contains real traps.**
`ability_score_bonuses` is *cumulative*, so read naively it grants an ASI at every level;
`Levels` mixes subclass rows into class progression (Fighter returns 25 rows for 20 levels).
Both are handled explicitly and covered by regression tests. See
[`API_INTEGRATION.md`](./API_INTEGRATION.md) §4.

## Design principles

- **One source of truth for every number.** All derived statistics come from a single pure
  `deriveCharacter()`. No component computes a modifier inline.
- **Show your work.** Stats carry their contributions, so AC 17 explains itself as
  *14 breastplate + 2 DEX + 1 ring*.
- **Never overwrite the player.** Every derived value has a manual override, and refreshing
  rules data never rewrites character data.
- **No silent irreversible choices.** Selections are recorded with their origin, so back-navigation
  and level-ups are non-destructive and auditable.
- **Official vs. homebrew is always visible**, and homebrew works everywhere official content does.
- **Private stays private.** Journal visibility is a required field with no default.

## Stack

TypeScript (strict) · React + Vite · React Router · Zustand · TanStack Query · Dexie (IndexedDB) ·
Zod · Tailwind + design tokens · Vitest. Rationale in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §2.

## Getting started

```bash
npm install
npm run dev        # development server
npm test           # 607 tests
npm run build      # typecheck, production build, bundle budget
npm run preview    # serve the production build
```

No API keys and no network access are needed: the SRD dataset is vendored into the repo, so the
app builds and runs entirely offline.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest, including engine tests against the real SRD tables |
| `npm run typecheck` | `tsc`, strict, with `noUncheckedIndexedAccess` |
| `npm run build` | Typecheck → production build → bundle budget (fails if a chunk is over) |
| `npm run bundle` | Bundle budget report on the current `dist/` |
| `npm run validate:rules` | Validates all 25 vendored SRD collections against their schemas |
| `npm run build:single` | One self-contained HTML file in `dist-single/` — see below |

### The single-file build

`npm run build:single` inlines the code, the styles and the entire SRD dataset into one ~3.5 MB
HTML file that runs from any static host or straight off a filesystem, with no server. It routes
on the hash so deep links and refreshes work without rewrite rules. It is for handing someone a
link to try; `npm run build` remains the real build — the single-file one gives up code splitting,
which is what the bundle budget exists to protect.

## Performance

First load is **113 kB gzip** (entry + CSS). Every route past the gallery is code-split; the
largest tab chunk is 6 kB. The SRD dataset is 25 separate chunks fetched per collection on demand,
so opening a character never downloads the monster manual. Budgets are enforced by
`scripts/check-bundle.mjs`, which fails the build.

## Accessibility

Audited with axe-core across 14 routes × 3 viewports × both themes, plus keyboard checks, on every
build of Phase 9. Zero violations at WCAG 2.1 AA. Beyond the automated pass: a skip link, focus
moved to the content region on every client-side navigation, 44px touch targets, state carried by
text as well as colour, and `prefers-reduced-motion` honoured live rather than sampled at mount.

## Legal

This project ships no proprietary Wizards of the Coast content. Rules data derives from the
**SRD 5.1**, used under **CC-BY-4.0**, via the MIT-licensed
[`5e-bits/5e-database`](https://github.com/5e-bits/5e-database) dataset. Attribution notices ship
in the application. Homebrew content is created and owned by users.
