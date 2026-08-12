# Data Model

Status: **proposed**. Types are illustrative TypeScript, not yet implemented.

## 1. The three-source rule

Every piece of content in the app comes from exactly one of three origins, and the model makes
this explicit rather than leaving it implied:

| Origin | Owner | Mutable by user | Stored |
|---|---|---|---|
| **Rules** (SRD) | Upstream | No | Bundled / IndexedDB cache |
| **Character** | User | Yes | IndexedDB, per-entity tables |
| **Custom** (homebrew) | User | Yes | IndexedDB, `customContent` |

They are joined by a single reference type used everywhere content is cited:

```ts
type ContentSource = 'srd' | 'custom';

interface ContentRef {
  source: ContentSource;
  index: string;            // 'wizard' | 'custom:8f2a-...'
  name: string;             // denormalized snapshot — survives source removal
}
```

`name` is deliberately denormalized. If a user deletes the homebrew subclass a character
depends on, the sheet must still render "Eldritch Knight" rather than a dangling id. **Resolution
failure degrades to the snapshot; it never blanks the character.** The UI marks `source:
'custom'` content with a distinct badge everywhere it appears.

## 2. Persistence layout (Dexie)

Deliberately normalized — the character is *not* one JSON blob. Inventory, journal, and notes
grow without bound during a campaign and need independent indexed queries; rewriting a 2 MB
document to tick a checkbox is both slow and a corruption risk.

```
characters        id, *archived, updatedAt
inventoryItems    id, characterId, [characterId+category], equipped
journalEntries    id, characterId, [characterId+visibility], sessionNumber, *tags
notes             id, characterId, [characterId+kind]
customContent     id, kind, name
assets            id, characterId          // portrait/sprite blobs
levelUpRecords    id, characterId, level
appMeta           key                      // datasetVersion, schemaVersion
```

The `Character` record itself stays small: identity, ability scores, class/race refs, resource
pools, and choice records. Everything unbounded is a child table.

Every record extends:

```ts
interface Persisted {
  id: string;              // UUID
  updatedAt: number;
  deletedAt: number | null; // tombstone
  ownerId: string | null;
  schemaVersion: number;
}
```

## 3. Core character entity

```ts
interface Character extends Persisted {
  identity: Identity;
  classes: ClassEntry[];          // array from day one — multiclassing is not a retrofit
  race: RaceSelection;
  background: BackgroundSelection;
  abilityScores: AbilityScoreBlock;
  proficiencies: ProficiencyGrant[];
  resources: ResourceState;
  spellcasting: SpellcastingState | null;
  currency: Currency;
  portraitId: string | null;
  choices: ChoiceRecord[];        // the audit log — see §4
  customFeatures: CustomFeature[];
  xp: number;
}

interface Identity {
  name: string;
  pronouns: string;               // free text, not an enum
  alignment: Alignment | null;
  description: string;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  backstory: string;
}

interface ClassEntry {
  classRef: ContentRef;
  subclassRef: ContentRef | null;
  level: number;
  hitDiceSpent: number;
  hitPointRolls: number[];        // per level-up, so HP is reproducible not just a total
}

interface AbilityScoreBlock {
  base:  Record<AbilityId, number>;   // as generated (array/point-buy/roll/manual)
  method: 'standard-array' | 'point-buy' | 'manual' | 'rolled';
  racial: Record<AbilityId, number>;  // resolved racial bonuses incl. chosen ones
  asi:    Record<AbilityId, number>;  // accumulated from level-ups
  misc:   Record<AbilityId, number>;  // items, homebrew
  override: Partial<Record<AbilityId, number>>; // manual escape hatch (e.g. belt of giant str)
}
```

Ability scores are **layered rather than flattened to a single number**. A flattened score makes
"why is my Strength 17?" unanswerable and makes removing a racial bonus (on a race change)
impossible without corrupting user input. Layering also gives the sheet a free tooltip breakdown.

`hitPointRolls` is stored per level for the same reason: max HP becomes a reproducible function
of its inputs rather than an opaque integer that drifts when CON changes.

```ts
interface ResourceState {
  currentHp: number;
  tempHp: number;
  maxHpOverride: number | null;        // never fight the user's DM
  deathSaves: { successes: number; failures: number };
  exhaustion: number;                   // 0–6
  conditions: ContentRef[];
  usages: Record<string, UsagePool>;    // featureIndex -> { used, max, resetOn }
  spellSlots: Record<number, { used: number; total: number }>;
  concentratingOn: string | null;       // spell instance id
}
```

`maxHpOverride` embodies a general principle: **every derived value has a manual override.** DMs
break rules constantly, and an app that refuses to represent the table's actual state gets
abandoned.

## 4. Choices as first-class records

```ts
interface ChoiceRecord {
  id: string;
  source: 'race' | 'class' | 'subclass' | 'background' | 'level-up' | 'feat';
  sourceRef: ContentRef;
  atLevel: number;
  choiceKey: string;              // 'fighter:skills'
  selected: ContentRef[];
}
```

This is what makes the wizard non-destructive and level-ups reversible. Because every selection
is a record tagged with its origin, changing race at step 2 means *retracting the choices whose
`source` is `race`* — cleanly, without touching the user's typed backstory or their class skill
picks. Without this, a back-navigation is either lossy or requires ad-hoc undo logic per step.

It also directly satisfies "do not silently make irreversible choices": the app can always show
what was chosen, when, and why it was offered.

## 5. Inventory

```ts
interface InventoryItem extends Persisted {
  characterId: string;
  ref: ContentRef | null;         // null ⇒ fully custom item
  name: string;
  category: 'weapon'|'armor'|'consumable'|'tool'|'quest'|'treasure'|'misc';
  quantity: number;
  weight: number;
  value: Currency;
  description: string;
  iconAssetId: string | null;
  equipped: boolean;
  attuned: boolean;
  magical: boolean;
  charges: { current: number; max: number; resetOn: RestType } | null;
  notes: string;
  effects: RuleEffect[];          // how equipping changes the sheet
  weightless: boolean;            // bag of holding, DM fiat
}

type Currency = Record<'cp'|'sp'|'ep'|'gp'|'pp', number>;
```

Item mechanics travel with the item as `RuleEffect[]`, so armor from the SRD and a homebrew
`+1 Cloak of Protection` flow through *the same* AC pipeline. No special-casing in the UI.

## 6. Spellcasting

```ts
interface SpellcastingState {
  entries: SpellcastingEntry[];   // one per casting class
}

interface SpellcastingEntry {
  classRef: ContentRef;
  ability: AbilityId;
  preparation: 'known' | 'prepared' | 'spellbook';
  known: SpellSelection[];
  ritualCasting: boolean;
}

interface SpellSelection {
  ref: ContentRef;
  prepared: boolean;
  alwaysPrepared: boolean;        // domain/oath spells don't count against the limit
  source: 'class' | 'subclass' | 'race' | 'item' | 'custom';
}
```

Modelling *why* a spell is known (`source`, `alwaysPrepared`) is what allows a correct
prepared-count and prevents the classic bug of domain spells eating a cleric's preparations.

## 7. Journal & notes

```ts
interface JournalEntry extends Persisted {
  characterId: string;
  visibility: 'public' | 'private';   // required — never defaulted implicitly
  title: string;
  body: RichTextDoc;
  realDate: number;
  inGameDate: string | null;          // free text; fantasy calendars aren't ISO dates
  sessionNumber: number | null;
  tags: string[];
  imageAssetIds: string[];
  links: EntityLink[];
}

interface EntityLink { kind: NoteKind; noteId: string; }

type NoteKind = 'npc'|'location'|'quest'|'faction'|'secret'|'goal'|'relationship';

interface Note extends Persisted {
  characterId: string;
  kind: NoteKind;
  name: string;
  body: RichTextDoc;
  visibility: 'public' | 'private';
  links: EntityLink[];
  meta: Record<string, string>;   // kind-specific: quest status, NPC attitude…
}
```

Notes are **entities with typed links from the start**, not a flat text field — the brief calls
for eventual interconnection, and retrofitting graph structure onto free text is not feasible.
`EntityLink` is the seed of that graph; a backlinks panel is then nearly free.

**Visibility is a required field with no default.** Accidentally exposing private player notes
to a shared DM view is the worst failure this app can have, so the type system refuses to let a
caller forget. UI reinforces it with persistent colour/iconography, not a subtle toggle.

## 8. Portraits, sprites, emotes

Designed for expansion, per the brief — the v1 renderer will implement static portraits and
simple state switching, but the *model* accommodates the rest without migration.

```ts
interface PortraitAsset extends Persisted {
  characterId: string;
  kind: 'static' | 'animated-image' | 'spritesheet';
  blobId: string;
  spritesheet: SpritesheetMeta | null;
  states: AnimationState[];      // may be empty — never assume completeness
  defaultState: string;          // usually 'idle'
}

interface AnimationState {
  name: string;                  // idle|happy|angry|sad|hurt|surprised|laugh|attack|…
  frames: number[];
  fps: number;
  loop: boolean;
  blobId: string | null;         // per-state image, for non-spritesheet portraits
}

interface EmoteBinding {
  emote: string;
  presentation: EmotePresentation[];   // composable, ordered
}

type EmotePresentation =
  | { type: 'animation'; state: string }
  | { type: 'alt-portrait'; blobId: string }
  | { type: 'overlay'; blobId: string; anchor: Anchor }
  | { type: 'vfx'; effect: string }
  | { type: 'bubble'; text: string }
  | { type: 'shake' | 'pulse' | 'tint'; params: Record<string, number|string> };
```

`EmotePresentation` being a **composable array** is what makes the system future-proof: a static
portrait today resolves an emote to `[{bubble}, {pulse}]`, and the same binding later gains
`{animation}` when the user uploads a sprite sheet — with no schema change. The renderer walks a
**fallback chain** (requested state → default state → static portrait → initials placeholder),
which is how "not every character has every animation" is honoured structurally rather than by
convention.

## 9. Custom content

```ts
interface CustomContent extends Persisted {
  kind: 'race'|'subrace'|'class'|'subclass'|'background'|'feat'|'spell'|'item'|'feature'|'trait';
  name: string;
  basedOn: ContentRef | null;     // null ⇒ from scratch; set ⇒ override/variant
  payload: unknown;               // validated by the same Zod schema as its SRD counterpart
  effects: RuleEffect[];
}
```

Homebrew is validated against **the same schemas as SRD content**, so it is structurally
indistinguishable to the engine and works everywhere official content works — including the
creation wizard's dropdowns. `basedOn` supports the "duplicate Champion, rename, tweak" flow,
which is how most users will actually author the missing PHB subclasses.

## 10. Migrations

`schemaVersion` is stored per record. A migration runner applies ordered, pure
`(old) => new` functions on read. Before any migration touches data, the app writes an
automatic pre-migration JSON export. Character data is irreplaceable and migrations are the
likeliest place to destroy it.
