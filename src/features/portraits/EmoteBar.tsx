import { STANDARD_EMOTES, EMOTE_LABELS, EMOTE_ICONS, resolveEmote, hasState } from '../../engine/sprites';
import type { PortraitAsset } from '../../domain/types';

/**
 * Emote controls.
 *
 * Every emote is always available. A portrait that cannot animate still reacts -- with a bubble
 * and a pulse -- because disabling nine buttons on a character with a JPEG would make the
 * feature look broken rather than gracefully limited. Emotes that do have a matching animation
 * are marked, so the difference is visible without being punitive.
 */
export function EmoteBar({
  portrait,
  onEmote,
  compact = false,
}: {
  portrait: PortraitAsset | null;
  onEmote: (emote: string) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <ul className={`flex flex-wrap gap-1 ${compact ? '' : 'gap-2'}`}>
        {STANDARD_EMOTES.map((emote) => {
          const animated = hasState(portrait, emote);
          return (
            <li key={emote}>
              <button
                type="button"
                onClick={() => onEmote(emote)}
                title={
                  animated
                    ? `${EMOTE_LABELS[emote]} — plays your “${emote}” animation`
                    : `${EMOTE_LABELS[emote]}`
                }
                aria-label={EMOTE_LABELS[emote] ?? emote}
                className={`inline-flex min-h-11 items-center gap-1 rounded-lg border px-2 text-sm transition-colors hover:bg-[var(--accent-subtle)] ${
                  animated ? 'border-[var(--accent)]' : 'border-[var(--border-strong)]'
                }`}
              >
                <span aria-hidden="true">{EMOTE_ICONS[emote]}</span>
                {compact ? null : (
                  <span className="text-xs">{EMOTE_LABELS[emote] ?? emote}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Resolves an emote for a portrait. Re-exported so callers need not reach into the engine. */
export { resolveEmote };

/** A speech bubble shown over the portrait during an emote. */
export function EmoteBubble({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-overlay)] px-2 py-1 text-sm shadow-md"
    >
      {text}
    </div>
  );
}
