'use client';

import { useEffect, useState } from 'react';
import styles from './page.module.css';

/*
 * Start page. The lead was captured by the HubSpot form on the Muloo site and
 * arrives in the URL fragment. We hold it server side for the OAuth round
 * trip and clear it from the address bar. Anyone who arrives without one is
 * sent to the site's form: one gate, and it lives in HubSpot.
 */
const GATE_URL = process.env.NEXT_PUBLIC_MULOO_GATE_URL || 'https://build.wearemuloo.com/hubspot-audit';
const BOOK_URL = process.env.NEXT_PUBLIC_MULOO_BOOK_URL || 'https://build.wearemuloo.com/book-a-call';

function readFragmentLead(): Record<string, string> | null {
  const match = window.location.hash.match(/(?:^#|&)mu=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(window.atob(b64 + '==='.slice((b64.length + 3) % 4))));
    return JSON.parse(json);
  } catch { return null; }
}

export default function Start() {
  const [state, setState] = useState<'checking' | 'ready'>('checking');
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lead = readFragmentLead();
      if (lead) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        const r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) { setFirstName(d.firstName || ''); setState('ready'); }
          return;
        }
      }
      const r = await fetch('/api/lead', { cache: 'no-store' });
      const d = r.ok ? await r.json() : { hasLead: false };
      if (d.hasLead) {
        if (!cancelled) { setFirstName(d.firstName || ''); setState('ready'); }
      } else {
        window.location.replace(GATE_URL);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className={styles.wrap}>
      <section className={styles.copy}>
        <p className={`mono ${styles.eyebrow}`}>Free HubSpot audit</p>
        <h1>{firstName ? <>{firstName}, one step left. <span className="text-gradient">Connect your portal.</span></> : <>Connect your portal and <span className="text-gradient">see what is wrong with it.</span></>}</h1>
        <p className={styles.lead}>The audit runs live against your own HubSpot data, so the score is about your portal, not a benchmark. It takes about a minute.</p>
        <ul className={styles.checks}>
          <li>Leads with no owner, and what that does to routing</li>
          <li>Who holds super admin, and whether they should</li>
          <li>Custom property sprawl on contacts</li>
          <li>Deals that have stalled in the pipeline</li>
          <li>Contacts arriving with no attributable source</li>
        </ul>
      </section>

      <section className={styles.card} aria-live="polite">
        {state === 'checking' ? (
          <p className={styles.loading}>Checking your details…</p>
        ) : (
          <>
            <h2>Connect HubSpot</h2>
            <p>You approve access on HubSpot&apos;s own screen. Nothing is changed in your portal.</p>
            <ol className={styles.steps}>
              <li><span><strong>Approve read only access.</strong> Contacts, deals, company properties and users.</span></li>
              <li><span><strong>We run the checks.</strong> Live, against your data, in about a minute.</span></li>
              <li><span><strong>Your report opens.</strong> Score, findings and the fix for each one.</span></li>
            </ol>
            <a className={`btn-primary ${styles.btn}`} href="/api/auth/hubspot">Connect HubSpot and run the audit</a>
            <p className={`mono ${styles.note}`}>You need to be a HubSpot super admin, or have app install rights.</p>
            <p className={styles.alt}>Would rather not connect it? <a href={BOOK_URL}>Book thirty minutes with Jarrud</a> and we will walk through it with you.</p>
          </>
        )}
      </section>
    </main>
  );
}
