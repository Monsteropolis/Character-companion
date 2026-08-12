# Implementation Plan

**Living document.** Updated as phases complete. Last updated: 2026-08-12.

Current status: **Phase 0 — architecture review complete, awaiting answers to §5 before coding.**

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

### Phase 0 — Rules foundation
- Vite + TS strict + Tailwind + tokens; lint rule banning React imports under `engine/`.
- Vendor `5e-bits/5e-database` `src/2014/en` (MIT); attribution + SRD notice.
- Zod schemas for all 25 collections; validation report over the full dataset.
- `RulesSource` + `BundledRulesSource`; code-split loaders.
- Engine primitives: modifiers, proficiency, `Contribution`/`DerivedValue` plumbing.
- **Exit:** every SRD record validates or is explicitly quarantined; primitives fully tested.

### Phase 1 — Shell & persistence
- Routing, app shell, error boundaries, loading/empty states.
- Dexie schema + repositories + migration runner + pre-migration auto-export.
- Character gallery: create, duplicate, archive, delete-with-confirm, fast switching.
- Full JSON export/import (character + custom content + assets).
- `HttpRulesSource` + `CompositeRulesSource` behind config.
- **Exit:** characters persist across reloads; a character round-trips through export/import intact.

### Phase 2 — Creation wizard + custom content
- Nine steps per the brief; resumable draft; non-destructive back-navigation via `ChoiceRecord`.
- `resolveChoice()` covering every `option_type` incl. nested `multiple` and `equipment_category`.
- All four ability-score methods with live derived preview.
- Custom content manager: create/duplicate/override for race, subclass, background, feat, spell,
  item, feature — validated by the SRD schemas, selectable inside the wizard.
- Final review showing every calculated stat.
- **Exit:** a level-1 SRD character *and* a homebrew-subclass character both complete and persist.

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

## 5. Open questions

Blocking questions are marked ⚠ — they change architecture, not just styling.

1. ⚠ **Homebrew strategy.** Given the SRD gap, should Phase 2 ship (a) a full homebrew authoring
   UI, (b) a JSON import format for community content packs, or (c) both? This sets Phase 2 scope
   substantially.
2. ⚠ **Sharing.** Does "public journal" need a real DM-facing view (implying a backend and
   accounts sooner), or is a marked-and-exportable flag sufficient for v1?
3. **Primary device.** Phone at the table, tablet, or desktop first? Decides which layout gets
   designed first rather than adapted.
4. **Sprite assets.** Do you have sprite sheets/animation states already, and in what format?
   Determines whether Phase 7 needs an importer or an authoring tool.
5. **Multiclassing in v1?** The model supports it from day one; the question is whether the
   *creation and level-up UI* must expose it in v1 or can defer.
6. **Visual direction.** How far toward "atmospheric" — a restrained dark parchment/ink system,
   or something heavier with texture and ornament?

## 6. Definition of done (every phase)

Typechecks clean · engine changes have tests · loading and error states exist · responsive at
360 px and 1440 px · keyboard navigable · no derived value persisted · no character data path
without an export escape hatch · docs in this repo updated to match reality.
