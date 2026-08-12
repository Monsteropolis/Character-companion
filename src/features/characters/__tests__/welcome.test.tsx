// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CharacterCompanionDb, setDb } from '../../../persistence/db';
import { meta } from '../../../persistence/repositories';
import { WelcomePanel } from '../WelcomePanel';

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`welcome-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
});

afterEach(cleanup);

function renderPanel() {
  return render(
    <MemoryRouter>
      <WelcomePanel />
    </MemoryRouter>,
  );
}

describe('first-run orientation', () => {
  it('states the three things that surprise people, including the SRD limits', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Before you start')).toBeDefined());

    expect(screen.getByText(/stays on this device/i)).toBeDefined();
    expect(screen.getByText(/1 background, 1 feat, 12 subclasses and 4 subraces/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Homebrew' })).toBeDefined();
  });

  it('stays dismissed across visits', async () => {
    const first = renderPanel();
    await waitFor(() => expect(screen.getByText('Before you start')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await waitFor(async () => expect(await meta.get('onboarding:welcome-dismissed')).toBe(true));
    first.unmount();

    renderPanel();
    // Never rendered at all, rather than rendered and hidden: no flash on a return visit.
    await waitFor(async () =>
      expect(await meta.get('onboarding:welcome-dismissed')).toBe(true),
    );
    expect(screen.queryByText('Before you start')).toBeNull();
  });
});
