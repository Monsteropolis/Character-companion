import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { createBrowserRouter, createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { Spinner } from '../ui/primitives';
import { CharacterGallery } from '../features/characters/CharacterGallery';
import { CharacterShell } from '../features/sheet/CharacterShell';

/**
 * Route table.
 *
 * Character-scoped routes nest under `/c/:id` so the character shell (play bar, tabs) is a layout
 * route. Tab state lives in the URL, so the back button behaves and any view can be linked to.
 *
 * Everything except the gallery and the character shell is code-split. The gallery is the landing
 * route and the shell is needed the moment a character opens, so eager-loading those two keeps the
 * first paint fast; every tab beyond that is fetched when it is first visited. A phone on a
 * hotel wifi at a game table should not download the homebrew authoring form to look at its AC.
 */

/** `React.lazy` for a named export, wrapped in the shared loading fallback. */
function route<T extends string>(
  loader: () => Promise<Record<T, unknown>>,
  name: T,
  label: string,
): ReactElement {
  const Component = lazy(async () => ({ default: (await loader())[name] as ComponentType }));
  return (
    <Suspense fallback={<Spinner label={label} />}>
      <Component />
    </Suspense>
  );
}

/**
 * Clean URLs need a server that rewrites unknown paths to index.html. The single-file demo build
 * is one static file with no server in front of it, so it routes on the hash instead — otherwise
 * a refresh or a shared deep link 404s. Nothing else differs between the two builds.
 */
const createRouter = import.meta.env.VITE_HASH_ROUTER ? createHashRouter : createBrowserRouter;

export const router = createRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <CharacterGallery /> },
      {
        path: 'create',
        element: route(() => import('../features/creation/CreationWizard'), 'CreationWizard', 'Loading creation'),
      },
      {
        path: 'c/:id',
        element: <CharacterShell />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          {
            path: 'overview',
            element: route(() => import('../features/sheet/OverviewTab'), 'OverviewTab', 'Loading overview'),
          },
          {
            path: 'combat',
            element: route(() => import('../features/sheet/CombatTab'), 'CombatTab', 'Loading combat'),
          },
          {
            path: 'abilities',
            element: route(() => import('../features/sheet/AbilitiesTab'), 'AbilitiesTab', 'Loading abilities'),
          },
          {
            path: 'spells',
            element: route(() => import('../features/spells/SpellsTab'), 'SpellsTab', 'Loading spells'),
          },
          {
            path: 'inventory',
            element: route(() => import('../features/inventory/InventoryTab'), 'InventoryTab', 'Loading inventory'),
          },
          {
            path: 'journal',
            element: route(() => import('../features/journal/JournalTab'), 'JournalTab', 'Loading journal'),
          },
          {
            path: 'notes',
            element: route(() => import('../features/notes/NotesTab'), 'NotesTab', 'Loading notes'),
          },
          {
            path: 'portrait',
            element: route(() => import('../features/portraits/PortraitTab'), 'PortraitTab', 'Loading portrait'),
          },
          {
            path: 'level-up',
            element: route(() => import('../features/leveling/LevelUpTab'), 'LevelUpTab', 'Loading progression'),
          },
        ],
      },
      {
        path: 'custom',
        element: route(() => import('../features/custom/CustomContentPage'), 'CustomContentPage', 'Loading homebrew'),
      },
      {
        path: 'about',
        element: route(() => import('../features/about/AboutPage'), 'AboutPage', 'Loading'),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
