'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './report.module.css';
import { CATEGORIES, CHECK_BY_ID, NOT_COVERED, describe, rank, verdict, type AuditRun, type CheckResult } from '@/app/lib/checks';

const GATE_URL = process.env.NEXT_PUBLIC_MULOO_GATE_URL || 'https://www.wearemuloo.com/hubspot-audit';
const BOOK_URL = process.env.NEXT_PUBLIC_MULOO_BOOK_URL || 'https://www.wearemuloo.com/book-a-call';

const REASONS: Record<string, string> = {
    'not-connected': 'HubSpot access was not approved, so there was nothing to score.',
    expired: 'The connection took too long or was opened in another tab. Start it again.',
    token: 'HubSpot did not hand back access. This is usually a permissions issue on the portal: you need to be a super admin, or have app install rights.',
    audit: 'We connected, but the checks could not finish. We have been notified.',
};

const LABEL: Record<CheckResult['status'], string> = { fail: 'Critical', warn: 'Warning', pass: 'Passed', skip: 'Not checked' };

function band(score: number) { return score >= 85 ? styles.good : score >= 60 ? styles.mid : styles.low; }

function Finding({ r }: { r: CheckResult }) {
    const { def, text } = describe(r);
    return (
        <article className={`${styles.finding} ${styles[r.status]}`}>
            <header className={styles.findingHead}>
                <span className={`mono ${styles.pill} ${styles[r.status]}`}>{LABEL[r.status]}</span>
                <span className={`mono ${styles.cat}`}>{CATEGORIES.find(c => c.id === def.category)?.label}</span>
            </header>
            <h3>{def.title}</h3>
            <p className={styles.result}>{text}</p>
            <p className={styles.why}>{def.why}</p>
            <div className={styles.fix}><strong>The fix.</strong> {def.fix}</div>
        </article>
    );
}

function ReportContent() {
    const params = useSearchParams();
    const status = params.get('status');
    const [data, setData] = useState<{ run: AuditRun; firstName: string; company: string } | null>(null);
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        if (status !== 'success') return;
        fetch('/api/report', { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : Promise.reject()))
            .then(setData)
            .catch(() => setMissing(true));
    }, [status]);

    if (status !== 'success' || missing) {
        const reason = missing
            ? 'This report has expired, or it was opened on a different browser. Reports stay on the device that ran them for seven days.'
            : REASONS[params.get('reason') || ''] || 'There was an issue connecting to your HubSpot portal.';
        return (
            <div className={styles.state}>
                <p className="mono eyebrow">Free portal score</p>
                <h1>{missing ? 'We cannot find that report' : 'The score did not complete'}</h1>
                <p>{reason}</p>
                <div className={styles.actions}>
                    <a href="/start" className="btn-primary">Run it again</a>
                    <a href={BOOK_URL} className="btn-ghost">Talk to a specialist instead</a>
                </div>
            </div>
        );
    }

    if (!data) return <p className={styles.loading}>Opening your report…</p>;

    const { run, firstName, company } = data;
    const ranked = rank(run.checks);
    const issues = ranked.filter(c => c.status === 'fail' || c.status === 'warn');
    const passed = ranked.filter(c => c.status === 'pass');
    const skipped = ranked.filter(c => c.status === 'skip');
    const count = (s: CheckResult['status']) => run.checks.filter(c => c.status === s).length;
    const v = verdict(run.score);
    const date = new Date(run.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <p className="mono eyebrow">Free portal score</p>
                    <h1>{firstName ? `${firstName}, here is your portal score.` : 'Here is your portal score.'}</h1>
                    <p className={styles.meta}>{[company, run.portalDomain, run.hubId ? `Hub ID ${run.hubId}` : '', date].filter(Boolean).join('  ·  ')}</p>
                </div>
                <a className="btn-primary" href="/api/report/pdf" download>Download the PDF</a>
            </header>

            <section className={styles.scorePanel} aria-label="Score">
                <div className={`${styles.ring} ${band(run.score)}`} style={{ ['--p' as string]: run.score }}>
                    <span className={styles.scoreValue}>{run.score}</span>
                    <span className={`mono ${styles.scoreOf}`}>out of 100</span>
                </div>
                <div className={styles.scoreText}>
                    <h2 className={band(run.score)}>{v.label}</h2>
                    <p>{v.line}</p>
                    <ul className={styles.tally}>
                        <li><b className={styles.failText}>{count('fail')}</b> critical</li>
                        <li><b className={styles.warnText}>{count('warn')}</b> warnings</li>
                        <li><b className={styles.passText}>{count('pass')}</b> passed</li>
                    </ul>
                </div>
                <ul className={styles.cats}>
                    {CATEGORIES.map(c => {
                        const rs = run.checks.filter(r => CHECK_BY_ID[r.id]?.category === c.id && r.status !== 'skip');
                        if (!rs.length) return null;
                        const pts = rs.reduce((a, r) => a + (r.status === 'pass' ? 1 : r.status === 'warn' ? 0.5 : 0), 0);
                        const p = Math.round((pts / rs.length) * 100);
                        return (
                            <li key={c.id}>
                                <span className={styles.catLabel}>{c.label}</span>
                                <span className={styles.bar}><span className={band(p)} style={{ width: `${Math.max(p, 4)}%` }} /></span>
                                <span className={`mono ${styles.catPct}`}>{p}</span>
                            </li>
                        );
                    })}
                </ul>
            </section>

            {issues.length > 0 && (
                <section className={styles.block}>
                    <h2>What to fix, worst first</h2>
                    <div className={styles.findings}>{issues.map(r => <Finding key={r.id} r={r} />)}</div>
                </section>
            )}

            {passed.length > 0 && (
                <section className={styles.block}>
                    <h2>What passed</h2>
                    <ul className={styles.passList}>
                        {passed.map(r => <li key={r.id}><strong>{CHECK_BY_ID[r.id].title}.</strong> {describe(r).text}</li>)}
                    </ul>
                </section>
            )}

            {skipped.length > 0 && (
                <p className={styles.skipNote}>
                    Not checked: {skipped.map(r => CHECK_BY_ID[r.id].title.toLowerCase()).join(', ')}. Usually that means there were no records of that kind, or the connecting user could not see them. Unchecked items do not count towards the score.
                </p>
            )}

            <section className={styles.upsell}>
                <div>
                    <p className="mono eyebrow">What this score cannot see</p>
                    <h2>Thirteen checks is the surface. The HubSpot Audit goes underneath.</h2>
                    <p>The free score reads counts and settings. The full audit runs 58 checks with root cause analysis and sector benchmarking, and you get downloadable findings with a guide to fixing them yourself. Once off, findings within five working days.</p>
                    <div className={styles.actions}>
                        <a className="btn-primary" href={GATE_URL}>See the HubSpot Audit</a>
                        <a className="btn-ghost" href={BOOK_URL}>Book a call instead</a>
                    </div>
                </div>
                <ul className={styles.notCovered}>
                    {NOT_COVERED.map(x => <li key={x}>{x}</li>)}
                </ul>
            </section>
        </div>
    );
}

export default function ReportPage() {
    return (
        <main className={styles.pageWrapper}>
            <Suspense fallback={<p className={styles.loading}>Opening your report…</p>}>
                <ReportContent />
            </Suspense>
        </main>
    );
}
