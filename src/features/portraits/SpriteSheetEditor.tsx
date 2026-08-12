import { useMemo } from 'react';
import { Panel, Button } from '../../ui/primitives';
import { Field, TextInput, Select } from '../creation/steps/parts';
import { PortraitView } from './PortraitView';
import { deriveMeta, frameRange, SUGGESTED_STATES, EMOTE_LABELS } from '../../engine/sprites';
import type { AnimationState, PortraitAsset } from '../../domain/types';

/**
 * Sprite sheet configuration.
 *
 * Authoring a sheet is two decisions: the grid, and which frames belong to which named state.
 * Both are shown against a live preview, because getting a grid wrong by one column produces
 * frames that look almost right, and only animation reveals it.
 *
 * State names are free text with suggestions rather than a fixed list — a sprite pack may have
 * animations this app has never heard of, and refusing to store them would be worse than not
 * knowing what they mean.
 */
export function SpriteSheetEditor({
  portrait,
  imageUrl,
  onChange,
}: {
  portrait: PortraitAsset;
  imageUrl: string | null;
  onChange: (portrait: PortraitAsset) => void;
}) {
  const sheet = portrait.spritesheet;

  const imageSize = useMemo(
    () => ({
      width: (sheet?.frameWidth ?? 0) * (sheet?.columns ?? 1),
      height: (sheet?.frameHeight ?? 0) * (sheet?.rows ?? 1),
    }),
    [sheet],
  );

  function setGrid(columns: number, rows: number, frameCount?: number) {
    const next = deriveMeta(
      imageSize.width || columns * (sheet?.frameWidth ?? 64),
      imageSize.height || rows * (sheet?.frameHeight ?? 64),
      columns,
      rows,
      frameCount,
    );
    onChange({ ...portrait, spritesheet: next });
  }

  function updateState(index: number, patch: Partial<AnimationState>) {
    onChange({
      ...portrait,
      states: portrait.states.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  }

  function addState() {
    const used = new Set(portrait.states.map((s) => s.name));
    const suggestion = SUGGESTED_STATES.find((n) => !used.has(n)) ?? 'custom';
    const nextRow = portrait.states.length;
    const columns = sheet?.columns ?? 4;

    onChange({
      ...portrait,
      states: [
        ...portrait.states,
        {
          name: suggestion,
          // A new state defaults to the next unclaimed row, which is how sheets are usually laid
          // out and makes mapping a whole sheet a matter of clicking Add repeatedly.
          frames: frameRange(nextRow * columns, columns),
          fps: 8,
          loop: suggestion === 'idle',
          blobId: null,
        },
      ],
      defaultState: portrait.defaultState || suggestion,
    });
  }

  if (!sheet) return null;

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <h4 className="display-face mb-2 font-semibold">Grid</h4>
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          How the sheet is divided. Frames are numbered left to right, top to bottom, starting
          at 0.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Columns" htmlFor="sheet-columns">
            <NumberInput
              id="sheet-columns"
              value={sheet.columns}
              min={1}
              onChange={(v) => setGrid(v, sheet.rows, sheet.frameCount)}
            />
          </Field>
          <Field label="Rows" htmlFor="sheet-rows">
            <NumberInput
              id="sheet-rows"
              value={sheet.rows}
              min={1}
              onChange={(v) => setGrid(sheet.columns, v, sheet.frameCount)}
            />
          </Field>
          <Field
            label="Total frames"
            htmlFor="sheet-frames"
            hint="Often fewer than the grid, if the last row is partial."
          >
            <NumberInput
              id="sheet-frames"
              value={sheet.frameCount}
              min={1}
              onChange={(v) => setGrid(sheet.columns, sheet.rows, v)}
            />
          </Field>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Frame size: {sheet.frameWidth} × {sheet.frameHeight} px
        </p>
      </Panel>

      <Panel className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="display-face font-semibold">Animation states</h4>
            <p className="text-sm text-[var(--text-muted)]">
              Name the animations in your sheet. You do not need all of them — anything missing
              falls back to the default state.
            </p>
          </div>
          <Button variant="secondary" onClick={addState}>
            Add state
          </Button>
        </div>

        {portrait.states.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No states yet. Add one to map a row of frames to a name like “idle”.
          </p>
        ) : null}

        <ul className="space-y-3">
          {portrait.states.map((state, index) => (
            <li key={index} className="rounded-lg border border-[var(--border)] p-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Name" htmlFor={`state-name-${index}`}>
                  <TextInput
                    id={`state-name-${index}`}
                    list="suggested-states"
                    value={state.name}
                    onChange={(e) => updateState(index, { name: e.target.value })}
                  />
                </Field>
                <Field label="First frame" htmlFor={`state-start-${index}`}>
                  <NumberInput
                    id={`state-start-${index}`}
                    value={state.frames[0] ?? 0}
                    min={0}
                    onChange={(v) => updateState(index, { frames: frameRange(v, state.frames.length || 1) })}
                  />
                </Field>
                <Field label="Frame count" htmlFor={`state-count-${index}`}>
                  <NumberInput
                    id={`state-count-${index}`}
                    value={state.frames.length}
                    min={1}
                    onChange={(v) => updateState(index, { frames: frameRange(state.frames[0] ?? 0, v) })}
                  />
                </Field>
                <Field label="Frames per second" htmlFor={`state-fps-${index}`}>
                  <NumberInput
                    id={`state-fps-${index}`}
                    value={state.fps}
                    min={1}
                    max={60}
                    onChange={(v) => updateState(index, { fps: v })}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={state.loop}
                    onChange={(e) => updateState(index, { loop: e.target.checked })}
                    className="h-4 w-4"
                  />
                  Loop
                </label>

                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="default-state"
                    checked={portrait.defaultState === state.name}
                    onChange={() => onChange({ ...portrait, defaultState: state.name })}
                    className="h-4 w-4"
                  />
                  Resting state
                </label>

                <div className="ml-auto flex items-center gap-3">
                  {/* A live preview of this state alone: a wrong grid is only visible in motion. */}
                  <PortraitView
                    portrait={{ ...portrait, states: [state], defaultState: state.name }}
                    imageUrl={imageUrl}
                    stateName={state.name}
                    fallbackInitial="?"
                    className="h-16 w-16 rounded-lg border border-[var(--border)]"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${state.name}`}
                    onClick={() =>
                      onChange({
                        ...portrait,
                        states: portrait.states.filter((_, i) => i !== index),
                      })
                    }
                    className="min-h-11 px-2 text-sm text-[var(--danger)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <datalist id="suggested-states">
          {SUGGESTED_STATES.map((name) => (
            <option key={name} value={name}>
              {EMOTE_LABELS[name] ?? name}
            </option>
          ))}
        </datalist>
      </Panel>
    </div>
  );
}

function NumberInput({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Math.max(min ?? 0, Number(e.target.value) || 0))}
      className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
    />
  );
}

export function SelectField(props: React.ComponentProps<typeof Select>) {
  return <Select {...props} />;
}
