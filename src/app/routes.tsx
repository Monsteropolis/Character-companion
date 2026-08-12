import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { Spinner } from '../ui/primitives';
import { CharacterGallery } from '../features/characters/CharacterGallery';
import { CreationWizard } from '../features/creation/CreationWizard';
import { CharacterShell } from '../features/sheet/CharacterShell';
import { OverviewTab } from '../features/sheet/OverviewTab';
import { CombatTab } from '../features/sheet/CombatTab';
import { AbilitiesTab } from '../features/sheet/AbilitiesTab';
import { InventoryTab } from '../features/inventory/InventoryTab';
import { SpellsTab } from '../features/spells/SpellsTab';
import { JournalTab } from '../features/journal/JournalTab';
import { NotesTab } from '../features/notes/NotesTab';
import { PortraitTab } from '../features/portraits/PortraitTab';

/**
 * Route table.
 *
 * Character-scoped routes nest under `/c/:id` so the character shell (play bar, tabs) can be a
 * layout route later without restructuring. Tab state lives in the URL, so the back button
 * behaves and any view can be linked to.
 *
 * Phases not yet built resolve to honest placeholders rather than dead links.
 */

const AboutPage = lazy(() =>
  import('../features/about/AboutPage').then((m) => ({ default: m.AboutPage })),
);

const CustomContentPage = lazy(() =>
  import('../features/custom/CustomContentPage').then((m) => ({ default: m.CustomContentPage })),
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <CharacterGallery /> },
      { path: 'create', element: <CreationWizard /> },
      {
        path: 'c/:id',
        element: <CharacterShell />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: 'overview', element: <OverviewTab /> },
          { path: 'combat', element: <CombatTab /> },
          { path: 'abilities', element: <AbilitiesTab /> },
          { path: 'spells', element: <SpellsTab /> },
          { path: 'inventory', element: <InventoryTab /> },
          { path: 'journal', element: <JournalTab /> },
          { path: 'notes', element: <NotesTab /> },
          { path: 'portrait', element: <PortraitTab /> },
        ],
      },
      {
        path: 'custom',
        element: (
          <Suspense fallback={<Spinner label="Loading" />}>
            <CustomContentPage />
          </Suspense>
        ),
      },
      {
        path: 'about',
        element: (
          <Suspense fallback={<Spinner label="Loading" />}>
            <AboutPage />
          </Suspense>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
