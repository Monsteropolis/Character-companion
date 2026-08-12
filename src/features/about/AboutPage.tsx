import { Panel } from '../../ui/primitives';
import { srdCoverage } from '../../rules/collections';

/**
 * About and legal.
 *
 * Carries the CC-BY attribution the SRD licence requires, and -- just as importantly -- states
 * the content limits up front. A player who cannot find their background needs to learn that
 * the SRD only contains Acolyte, rather than concluding the app is broken.
 */
export function AboutPage() {
  const gaps = Object.entries(srdCoverage).filter(([, v]) => v && !v.complete);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="display-face mb-6 text-2xl font-semibold">About</h1>

      <Panel className="mb-4 p-5">
        <h2 className="display-face mb-2 text-lg font-semibold">What rules are included</h2>
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          This app uses the D&amp;D 5e 2014 ruleset, drawn from the System Reference Document
          (SRD 5.1). The SRD is the portion of the rules published under an open licence — it is
          a subset of the Player&apos;s Handbook, so some content is missing by law rather than
          by oversight.
        </p>
        <ul className="space-y-2 text-sm">
          {gaps.map(([key, value]) => (
            <li key={key} className="flex gap-2">
              <span className="font-medium capitalize">{key.replace('-', ' ')}:</span>
              <span className="text-[var(--text-muted)]">{value?.note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Anything missing can be added yourself as homebrew content, and it will work everywhere
          official content works.
        </p>
      </Panel>

      <Panel className="mb-4 p-5">
        <h2 className="display-face mb-2 text-lg font-semibold">Your data</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Characters are stored on this device only. Nothing is uploaded anywhere. Use Export on
          the character screen to back up or move your characters — that file is the complete
          record, including portraits and homebrew.
        </p>
      </Panel>

      <Panel className="p-5">
        <h2 className="display-face mb-2 text-lg font-semibold">Licences and attribution</h2>
        <p className="mb-2 text-sm text-[var(--text-muted)]">
          This work includes material from the System Reference Document 5.1 (&ldquo;SRD
          5.1&rdquo;) by Wizards of the Coast LLC, available under the Creative Commons
          Attribution 4.0 International License.
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Rules data is sourced from the MIT-licensed{' '}
          <a
            className="underline decoration-[var(--accent)] underline-offset-2"
            href="https://github.com/5e-bits/5e-database"
            target="_blank"
            rel="noreferrer noopener"
          >
            5e-bits/5e-database
          </a>{' '}
          project. This application is unofficial and not affiliated with or endorsed by Wizards
          of the Coast. Homebrew content you create belongs to you.
        </p>
      </Panel>
    </div>
  );
}
