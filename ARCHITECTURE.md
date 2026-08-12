# Architecture

Status: **proposed — awaiting sign-off on the open questions in `IMPLEMENTATION_PLAN.md`.**

## 1. Shape of the problem

This is a **local-first document editor** whose documents happen to be D&D characters, sitting on
top of a large, immutable, read-only reference dataset. Two kinds of state with opposite
characteristics:

| | Rules data | Character data |
|---|---|---|
| Owner | Upstream SRD | The user |
| Mutability | Immutable | Mutated constantly, mid-session |
| Volume | Large (~10 MB) | Small per character |
| Loss tolerance | Re-fetchable | **Catastrophic** |

Conflating these is the main way an app like this goes wrong. They get separate stores, separate
caching strategies, and separate persistence guarantees.

## 2. Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | **TypeScript, `strict`** | Non-negotiable for a rules engine this branchy. |
| Build | **Vite** | Fast HMR, trivial local dev, native code-splitting for rules chunks. |
| UI | **React 18** | Component reuse; the largest ecosystem for the a11y primitives we need. |
| Routing | **React Router** | Nested layouts map exactly onto the character-shell + tabs design. |
| Rules cache | **TanStack Query** | Purpose-built for async read-through caching + loading/error states. |
| Character state | **Zustand** | Small, no boilerplate, no provider re-render storms. |
| Persistence | **Dexie (IndexedDB)** | Typed tables + migrations; handles image blobs. |
| Validation | **Zod** | One schema for the API boundary *and* saved-document migration. |
| Styling | **Tailwind + CSS-variable token layer** | Fast, but themeable — tokens make the atmospheric skin swappable. |
| Testing | **Vitest + Testing Library** | Same transform pipeline as the build. |

### Why not Next.js
There is no server in v1: no auth, no SSR-worthy content, no secrets. Next would add a build and
deploy story that buys nothing for a client-local tool, and its data-fetching model actively
fights an offline-first IndexedDB app. Vite ships a static bundle deployable anywhere. If cloud
sync arrives, a thin API service is added *beside* this app — the data model is already shaped
for it (§6).

### Why IndexedDB, not localStorage
Portraits and sprite sheets are binary and will blow past the ~5 MB localStorage ceiling. More
importantly, localStorage's only access pattern is "serialize the whole blob," which is exactly
the anti-pattern the brief rules out. Dexie gives real tables, indices, and versioned migrations.

## 3. Module map

Dependencies point strictly downward. Nothing below the UI layer imports React.

```
src/
  rules/          # RulesSource abstraction, Zod schemas, bundled SRD, HTTP adapter
  engine/         # PURE rules engine. No React, no I/O, no persistence.
    effects/      #   hand-authored machine-readable riders for prose features
    derive/       #   deriveCharacter() and its contributors
  domain/         # entity types, factories, invariants, schema migrations
  persistence/    # Dexie schema, repositories, import/export, migration runner
  features/       # vertical slices: creation, sheet, inventory, spellbook,
                  #   journal, notes, leveling, portrait, custom-content
  ui/             # design system primitives: Panel, Stat, Sheet, Dialog, Field...
  app/            # shell, routing, providers, error boundaries
```

**The `engine/` boundary is the load-bearing rule of this codebase.** It is a pure function
library: given a character and rules data, produce derived statistics. No component ever computes
a modifier inline. This is what makes the numbers testable and consistent, and it is enforced by
lint rules banning React imports under `engine/`.

## 4. Data flow

```
BundledRulesSource ─┐
HttpRulesSource ────┼─► CompositeRulesSource ──► TanStack Query ──┐
CustomContentRepo ──┘                                             │
                                                                  ▼
Dexie ──► characterStore (Zustand) ──► deriveCharacter() ──► DerivedStats ──► UI
              ▲                                                                │
              └──────────────────── actions (damage, cast, equip) ◄────────────┘
```

Every write goes through a store action, which persists to Dexie and bumps `updatedAt`. Derived
stats are recomputed by memoized selector, never stored. **Derived values are never persisted** —
persisting a computed AC guarantees it eventually disagrees with its inputs.

## 5. Navigation

The suggested structure is sound; I propose one substantive improvement. The nav tabs are
*reference*, but play is dominated by a handful of high-frequency actions. So a **persistent Play
Bar** sits outside the tab content and is always visible:

> **portrait/sprite · HP control · AC · conditions · emote trigger**

Damage and healing therefore cost one tap from anywhere in the app — including mid-journal-entry.

```
/                       character gallery (large portrait cards)
/create                 creation wizard (step routes, resumable)
/c/:id                  character shell  ── Play Bar + tabs
      /overview  /combat  /abilities  /spells  /inventory  /journal  /notes
/c/:id/level-up         level-up flow (modal route)
/custom                 homebrew content manager
/settings
```

- **Spells** is hidden entirely for non-casters rather than shown empty.
- **Desktop** ≥1024px: two columns, Play Bar docked as a right rail.
- **Mobile**: bottom tab bar, Play Bar docked directly above it, thumb-reachable.
- Tab state is URL-driven so a browser back button behaves and views are linkable.

## 6. Cloud-sync readiness (built for, not built now)

No sync in v1, but retrofitting sync onto the wrong primary keys is a rewrite. So from day one
every persisted record carries:

- `id`: client-generated **UUID** (never an autoincrement — those collide across devices)
- `updatedAt`: epoch ms, for last-write-wins
- `deletedAt`: nullable **tombstone**; deletes are soft, so a delete can propagate
- `ownerId`: nullable now, populated when accounts exist
- `schemaVersion`: per-record, so migrations are incremental

That is the complete set of affordances needed to add a sync service later without touching
feature code.

## 7. Cross-cutting concerns

- **Error handling.** Route-level error boundaries; a rules-source failure degrades to bundled
  data and a warning banner, never a blank screen. Loading and empty states are required for
  every async view, designed alongside the success state.
- **Data safety.** Dexie writes are transactional. JSON export/import of a full character
  (including custom content and images) ships in Phase 1 — it is the user's escape hatch and
  our backup story before accounts exist.
- **Performance.** Rules collections are code-split and lazily loaded; `deriveCharacter` is
  memoized on character revision; long lists (spells, equipment) are virtualized.
- **Accessibility.** Keyboard-navigable throughout, semantic headings, labelled controls,
  visible focus rings, AA contrast in both themes, respects `prefers-reduced-motion` — which the
  emote system must honour specifically.
- **Testing.** The engine is the priority: modifiers, proficiency, AC across armor types,
  spell slots per class/level, ASI detection, encumbrance. Feature slices get integration tests
  on the flows that would silently corrupt a character (creation commit, level-up commit).
