import { useEffect, useRef, useState } from 'react';
import { framePosition, frameAt, resolveState, stateDurationMs } from '../../engine/sprites';
import type { EmotePresentation, PortraitAsset } from '../../domain/types';

/**
 * Renders a character portrait, animating it when the data supports it.
 *
 * The fallback chain is the whole design: sprite sheet frame → animated image → still image →
 * initials. Every link is reachable, so a character with a JPEG and a character with a ten-state
 * sprite sheet both render correctly through the same component, and the emote system can drive
 * either one.
 *
 * Animation is driven by requestAnimationFrame and stops entirely when the user has asked for
 * reduced motion.
 */
export function PortraitView({
  portrait,
  imageUrl,
  stateName,
  fallbackInitial,
  className = '',
  overlay,
  effect,
}: {
  portrait: PortraitAsset | null;
  imageUrl: string | null;
  stateName: string | null;
  fallbackInitial: string;
  className?: string;
  overlay?: EmotePresentation | null;
  effect?: 'shake' | 'pulse' | null;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const [frame, setFrame] = useState(0);

  const state = portrait ? resolveState(portrait, stateName) : null;
  const sheet = portrait?.kind === 'spritesheet' ? portrait.spritesheet : null;

  useEffect(() => {
    if (!sheet || !state) return;
    // A single frame needs no animation loop, and neither does a user who asked for stillness.
    if (reduceMotion || state.frames.length <= 1) {
      setFrame(state.frames[0] ?? 0);
      return;
    }

    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      setFrame(frameAt(state, now - started));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sheet, state, reduceMotion]);

  const effectClass =
    !effect || reduceMotion ? '' : effect === 'shake' ? 'portrait-shake' : 'portrait-pulse';

  if (!imageUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--accent-subtle)] ${className}`}
        aria-hidden="true"
      >
        <span className="display-face text-4xl font-semibold text-[var(--accent)] opacity-70">
          {fallbackInitial}
        </span>
      </div>
    );
  }

  if (sheet && state) {
    const position = framePosition(sheet, frame);
    return (
      <div className={`relative overflow-hidden ${className} ${effectClass}`}>
        <div
          role="img"
          aria-label="Character sprite"
          className="h-full w-full"
          style={{
            backgroundImage: `url(${imageUrl})`,
            // The sheet is scaled so one frame fills the box, then shifted to the right cell.
            backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
            backgroundPosition: `${(position.column / Math.max(1, sheet.columns - 1)) * 100}% ${
              (position.row / Math.max(1, sheet.rows - 1)) * 100
            }%`,
            backgroundRepeat: 'no-repeat',
            // Sprite art is usually pixel art; smoothing it looks wrong.
            imageRendering: 'pixelated',
          }}
        />
        {overlay?.type === 'overlay' ? <OverlayLayer /> : null}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className} ${effectClass}`}>
      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
    </div>
  );
}

function OverlayLayer() {
  return <div className="pointer-events-none absolute inset-0" aria-hidden="true" />;
}

/** Tracks the reduced-motion preference live, rather than sampling once at mount. */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => {
    if (typeof matchMedia === 'undefined') return false;
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduce(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduce;
}

/**
 * Plays an emote, returning to the resting state when it finishes.
 *
 * One-shot animations schedule their own return so an emote reads as a moment rather than a
 * mode the player has to undo.
 */
export function useEmotePlayback(portrait: PortraitAsset | null) {
  const [active, setActive] = useState<{ state: string | null; bubble: string | null; effect: 'shake' | 'pulse' | null }>({
    state: null,
    bubble: null,
    effect: null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function play(presentation: EmotePresentation[]) {
    if (timer.current) clearTimeout(timer.current);

    let state: string | null = null;
    let bubble: string | null = null;
    let effect: 'shake' | 'pulse' | null = null;

    for (const part of presentation) {
      if (part.type === 'animation') state = part.state;
      if (part.type === 'bubble') bubble = part.text;
      if (part.type === 'shake') effect = 'shake';
      if (part.type === 'pulse') effect = 'pulse';
    }

    setActive({ state, bubble, effect });

    const animation = state && portrait ? resolveState(portrait, state) : null;
    const duration =
      animation && !animation.loop ? stateDurationMs(animation) : DEFAULT_EMOTE_MS;

    timer.current = setTimeout(
      () => setActive({ state: null, bubble: null, effect: null }),
      Math.max(600, duration),
    );
  }

  return { ...active, play };
}

const DEFAULT_EMOTE_MS = 1600;
