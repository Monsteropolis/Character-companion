import { Link, NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTheme } from '../ui/theme/ThemeProvider';
import { requestPersistentStorage } from '../persistence/db';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * The application shell: masthead, storage warning, routed content.
 *
 * The character-level shell (play bar and tabs) is deliberately not here -- it belongs to the
 * character route, so the gallery is not burdened with per-character chrome.
 */
export function AppShell() {
  const { preference, setPreference } = useTheme();
  const [storageAtRisk, setStorageAtRisk] = useState(false);

  useEffect(() => {
    // IndexedDB is evictable by default. If the browser refuses to make it persistent, the
    // user needs to know that export is their safety net -- silence here risks real data loss.
    void requestPersistentStorage().then((granted) => setStorageAtRisk(!granted));
  }, []);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface-base)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="display-face text-base font-semibold tracking-tight">
            Character Companion
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            <ShellLink to="/custom">Homebrew</ShellLink>
            <ShellLink to="/about">About</ShellLink>
            <button
              type="button"
              onClick={() =>
                setPreference(
                  preference === 'dark' ? 'light' : preference === 'light' ? 'system' : 'dark',
                )
              }
              className="min-h-11 rounded-lg px-3 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-subtle)]"
              aria-label={`Theme: ${preference}. Change theme.`}
            >
              {preference === 'dark' ? '🌙' : preference === 'light' ? '☀️' : '🖥️'}
            </button>
          </nav>
        </div>
      </header>

      {storageAtRisk ? (
        <div
          role="status"
          className="border-b border-[var(--warning)] bg-[var(--surface-raised)] px-4 py-2 text-center text-xs text-[var(--text-muted)]"
        >
          This browser has not granted persistent storage, so data could be cleared under storage
          pressure. Export your characters regularly.
        </div>
      ) : null}

      <main>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}

function ShellLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-[var(--accent-subtle)] text-[var(--text)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--accent-subtle)]'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
