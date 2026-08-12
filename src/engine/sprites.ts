import type { AnimationState, EmotePresentation, PortraitAsset } from '../domain/types';

/**
 * Sprite sheet and animation resolution.
 *
 * Pure geometry and lookup, kept out of the renderer so the awkward parts -- frame positions,
 * fallback chains, emote resolution -- are testable without painting anything.
 *
 * The central design constraint from the brief is that no character has every animation. So
 * every lookup here resolves through a FALLBACK CHAIN and always returns something renderable:
 * requested state, then the default state, then the first state, then the static image, then an
 * initials placeholder. A missing state is never an error and never a blank frame.
 */

export interface SpritesheetMeta {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  /** Frames actually present; the last row of a sheet is often partial. */
  frameCount: number;
}

export interface FramePosition {
  /** CSS background-position values, in pixels, for the frame. */
  x: number;
  y: number;
  column: number;
  row: number;
}

/** Where a frame sits on the sheet. Out-of-range indices clamp rather than throw. */
export function framePosition(meta: SpritesheetMeta, frameIndex: number): FramePosition {
  const columns = Math.max(1, meta.columns);
  const total = Math.max(1, meta.frameCount);
  const index = Math.min(Math.max(0, Math.floor(frameIndex)), total - 1);

  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    column,
    row,
    // Negative offsets: the sheet is shifted under a frame-sized window.
    x: -column * meta.frameWidth,
    y: -row * meta.frameHeight,
  };
}

/** Derives sheet geometry from image size and a frame count, the usual authoring input. */
export function deriveMeta(
  imageWidth: number,
  imageHeight: number,
  columns: number,
  rows: number,
  frameCount?: number,
): SpritesheetMeta {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  return {
    frameWidth: Math.floor(imageWidth / safeColumns),
    frameHeight: Math.floor(imageHeight / safeRows),
    columns: safeColumns,
    rows: safeRows,
    frameCount: Math.max(1, Math.floor(frameCount ?? safeColumns * safeRows)),
  };
}

/** Frame indices for a contiguous run, the common case when mapping a row to a state. */
export function frameRange(start: number, count: number): number[] {
  const from = Math.max(0, Math.floor(start));
  const length = Math.max(0, Math.floor(count));
  return Array.from({ length }, (_, i) => from + i);
}

/**
 * Resolve which animation state should play.
 *
 * Never returns null when the portrait has any state at all -- that is the whole point of the
 * chain. Callers that get null know to fall back to a still image.
 */
export function resolveState(
  portrait: Pick<PortraitAsset, 'states' | 'defaultState'>,
  requested: string | null,
): AnimationState | null {
  const states = portrait.states ?? [];
  if (states.length === 0) return null;

  if (requested) {
    const exact = states.find((s) => s.name === requested);
    if (exact) return exact;
  }

  const fallback = states.find((s) => s.name === portrait.defaultState);
  return fallback ?? states[0] ?? null;
}

/** True when the portrait can actually play the named state, for enabling emote buttons. */
export function hasState(
  portrait: Pick<PortraitAsset, 'states'> | null,
  name: string,
): boolean {
  return (portrait?.states ?? []).some((s) => s.name === name);
}

/**
 * The frame to show at a point in time.
 *
 * Non-looping animations hold their final frame rather than snapping back, which is what makes
 * a one-shot emote read as finished instead of glitched.
 */
export function frameAt(state: AnimationState, elapsedMs: number): number {
  const frames = state.frames.length > 0 ? state.frames : [0];
  const fps = state.fps > 0 ? state.fps : 1;
  const frameDuration = 1000 / fps;
  const index = Math.floor(Math.max(0, elapsedMs) / frameDuration);

  if (state.loop) return frames[index % frames.length] ?? frames[0]!;
  return frames[Math.min(index, frames.length - 1)] ?? frames[0]!;
}

/** Total run time of one pass, used to schedule a return to idle after an emote. */
export function stateDurationMs(state: AnimationState): number {
  const fps = state.fps > 0 ? state.fps : 1;
  return (state.frames.length || 1) * (1000 / fps);
}

/**
 * The standard emote vocabulary.
 *
 * A fixed list so bindings are portable between characters and sprite packs, with room for
 * custom entries alongside.
 */
export const STANDARD_EMOTES = [
  'happy', 'angry', 'sad', 'shocked', 'laugh',
  'hurt', 'confused', 'celebrate', 'disapprove',
] as const;

export type StandardEmote = (typeof STANDARD_EMOTES)[number];

export const EMOTE_LABELS: Record<string, string> = {
  idle: 'Idle',
  happy: 'Happy',
  angry: 'Angry',
  sad: 'Sad',
  shocked: 'Shocked',
  laugh: 'Laugh',
  hurt: 'Hurt',
  confused: 'Confused',
  celebrate: 'Celebrate',
  disapprove: 'Disapprove',
  surprised: 'Surprised',
  attack: 'Attack',
  sleep: 'Sleep',
};

export const EMOTE_ICONS: Record<string, string> = {
  happy: '😄',
  angry: '😠',
  sad: '😢',
  shocked: '😲',
  laugh: '😂',
  hurt: '🤕',
  confused: '😕',
  celebrate: '🎉',
  disapprove: '😒',
  idle: '🙂',
};

/**
 * What playing an emote should actually do.
 *
 * Resolution order matters and is the mechanism behind "design so a static portrait could
 * eventually animate": an explicit binding wins; otherwise a matching animation state is used if
 * the sprite has one; otherwise it degrades to a text bubble plus a pulse, which every portrait
 * can do. The same emote therefore works on a static JPEG today and on a sprite sheet tomorrow
 * with no data migration.
 */
export function resolveEmote(
  portrait: Pick<PortraitAsset, 'states' | 'defaultState'> | null,
  bindings: { emote: string; presentation: EmotePresentation[] }[],
  emote: string,
): EmotePresentation[] {
  const explicit = bindings.find((b) => b.emote === emote);
  if (explicit && explicit.presentation.length > 0) return explicit.presentation;

  if (portrait && hasState(portrait, emote)) {
    return [{ type: 'animation', state: emote }];
  }

  return [
    { type: 'bubble', text: EMOTE_ICONS[emote] ?? EMOTE_LABELS[emote] ?? emote },
    { type: 'pulse', params: { scale: 1.06, durationMs: 420 } },
  ];
}

/** Suggested state names when mapping a sheet, in the order sprite packs usually order rows. */
export const SUGGESTED_STATES = [
  'idle', 'happy', 'sad', 'angry', 'surprised',
  'laugh', 'hurt', 'attack', 'celebrate', 'sleep',
] as const;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif',
];

export interface ImageValidation {
  ok: boolean;
  reason?: string;
}

/** Rejects files the renderer could not display, with a reason the user can act on. */
export function validateImage(file: { type: string; size: number }): ImageValidation {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, reason: 'That file type is not supported. Use PNG, JPEG, WebP or GIF.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `Images must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
    };
  }
  return { ok: true };
}

/** Animated formats must not be re-encoded on import or they lose their animation. */
export function isAnimatedFormat(mimeType: string): boolean {
  return mimeType === 'image/gif' || mimeType === 'image/webp' || mimeType === 'image/avif';
}

/** Which portrait kind a file should default to. */
export function defaultKindFor(mimeType: string): PortraitAsset['kind'] {
  return isAnimatedFormat(mimeType) ? 'animated-image' : 'static';
}
