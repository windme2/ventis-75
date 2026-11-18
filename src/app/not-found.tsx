import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Page not found · Ventis-75' };

/** Unknown URLs land on the studio backdrop with three keycaps instead of the default white page. */
export default function NotFound() {
  return (
    <div className="app">
      <div className="backdrop" aria-hidden />
      <main className="lost">
        <div className="lost-keys" aria-hidden>
          <span className="lost-key">4</span>
          <span className="lost-key">0</span>
          <span className="lost-key">4</span>
        </div>
        <h2>Wrong key</h2>
        <p>There is nothing at this address. The keyboard is back on the main page.</p>
        <Link className="button" href="/">
          Back to Ventis-75
        </Link>
      </main>
    </div>
  );
}
