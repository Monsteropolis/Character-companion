import { Field, Select, TextInput } from '../creation/steps/parts';
import { STANDARD_EMOTES, EMOTE_LABELS, EMOTE_ICONS, resolveEmote } from '../../engine/sprites';
import type { PortraitAsset } from '../../domain/types';

/**
 * Maps emote buttons to what they should do.
 *
 * Left alone, each emote resolves automatically: to a matching animation state if the sprite
 * has one, otherwise to a bubble and a pulse. This editor only exists for the cases where the
 * automatic answer is wrong -- a sheet whose "cheer" row should drive the Celebrate button, or
 * a static portrait that wants custom text.
 */
export function EmoteBindingEditor({
  portrait,
  onChange,
}: {
  portrait: PortraitAsset;
  onChange: (portrait: PortraitAsset) => void;
}) {
  const stateNames = portrait.states.map((s) => s.name);

  function bindingFor(emote: string) {
    return portrait.emotes.find((b) => b.emote === emote) ?? null;
  }

  function setAnimation(emote: string, stateName: string) {
    const others = portrait.emotes.filter((b) => b.emote !== emote);
    onChange({
      ...portrait,
      emotes:
        stateName === ''
          ? others
          : [...others, { emote, presentation: [{ type: 'animation', state: stateName }] }],
    });
  }

  function setBubble(emote: string, text: string) {
    const others = portrait.emotes.filter((b) => b.emote !== emote);
    const existing = bindingFor(emote);
    const animation = existing?.presentation.find((p) => p.type === 'animation');

    const presentation = [
      ...(animation ? [animation] : []),
      ...(text ? [{ type: 'bubble' as const, text }] : []),
    ];

    onChange({
      ...portrait,
      emotes: presentation.length === 0 ? others : [...others, { emote, presentation }],
    });
  }

  return (
    <details className="mt-4 rounded-lg border border-[var(--border)] p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Emote buttons ({portrait.emotes.length} customised)
      </summary>

      <p className="mt-2 mb-3 text-sm text-[var(--text-muted)]">
        {stateNames.length > 0
          ? 'Emotes already use a matching animation when your sheet has one. Override any that should play something else.'
          : 'This portrait has no animations, so emotes show a bubble and a small pulse. Add text below to customise what they say.'}
      </p>

      <ul className="space-y-2">
        {STANDARD_EMOTES.map((emote) => {
          const binding = bindingFor(emote);
          const animation = binding?.presentation.find((p) => p.type === 'animation');
          const bubble = binding?.presentation.find((p) => p.type === 'bubble');
          const resolved = resolveEmote(portrait, portrait.emotes, emote);
          const auto = !binding;

          return (
            <li key={emote} className="rounded-lg border border-[var(--border)] p-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span aria-hidden="true">{EMOTE_ICONS[emote]}</span>
                  {EMOTE_LABELS[emote] ?? emote}
                </div>

                <Field label="Animation" htmlFor={`emote-anim-${emote}`}>
                  <Select
                    id={`emote-anim-${emote}`}
                    value={animation?.type === 'animation' ? animation.state : ''}
                    onChange={(e) => setAnimation(emote, e.target.value)}
                    disabled={stateNames.length === 0}
                  >
                    <option value="">Automatic</option>
                    {stateNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Bubble text" htmlFor={`emote-bubble-${emote}`}>
                  <TextInput
                    id={`emote-bubble-${emote}`}
                    value={bubble?.type === 'bubble' ? bubble.text : ''}
                    placeholder={EMOTE_ICONS[emote]}
                    onChange={(e) => setBubble(emote, e.target.value)}
                  />
                </Field>
              </div>

              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {auto ? 'Automatic: ' : 'Custom: '}
                {describe(resolved)}
              </p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function describe(presentation: ReturnType<typeof resolveEmote>): string {
  return presentation
    .map((p) => {
      if (p.type === 'animation') return `plays “${p.state}”`;
      if (p.type === 'bubble') return `shows “${p.text}”`;
      if (p.type === 'pulse') return 'pulses';
      if (p.type === 'shake') return 'shakes';
      return p.type;
    })
    .join(', ');
}
