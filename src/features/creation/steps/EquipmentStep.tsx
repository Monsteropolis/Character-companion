import { useMemo, useState } from 'react';
import { useDraft } from '../draft';
import { useCollections } from '../../../rules/RulesProvider';
import { StepHeading, ChoicePicker, TextInput } from './parts';
import { Spinner, ErrorNotice, EmptyState, Button, Panel } from '../../../ui/primitives';
import { resolveChoice, emptyChoiceContext, type ChoiceContext } from '../../../engine/choices';
import type { Choice } from '../../../rules/schemas/primitives';

export function EquipmentStep() {
  const {
    classRef,
    backgroundRef,
    selections,
    select,
    manualEquipment,
    addManualEquipment,
    removeManualEquipment,
  } = useDraft();
  const { data, isLoading, isError, error, refetch } = useCollections([
    'classes',
    'backgrounds',
    'equipment-categories',
  ]);
  const [customItem, setCustomItem] = useState('');

  const ctx: ChoiceContext = useMemo(() => {
    const c = emptyChoiceContext();
    for (const cat of data?.['equipment-categories'] ?? []) {
      c.equipmentCategories.set(cat.index, cat.equipment);
    }
    return c;
  }, [data]);

  if (isLoading) return <Spinner label="Loading equipment" />;
  if (isError || !data) {
    return (
      <ErrorNotice
        message={error instanceof Error ? error.message : 'Could not load equipment.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const cls = data.classes.find((c) => c.index === classRef?.index);
  const background = data.backgrounds.find((b) => b.index === backgroundRef?.index);

  if (!cls) {
    return (
      <EmptyState
        title="Choose a class first"
        description="Starting equipment comes from your class and background."
      />
    );
  }

  return (
    <div>
      <StepHeading
        title="Starting equipment"
        description="Take the packages below, or skip them and buy gear with starting gold."
      />

      <h3 className="display-face mb-2 font-semibold">From {cls.name}</h3>
      {cls.starting_equipment_options.map((choice, i) => {
        const key = `class:${cls.index}:equipment:${i}`;
        return (
          <ChoicePicker
            key={key}
            choice={resolveChoice(choice as Choice, key, ctx)}
            selected={selections[key] ?? []}
            onChange={(ids) => select(key, ids)}
          />
        );
      })}

      {cls.starting_equipment.length > 0 ? (
        <Panel className="mb-6 p-3">
          <p className="mb-1 text-sm font-medium">Always included</p>
          <p className="text-sm text-[var(--text-muted)]">
            {cls.starting_equipment.map((e) => `${e.quantity}x ${e.equipment.name}`).join(', ')}
          </p>
        </Panel>
      ) : null}

      {background ? (
        <>
          <h3 className="display-face mb-2 font-semibold">From {background.name}</h3>
          {background.starting_equipment_options.map((choice, i) => {
            const key = `background:${background.index}:equipment:${i}`;
            return (
              <ChoicePicker
                key={key}
                choice={resolveChoice(choice as Choice, key, ctx)}
                selected={selections[key] ?? []}
                onChange={(ids) => select(key, ids)}
              />
            );
          })}
          <Panel className="mb-6 p-3">
            <p className="mb-1 text-sm font-medium">Always included</p>
            <p className="text-sm text-[var(--text-muted)]">
              {background.starting_equipment
                .map((e) => `${e.quantity}x ${e.equipment.name}`)
                .join(', ') || 'None'}
              {background.starting_gold
                ? ` · ${background.starting_gold.quantity} ${background.starting_gold.unit}`
                : ''}
            </p>
          </Panel>
        </>
      ) : null}

      <section>
        <h3 className="display-face mb-2 font-semibold">Anything else</h3>
        <p className="mb-2 text-sm text-[var(--text-muted)]">
          Add items your DM gave you, or anything the rules data does not list.
        </p>
        <div className="flex gap-2">
          <TextInput
            value={customItem}
            onChange={(e) => setCustomItem(e.target.value)}
            placeholder="e.g. Grandfather's compass"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customItem.trim()) {
                addManualEquipment(customItem.trim());
                setCustomItem('');
              }
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (customItem.trim()) {
                addManualEquipment(customItem.trim());
                setCustomItem('');
              }
            }}
          >
            Add
          </Button>
        </div>

        {manualEquipment.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {manualEquipment.map((item, i) => (
              <li
                key={`${item}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2 text-sm"
              >
                <span>{item}</span>
                <button
                  type="button"
                  onClick={() => removeManualEquipment(i)}
                  aria-label={`Remove ${item}`}
                  className="min-h-11 px-2 text-[var(--text-muted)] hover:text-[var(--danger)]"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
