import type { NoteKind } from '../../domain/types';

/**
 * The campaign entity types.
 *
 * Typed from the start rather than a single "notes" bucket, because a quest needs a status and
 * an NPC needs an attitude, and because links between them are what make the journal navigable
 * later. Each kind carries a small set of structured fields alongside its prose.
 */

export const NOTE_KINDS: NoteKind[] = [
  'npc', 'location', 'quest', 'faction', 'secret', 'goal', 'relationship',
];

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  npc: 'NPC',
  location: 'Location',
  quest: 'Quest',
  faction: 'Faction',
  secret: 'Secret',
  goal: 'Goal',
  relationship: 'Relationship',
};

export const NOTE_KIND_PLURALS: Record<NoteKind, string> = {
  npc: 'NPCs',
  location: 'Locations',
  quest: 'Quests',
  faction: 'Factions',
  secret: 'Secrets',
  goal: 'Goals',
  relationship: 'Relationships',
};

export const NOTE_KIND_ICONS: Record<NoteKind, string> = {
  npc: '👤',
  location: '📍',
  quest: '📜',
  faction: '⚔️',
  secret: '🤫',
  goal: '🎯',
  relationship: '🤝',
};

export interface MetaField {
  key: string;
  label: string;
  options?: string[];
  placeholder?: string;
}

/** Structured fields per kind. Kept short: anything longer belongs in the body. */
export const NOTE_META_FIELDS: Record<NoteKind, MetaField[]> = {
  npc: [
    { key: 'attitude', label: 'Attitude', options: ['Unknown', 'Friendly', 'Neutral', 'Hostile'] },
    { key: 'location', label: 'Usually found', placeholder: 'e.g. The Rusty Anchor' },
    { key: 'role', label: 'Role', placeholder: 'e.g. Harbourmaster' },
  ],
  location: [
    { key: 'region', label: 'Region', placeholder: 'e.g. The Sword Coast' },
    { key: 'visited', label: 'Visited', options: ['No', 'Yes'] },
  ],
  quest: [
    {
      key: 'status',
      label: 'Status',
      options: ['Not started', 'Active', 'On hold', 'Completed', 'Failed'],
    },
    { key: 'giver', label: 'Given by', placeholder: 'Who asked you?' },
    { key: 'reward', label: 'Reward', placeholder: 'e.g. 200 gp' },
  ],
  faction: [
    {
      key: 'standing',
      label: 'Standing',
      options: ['Unknown', 'Allied', 'Friendly', 'Neutral', 'Unfriendly', 'Enemy'],
    },
  ],
  secret: [
    { key: 'knownBy', label: 'Known by', placeholder: 'Who else knows?' },
  ],
  goal: [
    { key: 'status', label: 'Status', options: ['Open', 'In progress', 'Achieved', 'Abandoned'] },
  ],
  relationship: [
    {
      key: 'bond',
      label: 'Bond',
      options: ['Unknown', 'Close', 'Warm', 'Complicated', 'Strained', 'Broken'],
    },
    { key: 'who', label: 'With', placeholder: 'Name' },
  ],
};

/**
 * Secrets default to private.
 *
 * Every other kind defaults to shareable, since notes about NPCs and locations are usually the
 * party's shared knowledge. A secret that defaulted to shareable would be the single worst
 * default in the app.
 */
export function defaultVisibilityFor(kind: NoteKind): 'public' | 'private' {
  return kind === 'secret' ? 'private' : 'public';
}
