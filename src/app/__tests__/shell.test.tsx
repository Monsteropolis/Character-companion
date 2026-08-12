// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { CharacterCompanionDb, setDb } from '../../persistence/db';
import { ThemeProvider } from '../../ui/theme/ThemeProvider';
import { AppShell } from '../AppShell';
import { ErrorBoundary } from '../ErrorBoundary';

/**
 * The shell's job beyond layout: keep keyboard users oriented, say when the app is offline, and
 * stop one broken route from taking the others down with it.
 */

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`shell-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Boom(): never {
  throw new Error('this route is broken');
}

function renderShell(initial = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route
              index
              element={
                <div>
                  <p>Home content</p>
                  <Link to="/other">Go to other</Link>
                </div>
              }
            />
            <Route path="other" element={<p>Other content</p>} />
            <Route path="boom" element={<Boom />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('app shell', () => {
  it('offers a skip link that targets the content region', async () => {
    renderShell();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(document.getElementById('main-content')).not.toBeNull();
  });

  it('moves focus to the content region when the route changes', async () => {
    renderShell();
    // Nothing is stolen on arrival.
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(screen.getByRole('link', { name: 'Go to other' }));
    await waitFor(() => expect(screen.getByText('Other content')).toBeDefined());
    await waitFor(() => expect(document.activeElement?.id).toBe('main-content'));
  });

  it('says it is offline, and says the app still works', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    renderShell();
    await waitFor(() => expect(screen.getByText(/Offline/)).toBeDefined());
    expect(screen.getByText(/everything still works/i)).toBeDefined();
  });

  it('recovers when connectivity returns', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    renderShell();
    await waitFor(() => expect(screen.getByText(/Offline/)).toBeDefined());

    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    fireEvent(window, new Event('online'));
    await waitFor(() => expect(screen.queryByText(/Offline/)).toBeNull());
  });
});

describe('error containment', () => {
  it('catches a crashing route instead of blanking the app', async () => {
    // React logs the caught error; that is expected and not a test failure.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ThemeProvider>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    spy.mockRestore();
  });
});
