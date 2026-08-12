import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { moodVariables, type ThemeMode } from './moods';

/**
 * Theme preference has three states, not two.
 *
 * 'system' is the default and stamps nothing, letting `prefers-color-scheme` decide; an explicit
 * choice stamps `data-theme` so it wins in both directions. Collapsing this to a boolean would
 * make it impossible to follow the OS after once choosing manually.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ThemeMode;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'cc:theme-preference';

function readStoredPreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

function systemMode(): ThemeMode {
  if (typeof matchMedia === 'undefined') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemResolved, setSystemResolved] = useState<ThemeMode>(systemMode);

  // Track the OS setting so 'system' stays live rather than sampling once at mount.
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemResolved(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: ThemeMode = preference === 'system' ? systemResolved : preference;

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing can refuse writes; the in-memory preference still applies.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}

/**
 * Scopes a character's mood to a subtree.
 *
 * Only the four accent variables are overridden -- structural tokens are untouchable, which is
 * what keeps per-character theming from affecting legibility.
 */
export function MoodScope({
  mood,
  children,
  className,
}: {
  mood: string;
  children: ReactNode;
  className?: string;
}) {
  const { resolved } = useTheme();
  const style = useMemo(() => moodVariables(mood, resolved) as React.CSSProperties, [mood, resolved]);
  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
