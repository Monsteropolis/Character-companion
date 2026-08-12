import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { Spinner } from '../ui/primitives';
import { CharacterGallery } from '../features/characters/CharacterGallery';
import { CreationWizard } from '../features/creation/CreationWizard';

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

function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="display-face mb-2 text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-[var(--text-muted)]">Arriving in {phase}.</p>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <CharacterGallery /> },
      { path: 'create', element: <CreationWizard /> },
      {
        path: 'c/:id',
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: 'overview', element: <Placeholder title="Overview" phase="Phase 3" /> },
          { path: 'combat', element: <Placeholder title="Combat" phase="Phase 3" /> },
          { path: 'abilities', element: <Placeholder title="Abilities" phase="Phase 5" /> },
          { path: 'spells', element: <Placeholder title="Spells" phase="Phase 5" /> },
          { path: 'inventory', element: <Placeholder title="Inventory" phase="Phase 4" /> },
          { path: 'journal', element: <Placeholder title="Journal" phase="Phase 6" /> },
          { path: 'notes', element: <Placeholder title="Notes" phase="Phase 6" /> },
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
