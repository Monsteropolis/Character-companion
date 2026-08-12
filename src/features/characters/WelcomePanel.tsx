import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Button } from '../../ui/primitives';
import { meta } from '../../persistence/repositories';

const DISMISSED_KEY = 'onboarding:welcome-dismissed';

/**
 * First-run orientation.
 *
 * Three things a new player has to know before they are surprised by them, and no more than
 * three: where their data lives, that the SRD is a subset of the rules, and that the gap has a
 * door marked Homebrew. The content limit is the single most likely reason someone bounces off
 * this app ("where is my class?"), so it is said plainly on the first screen rather than
 * discovered halfway through building a character.
 *
 * Dismissal is stored, not sessioned: being told again on every visit is its own annoyance.
 */
export function WelcomePanel() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    void meta.get<boolean>(DISMISSED_KEY).then((value) => setDismissed(value === true));
  }, []);

  // Render nothing until the answer is known, so the panel never flashes for a returning user.
  if (dismissed !== false) return null;

  async function dismiss() {
    setDismissed(true);
    await meta.set(DISMISSED_KEY, true);
  }

  return (
    <Panel className="mb-4 p-4">
      <h2 className="display-face mb-2 font-semibold">Before you start</h2>

      <ul className="space-y-2 text-sm text-[var(--text-muted)]">
        <li>
          <strong className="text-[var(--text)]">Everything stays on this device.</strong> There is
          no account and nothing is uploaded. Use <em>Export all</em> for a backup you can move to
          another device or hand to your DM.
        </li>
        <li>
          <strong className="text-[var(--text)]">The bundled rules are the SRD</strong> — the
          portion Wizards of the Coast licenses freely. That is 12 classes and 9 races in full, but
          only 1 background, 1 feat, 12 subclasses and 4 subraces. Your Battle Master, your Sailor
          background and your Half-Elf variant are not in it, and no rules API has them either.
        </li>
        <li>
          <strong className="text-[var(--text)]">Anything missing, you can add.</strong>{' '}
          <Link to="/custom" className="underline">
            Homebrew
          </Link>{' '}
          takes classes, races, backgrounds, feats, spells and items — typed in or imported as
          JSON — and they appear everywhere SRD content does.
        </li>
      </ul>

      <div className="mt-3">
        <Button variant="secondary" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </Panel>
  );
}
