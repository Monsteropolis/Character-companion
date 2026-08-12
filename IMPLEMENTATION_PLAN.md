# Implementation Plan

**Living document.** Updated as phases complete. Last updated: 2026-08-12.

Current status: **Phases 0–8 complete. Phase 9 (polish) is next.**

| Phase | State |
|---|---|
| 0 — Rules foundation | ✅ complete |
| 1 — Shell & persistence | ✅ complete |
| 2 — Creation wizard + custom content | ✅ complete |
| 3 — Dashboard | ✅ complete |
| 4 — Inventory & equipment | ✅ complete |
| 5 — Abilities & spellcasting | ✅ complete |
| 6 — Journal & notes | ✅ complete |
| 7 — Portraits & emotes | ✅ complete |
| 8 — Leveling | ✅ complete |
| 9 — Polish | ⬜ next |

594 tests passing; typecheck and production build clean. Every phase so far
verified end-to-end in a real browser.

## 1. Deviations from the suggested build order

The suggested order is broadly right. Three changes, each forced by a finding in the review:

1. **Custom content moves from Phase 9 to Phase 2.** The SRD legally provides *1 background,
   1 feat, 12 subclasses, and 4 subraces* (`API_INTEGRATION.md` §2). Without homebrew authoring,
   a user cannot build the character they are actually playing. It stops being polish and becomes
   the mechanism that makes creation usable.

2. **A Phase 0 is inserted** for the rules pipeline and engine primitives. Phases 2–5 all sit on
   `deriveCharacter`; building the wizard first would mean writing calculations twice.

3. **Export/import lands in Phase 1**, not at the end. It is the only backup story that exists
   before accounts, and it de-risks every subsequent migration.

## 2. Phases

Each phase ends in a working, committed, demonstrable app.

### Phase 0 — Rules foundation ✅
- ✅ Vite + TS strict + Vitest. *(Tailwind/tokens and the `engine/` lint rule move to Phase 1,
  where the first UI actually needs them.)*
- ✅ Vendored `5e-bits/5e-database` `src/2014/en` — 3.8 MB, 25 collections, MIT + SRD notices.
- ✅ Zod schemas for all 25 collections, optionality measured against every record.
- ✅ Exhaustive `Choice`/`Option` schemas — all 11 `option_type` and 3 `option_set_type` variants.
- ✅ `RulesSource` + `BundledRulesSource` with lazy per-collection loading and quarantine.
- ✅ Engine primitives + contribution model.
- **Exit met:** all 25 collections validate clean; 89 tests pass; typecheck clean.

**Found while building:** `starting_gold` on backgrounds is a `{quantity, unit}` cost object, not
a number — caught by boundary validation on the first run, which is precisely the class of bug
that would otherwise have surfaced as a broken equipment step in Phase 2.

### Phase 1 — Shell & persistence ✅
- ✅ Routing, app shell, error boundaries, loading/empty states.
- ✅ Dexie schema + repositories with soft delete, cascade, and child re-keying on duplicate.
- ✅ Character gallery: duplicate, archive, delete-with-confirm, fast switching.
- ✅ Full JSON export/import (character + custom content + assets inlined as data URLs).
- ✅ `HttpRulesSource` + `CompositeRulesSource`.
- ✅ Tailwind + token layer, character moods, CI-enforced contrast.
- **Exit met:** characters persist across reloads and round-trip through export/import intact.

*Deferred:* the migration runner and pre-migration auto-export land with the first schema
change — there is nothing to migrate from at `schemaVersion: 1`, and writing a runner with no
migration to run would be untested scaffolding.

**Found while building:** the contrast gate failed on its first run because the `border` token
conflated two things WCAG treats differently — decorative hairlines (exempt) and boundaries that
identify a control (3:1 required). Split into `border` / `border-strong` rather than lowering the
threshold, which would have shipped invisible form fields.

### Phase 2 — Creation wizard + custom content ✅
- ✅ Nine steps; persisted draft; non-destructive back-navigation via origin-namespaced selections.
- ✅ `resolveChoice()` covering every `option_type` and `option_set_type`, tested against every
  choice in the real dataset.
- ✅ All four ability-score methods; point buy and standard array as pickers, not free entry.
- ✅ Homebrew manager: authoring UI **and** pack import/export, layered via `CompositeRulesSource`.
- ✅ Review showing every calculated stat with its contributions, sharing the commit code path.
- **Exit met:** a level-1 SRD character completes, persists, and reloads with correct derived stats.

**Also landed here:** `deriveCharacter` and the effects layer, pulled forward from Phase 3
because the review step needs real numbers. Phase 3 consumes them rather than rebuilding.

**Found while building:** the SRD's `starting_gold` is a cost object; `Levels` is the only source
for spells-known counts (Wizards are the exception, whose spellbook size is not in the table at
all and is computed explicitly).

### Phase 3 — Dashboard ✅
- ✅ Play Bar persistent across tabs: portrait, HP with damage/heal/temp, AC, initiative, speed,
  conditions. (Emote controls arrive with Phase 7.)
- ✅ Overview: ability scores, saving throws, skills, passives — every value expandable to its
  contributions.
- ✅ Combat: death saves, hit dice, conditions from the real SRD list, exhaustion with its
  cumulative effects, short and long rests, attack cards.
- ✅ Abilities: features and traits, searchable, grouped by source, with unmodelled ones marked
  "Manual" so the player knows what the sheet is not applying for them.
- **Exit met:** a session is playable from the sheet; every derived stat shows its breakdown.

**Added on request — ability adjustments and stat overrides.** Scores change constantly in play,
so `AbilityAdjustment` records labelled, removable changes split into temporary and permanent.
Bonuses stack; "set" effects (a Belt of Giant Strength) compete rather than stack and do nothing
when the score is already higher. Separately, `StatOverrides` lets any derived value — AC,
initiative, speed, proficiency bonus, passive Perception, spell DC and attack, max HP — be pinned
manually; overridden values keep their computed breakdown visible and are marked on the sheet.

**Also on request — homebrew now carries mechanics, not just prose.** Custom backgrounds grant
real skill and tool proficiencies, a feature, languages and starting gold; races and subraces
carry ability bonuses and speed; spells carry level, school, components and concentration. Every
kind is generated through builders that emit documents validating against the *same* Zod schemas
as SRD content, tested both fully-specified and near-empty.

**Schema v2 and the migration runner.** These additions were the first real schema change, so the
runner deferred in Phase 1 now exists with a migration to run: characters are upgraded on read,
and a v1 save loads with its data intact.

### Phase 4 — Inventory & equipment ✅
- ✅ Seven categories, search, per-item quantity, charges with rest-based restore, notes.
- ✅ Currency across all five denominations, with gain/spend that makes change automatically and
  refuses rather than going negative; consolidation leaves electrum alone.
- ✅ Attunement with the 3-item cap surfaced as a warning, not a hard block — DMs rule otherwise.
- ✅ Equipping routes snapshotted armour and weapon stats into AC, attacks and speed. Equipping
  body armour automatically removes the suit already worn, and says so.
- ✅ Encumbrance and carrying capacity, named in words as well as colour.
- ✅ Add from the SRD catalogue (237 equipment + 362 magic items) or create anything custom;
  every field of an SRD item stays editable.
- **Exit met:** equipping a chain shirt moves AC from 12 to 15 in the live app.

**Found while building:** making change returned the smallest coins, so paying 5 sp from a gold
piece produced 50 cp — value-correct but it buries the purse in loose change. Change now comes
back in the largest sensible coins, with a regression test. Separately, `ConfirmDialog` crashed
under jsdom because `showModal` is unimplemented there; it now falls back to the `open`
attribute, which also covers older browsers.

### Phase 5 — Abilities & spellcasting ✅
- ✅ Spellbook: cantrips and levels 1–9, known/prepared/spellbook modes, rituals, concentration
  tracking, search and filters by level and school.
- ✅ Slots with use/undo; upcasting offered explicitly with the damage each slot produces, read
  from `damage_at_slot_level` / `heal_at_slot_level`.
- ✅ Warlock **Pact Magic** kept as a separate pool that recovers on a short rest, stored under an
  offset key so a Warlock/Wizard's level-2 slots cannot merge.
- ✅ Multiclass slots from a combined caster level — half-casters rounded down individually,
  Warlock excluded — resolved against the full-caster table rather than a hardcoded one.
- ✅ Preparation limits per class; classes that know a fixed list are offered none.
- **Exit met:** a level-5 Wizard, Warlock and Paladin each show correct slots, DC and attack.

**Also on request — every class, not just casters.** `deriveClassResources` reads the level
table's `class_specific` block to produce trackable pools and reference values for all twelve
classes: Rage, Ki, Second Wind, Action Surge, Indomitable, Channel Divinity, Bardic Inspiration,
Sorcery Points, Wild Shape, Mystic Arcanum, Arcane Recovery, plus Sneak Attack dice, Martial Arts
die, Extra Attack, rage damage and the rest. Pools recover on the correct rest; values that are
not spent (Sneak Attack is once per turn) are shown as reference rather than given a tracker.
Four pools the dataset omits — Lay on Hands, Second Wind, Bardic Inspiration uses, Wild Shape —
are published formulas encoded with their reasoning.

**Found while building:** the dataset uses `rage_count: 9999` as an "unlimited" sentinel at level
20, handled explicitly. Clicking a resource before its usage record synced was silently
swallowed, now falling back to the pool definition. The browser pass caught three form controls
with no accessible name (starting level, ability-score method, personality suggestions), now
labelled.

### Phase 6 — Journal & notes ✅
- ✅ Rich text as a constrained markdown subset — headings, lists, quotes, bold, italic, code,
  links — with a preview. No editor dependency and no hidden document model, so entries stay
  searchable, diffable and portable through export.
- ✅ **Privacy is unmistakable.** Visibility is two labelled buttons, never an unlabelled toggle;
  new entries default to private and Secrets default to private; every row carries a badge and
  private rows a visible edge; a visibility filter exists; and a round trip through export is
  tested to preserve it.
- ✅ Tags, session numbers, in-game dates (free text — fantasy calendars are not ISO dates),
  search across title/body/tags, and chronological browsing in either direction.
- ✅ Typed notes for all seven kinds with per-kind structured fields (quest status, NPC attitude,
  faction standing), `EntityLink` cross-links, and **backlinks** so opening an NPC shows every
  session they appeared in.
- **Exit met:** entries and notes cross-link both ways; visibility is stated in words everywhere.

**Found while building:** the rich-text renderer escapes input before introducing its own tags and
refuses to linkify `javascript:` URLs — journal entries are exported and handed to DMs, so their
text is untrusted even in a local-only app. Deleting a note now also drops links pointing at it,
rather than leaving entries with dangling references.

*Deferred:* per-entry image attachments. The asset pipeline lands in Phase 7 with portraits and
sprite sheets; wiring a second uploader now would mean building it twice.

### Phase 7 — Portraits & emotes ✅
- ✅ Upload for still images, animated GIF/WebP and sprite sheets. Stills are downscaled to
  1024 px; **animated images and sheets are stored byte-for-byte**, because re-encoding a GIF
  flattens it to one frame and rescaling a sheet shifts every frame boundary.
- ✅ Sprite sheet editor: grid (columns, rows, frame count) with derived frame size, and named
  animation states mapped to frame ranges, each with its own live preview.
- ✅ Named states with a full fallback chain — requested state → default → first → still image →
  initials. A missing state is never an error and never a blank frame.
- ✅ Emote bar wired into the play bar. Emotes resolve automatically: a matching animation if the
  sprite has one, otherwise a bubble and a pulse, so a static portrait still reacts. Bindings are
  composable arrays, so the same emote gains an animation later with no migration.
- ✅ Taking damage plays the hurt emote, so the portrait reacts to play without a tap.
- ✅ `prefers-reduced-motion` stops animation entirely, tracked live rather than sampled at mount.
- ✅ Journal image attachments, deferred from Phase 6, now that the asset pipeline exists.
- **Exit met:** verified in a browser with a generated 128×96 sheet — grid measured, states
  mapped, sprite animating in the play bar, and Angry correctly degrading to a bubble.

**Found while building:** three real bugs. `readDimensions` could hang forever if a decoder fired
neither `load` nor `error`, leaving the upload spinning — now timed out. Blob resolution threw on
a malformed record instead of degrading to the placeholder. And the play bar kept its own copy of
the portrait list, so an upload did not appear until reload — portraits are now in the shared
sheet context like every other entity.

**Test fixtures:** sprite sheets are generated as real PNGs (`src/test/spriteFixture.ts`) rather
than committed binaries, so each test declares its own grid and the true import path runs. Real
sprite art takes exactly the same route.

*Environment note:* `fake-indexeddb` degrades a jsdom `Blob` to a plain object on structured
clone, so byte-level assertions run against the value `importImage` returns rather than a stored
round trip. Real IndexedDB stores Blobs natively; the browser pass covers the stored bytes.

### Phase 8 — Leveling ✅
- ✅ **Two-phase transaction.** `levelUpPlan` is pure and mutates nothing: it reads the SRD level
  table and reports what the level would do — hit points, proficiency bonus, new features with
  their text, slot changes, cantrips and spells known. `applyLevelUp` then commits, and
  `revertLevelUp` takes it back. Nothing is written until Confirm is pressed.
- ✅ **ASI levels come from the data, not a table.** `ability_score_bonuses` on the level rows is
  cumulative, so a level grants an ASI when its value exceeds the previous level's. That yields
  the published levels for every class — fighter `[4,6,8,12,14,16,19]`, rogue `[4,8,10,12,16,19]`,
  wizard `[4,8,12,16,19]` — and picks up homebrew classes for free.
- ✅ **Subclass level is derived too**, as the lowest level at which any subclass feature for that
  class appears: Cleric at 1, Warlock at 1, Fighter at 3, with no table to maintain.
- ✅ **Nothing is preselected.** An ASI level offers neither the ability path nor the feat path
  until one is chosen, and the level cannot be confirmed until 2 points are distributed. The
  brief's "never silently makes irreversible choices" is enforced by the validator, not by copy.
- ✅ **Multiclassing is warned about, never blocked.** Unmet prerequisites say exactly what is
  short ("normally requires CHA 13; this character has 10") and the level still commits, because
  the DM may have ruled otherwise.
- ✅ **Undo is a first-class action.** Each commit writes a `LevelUpRecord` stating the hit points,
  the ability increases, the choices made, and whether the level created the class. Undo reads the
  record rather than inferring anything, so a first level in a multiclass removes the class again.
- **Exit met:** verified in a browser, advancing a fighter 1→4 — hit points rolled and applied, a
  subclass demanded at 3, an ASI demanded at 4, then undone back to 3 with the ability layer gone.

**Found while building:** four bugs. Two in the engine: `revertLevelUp` originally inferred the
ability increase from a choice record that `applyLevelUp` never wrote, so an undone ASI stayed on
the sheet — the record now states the increases explicitly; and undo floored current HP at 1,
quietly reviving a character who had levelled up while at 0, which now floors at 0 since 0 is a
real state here (death saves).

Two more the browser pass caught that jsdom could not. **Every save blanked the sheet to a
spinner**, because `reload()` set the shared loading flag and the shell unmounted the whole tab
tree — taking the level-up confirmation, and any half-filled form on any other tab, with it. Only
a first load spins now; a refresh keeps the current view on screen. And committing a level left
the panel blank until the class picker was touched: `commit()` cleared the choices *after* the
reload had already seeded fresh ones for the next level, so the clear landed last. Both now have
regression tests at the jsdom level.

**Where randomness lives:** `src/engine/dice.ts`, and nowhere else. Everything else in `engine/`
stays pure and deterministic per `RULES_ENGINE.md` §1; `rollDie` takes an injectable generator so
tests can seed it, and `rollAbilityScore` now goes through it too.

### Phase 9 — Polish
- Responsive/touch passes on phone, tablet, desktop; table-usable contrast and hit targets.
- Accessibility audit; performance (virtualized lists, memoized derivation, bundle budget).
- Error/offline states; empty states; onboarding.

## 3. Assumptions

1. Single-user, local-first, no backend in v1; the model is sync-ready (`ARCHITECTURE.md` §6).
2. "Public" journal means *marked as shareable*; no sharing transport ships in v1.
3. Bundling the MIT-licensed SRD dataset is acceptable, with attribution.
4. Users may legally enter PHB content they own as custom content; the app ships none of it.
5. Modern evergreen browsers; no IE/legacy support.
6. 2014 rules only — no 2024 content, though the dataset is namespaced to allow it later.

## 4. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **SRD content gap** disappoints users expecting full PHB | High | Custom content in Phase 2; set expectations in onboarding; import/export so communities can share homebrew packs |
| **Effects layer is hand-authored** — unbounded scope | High | `prose-only` fallback means unencoded features degrade visibly, never silently; encode by frequency of use |
| Engine complexity (multiclassing, stacking) | Med | Contribution model + table-driven tests from Phase 0 |
| Dataset refresh changes an index and orphans references | Med | `ContentRef.name` snapshot; refresh shows a diff, never overwrites |
| IndexedDB eviction / private-browsing data loss | Med | Export prompts; `navigator.storage.persist()`; loud warning if persistence is denied |
| Rich text scope creep | Low | Constrained editor: headings, lists, bold/italic, links, images |
| Sprite animation scope creep | Low | Model is expansion-ready; v1 implements static + state switching only |

**Environment note:** this development sandbox blocks egress to `www.dnd5eapi.co` and
`api.open5e.com` (403 at the proxy). `github.com` is reachable, so the vendored-dataset approach
works here; the `HttpRulesSource` will need to be verified in an unrestricted environment.

## 5. Decisions (answered 2026-08-12)

1. **Homebrew: authoring UI *and* JSON import.** Phase 2 ships in-app create/duplicate/override
   forms plus an import/export format for community content packs. Confirms custom content as
   the largest single item in Phase 2.
2. **Sharing: marked + exportable flag.** No backend, no accounts in v1. Visibility stays a
   required, visually unmistakable field; public entries export for manual sharing. The sync-ready
   model (`ARCHITECTURE.md` §6) keeps a real shared view available later.
3. **Primary device: phone at the table.** Mobile-first layout designed natively, adapted upward
   to tablet and desktop.
4. **Visuals: character-driven theming.** A base design system whose accent/mood shifts per
   character. See `ARCHITECTURE.md` §8 for how this is constrained so it cannot break contrast.

### Remaining questions (non-blocking — proceeding on stated defaults)

5. **Sprite assets.** Format and availability unknown. *Default:* Phase 7 ships an importer
   accepting static images, animated GIF/WebP, and grid-based sprite sheets with a mapping editor.
6. **Multiclassing UI.** *Default:* the data model and engine support it from day one; the
   creation/level-up UI exposes it in Phase 8, not Phase 2.

## 6. Definition of done (every phase)

Typechecks clean · engine changes have tests · loading and error states exist · responsive at
360 px and 1440 px · keyboard navigable · no derived value persisted · no character data path
without an export escape hatch · docs in this repo updated to match reality.
