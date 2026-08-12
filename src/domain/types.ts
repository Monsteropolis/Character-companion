import type { AbilityId } from '../rules/schemas/primitives';

/**
 * Domain entities.
 *
 * Deliberately modelled rather than dumped into one blob: inventory, journal and notes grow
 * without bound over a campaign and need independent indexed queries, and rewriting a large
 * document to tick a checkbox is both slow and a corruption risk. See DATA_MODEL.md.
 */

/**
 * Fields carried by every persisted record.
 *
 * This is the complete set needed to add cloud sync later without touching feature code:
 * a client-generated UUID (autoincrement keys collide across devices), a timestamp for
 * last-write-wins, a tombstone so deletions can propagate, an owner slot for when accounts
 * exist, and a per-record schema version so migrations can be incremental.
 */
export interface Persisted {
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  ownerId: string | null;
  schemaVersion: number;
}

export type ContentSource = 'srd' | 'custom';

/**
 * A reference to rules content.
 *
 * `name` is denormalized on purpose. If a user deletes the homebrew subclass a character
 * depends on, the sheet must still render "Eldritch Knight" rather than a dangling id.
 * Resolution failure degrades to this snapshot; it never blanks the character.
 */
export interface ContentRef {
  source: ContentSource;
  index: string;
  name: string;
}

export type Alignment =
  | 'lawful-good' | 'neutral-good' | 'chaotic-good'
  | 'lawful-neutral' | 'neutral' | 'chaotic-neutral'
  | 'lawful-evil' | 'neutral-evil' | 'chaotic-evil';

export interface Identity {
  name: string;
  /** Free text, not an enum -- players use forms an enum would exclude. */
  pronouns: string;
  alignment: Alignment | null;
  description: string;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  backstory: string;
}

export interface ClassEntry {
  classRef: ContentRef;
  subclassRef: ContentRef | null;
  level: number;
  hitDiceSpent: number;
  /**
   * The HP gained at each level-up, stored per level rather than as a total, so max HP stays a
   * reproducible function of its inputs and does not drift when CON changes.
   */
  hitPointRolls: number[];
}

export type AbilityScoreMethod = 'standard-array' | 'point-buy' | 'manual' | 'rolled';

/**
 * Ability scores are layered rather than flattened to one number.
 *
 * A flat score makes "why is my Strength 17?" unanswerable, and makes removing a racial bonus
 * on a race change impossible without corrupting the user's own input.
 */
export interface AbilityScoreBlock {
  base: Record<AbilityId, number>;
  method: AbilityScoreMethod;
  racial: Record<AbilityId, number>;
  asi: Record<AbilityId, number>;
  misc: Record<AbilityId, number>;
  /** Raw manual set, no label. The escape hatch of last resort; wins over everything. */
  override: Partial<Record<AbilityId, number>>;
}

/**
 * A labelled change to an ability score.
 *
 * Scores move constantly in play -- a Belt of Giant Strength sets one permanently, Bear's
 * Endurance raises one for an hour, a curse drops one until it is lifted. Modelling these as
 * tracked, reversible entries rather than edits to the base score is what lets a player undo
 * "the spell ended" without having to remember what the number used to be.
 */
export interface AbilityAdjustment {
  id: string;
  ability: AbilityId;
  /** 'bonus' adds to the total; 'set' replaces it unless the score is already higher. */
  kind: 'bonus' | 'set';
  value: number;
  /** Temporary adjustments are visually separated and cleared in a single action. */
  duration: 'permanent' | 'temporary';
  label: string;
  note: string;
  createdAt: number;
}

/**
 * Manual overrides for derived statistics.
 *
 * DMs break rules constantly, and an app that insists on its own arithmetic gets abandoned.
 * Every one of these is null by default, so an override is always a deliberate act and the
 * sheet shows plainly when a number is no longer computed.
 */
export interface StatOverrides {
  armorClass: number | null;
  initiative: number | null;
  speed: number | null;
  proficiencyBonus: number | null;
  passivePerception: number | null;
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
}

export type RestType = 'short' | 'long' | 'none';

export interface UsagePool {
  used: number;
  max: number;
  resetOn: RestType;
}

export interface ResourceState {
  currentHp: number;
  tempHp: number;
  /** Never fight the DM: a flat override always wins over the computed maximum. */
  maxHpOverride: number | null;
  deathSaves: { successes: number; failures: number };
  exhaustion: number;
  conditions: ContentRef[];
  usages: Record<string, UsagePool>;
  spellSlots: Record<number, { used: number; total: number }>;
  concentratingOn: string | null;
}

export type PreparationMode = 'known' | 'prepared' | 'spellbook';

export interface SpellSelection {
  ref: ContentRef;
  prepared: boolean;
  /** Domain and oath spells do not count against the prepared limit. */
  alwaysPrepared: boolean;
  source: 'class' | 'subclass' | 'race' | 'item' | 'custom';
}

export interface SpellcastingEntry {
  classRef: ContentRef;
  ability: AbilityId;
  preparation: PreparationMode;
  known: SpellSelection[];
  ritualCasting: boolean;
}

export interface SpellcastingState {
  entries: SpellcastingEntry[];
}

export type CurrencyId = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
export type Currency = Record<CurrencyId, number>;

/**
 * A recorded player decision, tagged with what offered it.
 *
 * This is what makes the wizard non-destructive and level-ups reversible: changing race at
 * step 2 retracts the choices whose `source` is 'race', without touching the user's typed
 * backstory or their class skill picks.
 */
export interface ChoiceRecord {
  id: string;
  source: 'race' | 'subrace' | 'class' | 'subclass' | 'background' | 'level-up' | 'feat';
  sourceRef: ContentRef;
  atLevel: number;
  choiceKey: string;
  selected: ContentRef[];
}

export interface ProficiencyGrant {
  ref: ContentRef;
  /** Where it came from, so retracting a race or class removes exactly its own grants. */
  from: ChoiceRecord['source'] | 'manual';
  expertise: boolean;
}

export interface CustomFeature {
  id: string;
  name: string;
  description: string;
  source: string;
  effects: RuleEffect[];
}

export interface Character extends Persisted {
  identity: Identity;
  /** An array from day one -- multiclassing is not something to retrofit. */
  classes: ClassEntry[];
  race: { raceRef: ContentRef | null; subraceRef: ContentRef | null };
  background: { ref: ContentRef | null; feature: { name: string; desc: string[] } | null };
  abilityScores: AbilityScoreBlock;
  /** Labelled, reversible ability changes from play. See `AbilityAdjustment`. */
  abilityAdjustments: AbilityAdjustment[];
  /** Manual overrides for derived statistics. */
  statOverrides: StatOverrides;
  proficiencies: ProficiencyGrant[];
  resources: ResourceState;
  spellcasting: SpellcastingState | null;
  currency: Currency;
  portraitId: string | null;
  /** Curated visual mood; see ARCHITECTURE.md §7. Never a free colour picker. */
  mood: string;
  choices: ChoiceRecord[];
  customFeatures: CustomFeature[];
  xp: number;
  archived: boolean;
  notes: string;
}

export type ItemCategory =
  | 'weapon' | 'armor' | 'consumable' | 'tool' | 'quest' | 'treasure' | 'misc';

export interface InventoryItem extends Persisted {
  characterId: string;
  /** null means a fully custom item with no rules-content counterpart. */
  ref: ContentRef | null;
  name: string;
  category: ItemCategory;
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
  /** Item mechanics travel with the item, so homebrew flows through the same AC pipeline. */
  effects: RuleEffect[];
  /** Bags of holding and DM fiat. */
  weightless: boolean;
  /**
   * Mechanical stats copied from rules content when the item enters the inventory.
   *
   * Snapshotting rather than looking up keeps a weapon working if its rules entry is later
   * edited or deleted, and is what lets a fully custom item behave identically to an SRD one.
   */
  armor: ArmorMeta | null;
  weapon: WeaponMeta | null;
}

export interface ArmorMeta {
  base: number;
  dexBonus: boolean;
  /** null means uncapped (light armour); medium armour caps at 2. */
  maxDex: number | null;
  strMinimum: number;
  stealthDisadvantage: boolean;
  isShield: boolean;
}

export interface WeaponMeta {
  damageDice: string;
  damageType: string;
  versatileDice: string | null;
  ranged: boolean;
  properties: string[];
  /** e.g. 'martial-weapons', used to check category proficiency. */
  categoryProficiency: string;
  rangeNormal: number | null;
  rangeLong: number | null;
}

export type NoteKind =
  | 'npc' | 'location' | 'quest' | 'faction' | 'secret' | 'goal' | 'relationship';

export type Visibility = 'public' | 'private';

export interface EntityLink {
  kind: NoteKind;
  noteId: string;
}

export interface JournalEntry extends Persisted {
  characterId: string;
  /** Required, never defaulted -- leaking private notes is the worst failure this app has. */
  visibility: Visibility;
  title: string;
  body: string;
  realDate: number;
  /** Free text: fantasy calendars are not ISO dates. */
  inGameDate: string | null;
  sessionNumber: number | null;
  tags: string[];
  imageAssetIds: string[];
  links: EntityLink[];
}

export interface Note extends Persisted {
  characterId: string;
  kind: NoteKind;
  name: string;
  body: string;
  visibility: Visibility;
  links: EntityLink[];
  meta: Record<string, string>;
}

export type CustomContentKind =
  | 'race' | 'subrace' | 'class' | 'subclass' | 'background'
  | 'feat' | 'spell' | 'item' | 'feature' | 'trait';

export interface CustomContent extends Persisted {
  kind: CustomContentKind;
  name: string;
  /** null means from scratch; set means override/variant of existing content. */
  basedOn: ContentRef | null;
  /** The rules document, shaped exactly like its SRD counterpart. */
  payload: unknown;
  effects: RuleEffect[];
  /**
   * The authoring form that produced `payload`.
   *
   * Kept so editing reloads the fields the author filled in, rather than making them
   * reconstruct their entry from the generated document.
   */
  form?: unknown;
}

export interface StoredAsset extends Persisted {
  characterId: string | null;
  kind: 'portrait' | 'sprite' | 'journal-image' | 'item-icon';
  mimeType: string;
  blob: Blob;
  width: number | null;
  height: number | null;
}

/**
 * A character portrait: a still image, an animated image, or a sprite sheet.
 *
 * Modelled for expansion per the brief. `states` may be empty and is never assumed complete --
 * no character has every animation, so every lookup resolves through a fallback chain
 * (see `engine/sprites.ts`).
 */
export interface PortraitAsset extends Persisted {
  characterId: string;
  kind: 'static' | 'animated-image' | 'spritesheet';
  /** The stored image blob this portrait renders from. */
  blobId: string;
  name: string;
  spritesheet: SpritesheetMeta | null;
  states: AnimationState[];
  /** Usually 'idle'. Falls back to the first state when absent. */
  defaultState: string;
  emotes: EmoteBinding[];
}

export interface SpritesheetMeta {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  /** Frames actually present; a sheet's last row is often partial. */
  frameCount: number;
}

export interface AnimationState {
  /** idle | happy | angry | sad | hurt | surprised | laugh | attack | celebrate | sleep | custom */
  name: string;
  frames: number[];
  fps: number;
  loop: boolean;
  /** Per-state image, for portraits that use separate files rather than one sheet. */
  blobId: string | null;
}

export interface EmoteBinding {
  emote: string;
  /**
   * Composable and ordered.
   *
   * This is what makes the emote system future-proof: a static portrait resolves an emote to
   * a bubble plus a pulse today, and the same binding gains an `animation` entry once a sprite
   * sheet is uploaded -- with no schema change and no data migration.
   */
  presentation: EmotePresentation[];
}

export type Anchor = 'top' | 'bottom' | 'left' | 'right' | 'center';

export type EmotePresentation =
  | { type: 'animation'; state: string }
  | { type: 'alt-portrait'; blobId: string }
  | { type: 'overlay'; blobId: string; anchor: Anchor }
  | { type: 'vfx'; effect: string }
  | { type: 'bubble'; text: string }
  | { type: 'shake'; params: Record<string, number | string> }
  | { type: 'pulse'; params: Record<string, number | string> }
  | { type: 'tint'; params: Record<string, number | string> };

export interface LevelUpRecord extends Persisted {
  characterId: string;
  classIndex: string;
  level: number;
  hpGained: number;
  hpMethod: 'roll' | 'average' | 'manual';
  choices: ChoiceRecord[];
}

/**
 * Machine-readable feature effects.
 *
 * SRD features are prose only, so this union is the hand-authored bridge that lets the engine
 * compute anything feature-driven. `prose-only` is a first-class member: a feature we cannot
 * model is tagged as such and still rendered, rather than silently doing nothing.
 */
export type RuleEffect =
  | { t: 'ability-bonus'; ability: AbilityId; value: number }
  | { t: 'ac-formula'; base: number; adds: AbilityId[]; allowShield: boolean; requiresNoArmor: boolean; label: string }
  | { t: 'ac-bonus'; value: number }
  | { t: 'proficiency'; ref: ContentRef }
  | { t: 'expertise'; skill: string }
  | { t: 'speed'; mode: 'walk' | 'fly' | 'swim' | 'climb'; value: number; op: 'set' | 'add' }
  | { t: 'resource'; key: string; max: number; resetOn: RestType }
  | { t: 'damage-rider'; appliesTo: string; dice: string; damageType: string }
  | { t: 'attack-bonus'; appliesTo: string; value: number }
  | { t: 'save-advantage'; against: string }
  | { t: 'resistance'; damageType: string }
  | { t: 'carry-multiplier'; value: number }
  | { t: 'max-hp-per-level'; value: number }
  | { t: 'initiative-bonus'; value: number }
  | { t: 'prose-only'; summary: string };
