import { describe, it, expect } from 'vitest';
import {
  framePosition,
  deriveMeta,
  frameRange,
  resolveState,
  hasState,
  frameAt,
  stateDurationMs,
  resolveEmote,
  validateImage,
  isAnimatedFormat,
  defaultKindFor,
  MAX_IMAGE_BYTES,
  type SpritesheetMeta,
} from '../sprites';
import type { AnimationState, PortraitAsset } from '../../domain/types';

/**
 * Sprite tests.
 *
 * The fallback chain gets the most attention: the brief is explicit that not every character has
 * every animation, so every lookup must degrade to something renderable rather than producing a
 * blank frame or an error.
 */

const meta: SpritesheetMeta = {
  frameWidth: 64,
  frameHeight: 64,
  columns: 4,
  rows: 3,
  frameCount: 10,
};

const state = (over: Partial<AnimationState> = {}): AnimationState => ({
  name: 'idle',
  frames: [0, 1, 2, 3],
  fps: 8,
  loop: true,
  blobId: null,
  ...over,
});

const portrait = (over: Partial<PortraitAsset> = {}) =>
  ({
    states: [state()],
    defaultState: 'idle',
    ...over,
  }) as Pick<PortraitAsset, 'states' | 'defaultState'>;

describe('frame geometry', () => {
  it('places frames left to right, top to bottom', () => {
    expect(framePosition(meta, 0)).toMatchObject({ column: 0, row: 0, x: -0, y: -0 });
    expect(framePosition(meta, 3)).toMatchObject({ column: 3, row: 0, x: -192, y: -0 });
    expect(framePosition(meta, 4)).toMatchObject({ column: 0, row: 1, x: -0, y: -64 });
    expect(framePosition(meta, 9)).toMatchObject({ column: 1, row: 2, x: -64, y: -128 });
  });

  it('clamps an out-of-range index instead of throwing', () => {
    // A state referencing a frame beyond the sheet must still render something.
    expect(framePosition(meta, 99)).toMatchObject({ column: 1, row: 2 });
    expect(framePosition(meta, -5)).toMatchObject({ column: 0, row: 0 });
  });

  it('survives a degenerate sheet', () => {
    const tiny = { frameWidth: 10, frameHeight: 10, columns: 0, rows: 0, frameCount: 0 };
    expect(() => framePosition(tiny, 0)).not.toThrow();
  });
});

describe('deriveMeta', () => {
  it('divides the image by the grid', () => {
    expect(deriveMeta(256, 192, 4, 3)).toEqual({
      frameWidth: 64, frameHeight: 64, columns: 4, rows: 3, frameCount: 12,
    });
  });

  it('accepts a partial final row', () => {
    // Sheets very often have fewer frames than grid cells.
    expect(deriveMeta(256, 192, 4, 3, 10).frameCount).toBe(10);
  });

  it('floors non-integer frame sizes rather than producing fractional offsets', () => {
    expect(deriveMeta(100, 100, 3, 3).frameWidth).toBe(33);
  });

  it('never divides by zero', () => {
    expect(() => deriveMeta(100, 100, 0, 0)).not.toThrow();
  });
});

describe('frameRange', () => {
  it('builds a contiguous run', () => {
    expect(frameRange(4, 4)).toEqual([4, 5, 6, 7]);
  });

  it('returns nothing for a zero-length run', () => {
    expect(frameRange(0, 0)).toEqual([]);
  });
});

describe('state fallback chain', () => {
  it('returns the requested state when it exists', () => {
    const p = portrait({ states: [state(), state({ name: 'happy' })] });
    expect(resolveState(p, 'happy')?.name).toBe('happy');
  });

  it('falls back to the default state when the request is missing', () => {
    // The whole point: no character has every animation.
    const p = portrait({ states: [state({ name: 'idle' })], defaultState: 'idle' });
    expect(resolveState(p, 'celebrate')?.name).toBe('idle');
  });

  it('falls back to the first state when the default is also missing', () => {
    const p = portrait({ states: [state({ name: 'wave' })], defaultState: 'idle' });
    expect(resolveState(p, 'celebrate')?.name).toBe('wave');
  });

  it('returns null only when there are no states at all', () => {
    expect(resolveState(portrait({ states: [] }), 'idle')).toBeNull();
  });

  it('reports whether a specific state exists, for enabling controls', () => {
    const p = portrait({ states: [state({ name: 'happy' })] });
    expect(hasState(p, 'happy')).toBe(true);
    expect(hasState(p, 'angry')).toBe(false);
    expect(hasState(null, 'happy')).toBe(false);
  });
});

describe('animation timing', () => {
  it('advances through frames at the given rate', () => {
    const s = state({ frames: [0, 1, 2, 3], fps: 10 });
    expect(frameAt(s, 0)).toBe(0);
    expect(frameAt(s, 100)).toBe(1);
    expect(frameAt(s, 250)).toBe(2);
  });

  it('loops when the state loops', () => {
    const s = state({ frames: [0, 1], fps: 10, loop: true });
    expect(frameAt(s, 200)).toBe(0);
    expect(frameAt(s, 300)).toBe(1);
  });

  it('holds the last frame when the state does not loop', () => {
    // A one-shot emote that snapped back to frame 0 would read as a glitch.
    const s = state({ frames: [0, 1, 2], fps: 10, loop: false });
    expect(frameAt(s, 10_000)).toBe(2);
  });

  it('tolerates an empty frame list and a zero frame rate', () => {
    expect(frameAt(state({ frames: [], fps: 0 }), 500)).toBe(0);
  });

  it('computes a run time so an emote can return to idle afterwards', () => {
    expect(stateDurationMs(state({ frames: [0, 1, 2, 3], fps: 8 }))).toBe(500);
  });
});

describe('emote resolution', () => {
  it('prefers an explicit binding', () => {
    const result = resolveEmote(portrait(), [
      { emote: 'happy', presentation: [{ type: 'bubble', text: 'Ha!' }] },
    ], 'happy');
    expect(result).toEqual([{ type: 'bubble', text: 'Ha!' }]);
  });

  it('uses a matching animation state when the sprite has one', () => {
    const p = portrait({ states: [state(), state({ name: 'celebrate' })] });
    expect(resolveEmote(p, [], 'celebrate')).toEqual([{ type: 'animation', state: 'celebrate' }]);
  });

  it('degrades to a bubble and a pulse for a static portrait', () => {
    // This is what lets the same emote work on a JPEG today and a sprite sheet tomorrow.
    const result = resolveEmote(null, [], 'angry');
    expect(result.map((p) => p.type)).toEqual(['bubble', 'pulse']);
  });

  it('degrades when the sprite lacks that particular state', () => {
    const p = portrait({ states: [state({ name: 'idle' })] });
    const result = resolveEmote(p, [], 'laugh');
    expect(result.some((r) => r.type === 'animation')).toBe(false);
    expect(result.some((r) => r.type === 'bubble')).toBe(true);
  });

  it('ignores an empty binding rather than showing nothing', () => {
    const p = portrait({ states: [state(), state({ name: 'happy' })] });
    const result = resolveEmote(p, [{ emote: 'happy', presentation: [] }], 'happy');
    expect(result).toEqual([{ type: 'animation', state: 'happy' }]);
  });

  it('supports composed presentations for future expansion', () => {
    const result = resolveEmote(null, [
      {
        emote: 'hurt',
        presentation: [
          { type: 'alt-portrait', blobId: 'b1' },
          { type: 'shake', params: { intensity: 4 } },
          { type: 'bubble', text: 'Ow' },
        ],
      },
    ], 'hurt');
    expect(result).toHaveLength(3);
  });
});

describe('image validation', () => {
  it('accepts the formats the renderer can display', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(validateImage({ type, size: 1000 }).ok).toBe(true);
    }
  });

  it('rejects unsupported types with an actionable reason', () => {
    const result = validateImage({ type: 'application/pdf', size: 1000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/PNG, JPEG, WebP or GIF/);
  });

  it('rejects oversized files', () => {
    expect(validateImage({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }).ok).toBe(false);
  });
});

describe('format handling', () => {
  it('identifies animated formats, which must not be re-encoded', () => {
    // Resizing a GIF through a canvas would silently flatten it to one frame.
    expect(isAnimatedFormat('image/gif')).toBe(true);
    expect(isAnimatedFormat('image/webp')).toBe(true);
    expect(isAnimatedFormat('image/png')).toBe(false);
  });

  it('defaults an animated upload to the animated kind', () => {
    expect(defaultKindFor('image/gif')).toBe('animated-image');
    expect(defaultKindFor('image/png')).toBe('static');
  });
});
