# Implementation Plan

**Living document.** Updated as phases complete. Last updated: 2026-08-12.

Current status: **Phases 0–2 complete. Phase 3 (character dashboard) is next.**

| Phase | State |
|---|---|
| 0 — Rules foundation | ✅ complete |
| 1 — Shell & persistence | ✅ complete |
| 2 — Creation wizard + custom content | ✅ complete |
| 3 — Dashboard | ⬜ next |
| 4–9 | ⬜ |

277 tests passing; typecheck and production build clean. Creation verified
end-to-end in a real browser.

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

### Phase 3 — Dashboard
- Play Bar (portrait, HP, AC, conditions, emote) persistent across tabs.
- Identity panel with portrait as a major visual element; core stats; skills.
- Combat: HP/temp HP/damage/heal, death saves, hit dice, conditions, exhaustion, short/long rest.
- Attacks & actions cards; features & traits, searchable and collapsible.
- Effects registry: level-1 mechanical features.
- **Exit:** a full session is playable from the sheet; every derived stat shows its breakdown.

### Phase 4 — Inventory & equipment
- Categories, currency (cp/sp/ep/gp/pp), attunement (3-item cap warning), charges, custom items.
- Equipping routes item `RuleEffect`s into AC/attacks/speed.
- Encumbrance and carrying capacity.
- **Exit:** equipping armor/shield/magic items visibly and correctly moves the sheet's numbers.

### Phase 5 — Abilities & spellcasting
- Spellbook: cantrips + levels 1–9, known/prepared/spellbook modes, rituals, concentration.
- Slots with use/restore; upcasting via `damage_at_slot_level`; save DC and attack bonus.
- Filter and search across school, level, class, casting time, concentration, ritual.
- **Exit:** a level-5 Wizard and a Cleric both prepare and cast correctly; slots restore on rest.

### Phase 6 — Journal & notes
- Rich text; **public/private required at creation**, visually unmistakable.
- Tags, session numbers, in-game dates, images, search, chronological browsing.
- Typed notes (NPC/location/quest/faction/secret/goal/relationship) with `EntityLink` + backlinks.
- **Exit:** entries and notes cross-link; privacy is never ambiguous in the UI.

### Phase 7 — Portraits & emotes
- Upload/crop; static, GIF/WebP, and sprite sheets; client-side resize before blob storage.
- Named animation states with the fallback chain; emote bar with composable presentations.
- Respects `prefers-reduced-motion`.
- **Exit:** a static-portrait character and a sprite-sheet character both emote sensibly.

### Phase 8 — Leveling
- `levelUpPlan` flow: HP mode, ASI vs feat, subclass at the right level, new spells, expertise.
- `LevelUpRecord` history; reversible; nothing committed until confirmed.
- **Exit:** a character advances 1→5 with every choice explicit and auditable.

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
