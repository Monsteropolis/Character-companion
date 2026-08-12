import { createContext, useContext } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useCharacterSheet, type CharacterSheet } from './useCharacterSheet';
import { PlayBar } from './PlayBar';
import { Spinner, ErrorNotice } from '../../ui/primitives';
import { MoodScope } from '../../ui/theme/ThemeProvider';

const SheetContext = createContext<CharacterSheet | null>(null);

export function useSheet(): CharacterSheet {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useSheet must be used inside a CharacterShell');
  return ctx;
}

const TABS = [
  { to: 'overview', label: 'Overview' },
  { to: 'combat', label: 'Combat' },
  { to: 'abilities', label: 'Abilities' },
  { to: 'spells', label: 'Spells', castersOnly: true },
  { to: 'inventory', label: 'Inventory' },
  { to: 'journal', label: 'Journal' },
  { to: 'notes', label: 'Notes' },
] as const;

/**
 * The character-level layout.
 *
 * The Play Bar sits outside the tab content and stays visible everywhere, because the actions it
 * carries -- take damage, heal, check AC, see the portrait -- are needed constantly during play
 * and would otherwise cost a tab switch each time. Reference material lives in the tabs; the
 * things you touch every round do not.
 */
export function CharacterShell() {
  const { id } = useParams<{ id: string }>();
  const sheet = useCharacterSheet(id);

  if (sheet.loading) return <Spinner label="Loading character" />;
  if (sheet.error || !sheet.character) {
    return <ErrorNotice message={sheet.error ?? 'Character not found.'} onRetry={sheet.reload} />;
  }

  // Driven by the class's own spellcasting, so a caster sees the tab before choosing any spell.
  const isCaster = sheet.spellcasting?.hasSpellcasting ?? false;
  const tabs = TABS.filter((t) => !('castersOnly' in t && t.castersOnly) || isCaster);

  return (
    <SheetContext.Provider value={sheet}>
      <MoodScope mood={sheet.character.mood}>
        {/* Bottom padding clears the fixed play bar and tab bar on small screens. */}
        <div className="mx-auto max-w-5xl px-4 pb-56 lg:pb-8">
          <PlayBar />

          <nav aria-label="Character sections" className="-mx-4 mb-4 overflow-x-auto px-4">
            <ul className="flex min-w-max gap-1">
              {tabs.map((tab) => (
                <li key={tab.to}>
                  <NavLink
                    to={tab.to}
                    className={({ isActive }) =>
                      `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                          : 'text-[var(--text-muted)] hover:bg-[var(--accent-subtle)]'
                      }`
                    }
                  >
                    {tab.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <Outlet />
        </div>
      </MoodScope>
    </SheetContext.Provider>
  );
}
