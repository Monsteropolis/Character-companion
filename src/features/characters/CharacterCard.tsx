import { Link } from 'react-router-dom';
import { MoodScope } from '../../ui/theme/ThemeProvider';
import { characterDisplayName, primaryClass, totalLevel } from '../../domain/factories';
import type { Character } from '../../domain/types';

/**
 * A character card in the gallery.
 *
 * The portrait is the card, not a thumbnail on it. Players recognise their character by its
 * face long before they read its name, and the brief asks for portraits to carry visual
 * identity rather than sit in a corner as an avatar.
 */
export function CharacterCard({
  character,
  portraitUrl,
  onAction,
}: {
  character: Character;
  portraitUrl: string | null;
  onAction: (action: 'duplicate' | 'archive' | 'unarchive' | 'delete', id: string) => void;
}) {
  const name = characterDisplayName(character);
  const cls = primaryClass(character);
  const level = totalLevel(character);

  const subtitle = [
    character.race.subraceRef?.name ?? character.race.raceRef?.name,
    cls ? `${cls.classRef.name} ${level}` : 'No class yet',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <MoodScope mood={character.mood} className="group relative">
      <article className="panel relative overflow-hidden transition-transform focus-within:-translate-y-0.5 hover:-translate-y-0.5">
        <Link
          to={`/c/${character.id}`}
          className="block focus:outline-none"
          aria-label={`Open ${name}`}
        >
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-[var(--accent-subtle)]">
            {portraitUrl ? (
              <img
                src={portraitUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              // Initials placeholder is the first link in the portrait fallback chain.
              <div
                className="flex h-full w-full items-center justify-center"
                aria-hidden="true"
              >
                <span className="display-face text-6xl font-semibold text-[var(--accent)] opacity-70">
                  {name.slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}

            {character.archived ? (
              <span className="absolute top-2 right-2 rounded-full bg-[var(--surface-overlay)] px-2 py-1 text-[0.6875rem] font-medium tracking-wide text-[var(--text-muted)] uppercase">
                Archived
              </span>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10">
              <h3 className="display-face truncate text-lg font-semibold text-white">{name}</h3>
              <p className="truncate text-xs text-white/80">{subtitle}</p>
            </div>
          </div>
        </Link>

        <div className="flex items-center justify-end gap-1 border-t border-[var(--border)] p-1">
          <CardAction label="Duplicate" onClick={() => onAction('duplicate', character.id)}>
            Duplicate
          </CardAction>
          {character.archived ? (
            <CardAction label="Unarchive" onClick={() => onAction('unarchive', character.id)}>
              Unarchive
            </CardAction>
          ) : (
            <CardAction label="Archive" onClick={() => onAction('archive', character.id)}>
              Archive
            </CardAction>
          )}
          <CardAction
            label={`Delete ${name}`}
            danger
            onClick={() => onAction('delete', character.id)}
          >
            Delete
          </CardAction>
        </div>
      </article>
    </MoodScope>
  );
}

function CardAction({
  children,
  label,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`min-h-11 rounded-md px-2 text-xs font-medium transition-colors hover:bg-[var(--accent-subtle)] ${
        danger ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'
      }`}
    >
      {children}
    </button>
  );
}
