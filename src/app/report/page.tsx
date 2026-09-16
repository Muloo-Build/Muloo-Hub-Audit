'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './report.module.css';

const GATE_URL = process.env.NEXT_PUBLIC_MULOO_GATE_URL || 'https://build.wearemuloo.com/hubspot-audit';
const BOOK_URL = process.env.NEXT_PUBLIC_MULOO_BOOK_URL || 'https://build.wearemuloo.com/book-a-call';

const REASONS: Record<string, string> = {
    'not-connected': 'HubSpot access was not approved, so there was nothing to audit.',
    expired: 'The connection took too long or was opened in another tab. Start it again.',
    token: 'HubSpot did not hand back access. This is usually a permissions issue on the portal.',
    audit: 'We connected, but the checks could not finish. We have been notified.',
};

function ReportContent() {
    const searchParams = useSearchParams();
    const status = searchParams.get('status');
    const dataString = searchParams.get('data');
    const [reportDate, setReportDate] = useState('');

    useEffect(() => {
        setReportDate(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
    }, []);

    let auditData = null;
    try {
        if (dataString) {
            auditData = JSON.parse(decodeURIComponent(dataString));
        }
    } catch (e) {
        console.error('Failed to parse audit data from URL');
    }

    const overallScore = auditData?.overallScore ?? 0;
    const metrics = auditData?.metrics ?? [];

    if (status !== 'success') {
        const reason = REASONS[searchParams.get('reason') || ''] || 'There was an issue connecting to your HubSpot portal.';
        return (
            <div className={styles.container}>
                <h2>The audit did not complete</h2>
                <p>{reason}</p>
                <div className={styles.ctaActions}>
                    <a href="/start" className="btn-primary">Try again</a>
                    <a href={BOOK_URL} className="btn-ghost">Talk to Jarrud instead</a>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>Your HubSpot audit</h1>
                <p>Analysed on {reportDate}</p>
            </header>

            <section className={styles.scoreSection}>
                <div className={styles.scoreCircle}>
                    <span className={styles.scoreValue}>{overallScore}</span>
                    <span className={styles.scoreLabel}>/ 100</span>
                </div>
                <div className={styles.scoreText}>
                    <h2>{overallScore >= 85 ? 'In good shape' : overallScore >= 60 ? 'Worth fixing' : 'Action required'}</h2>
                    <p>{overallScore >= 85 ? 'The basics are sound. The findings below are the edges worth tidying before they grow.' : 'Your portal runs, but it is leaking time and trust. Each finding below comes with the fix.'}</p>
                </div>
            </section>

            <section className={styles.resultsGrid}>
                {metrics.map((metric: { title: string; status: 'success' | 'warning' | 'error'; description: string; recommendation?: string }, i: number) => (
                    <div key={i} className={`${styles.resultCard} ${styles[metric.status]}`}>
                        <div className={styles.cardHeader}>
                            <span className={`${styles.statusDot} ${styles[metric.status]}`} aria-label={metric.status === 'success' ? 'Passed' : metric.status === 'warning' ? 'Warning' : 'Critical'} role="img" />
                            <h3>{metric.title}</h3>
                        </div>
                        <p>{metric.description}</p>

                        {/* Render actionable advice if the test did not pass */}
                        {metric.status !== 'success' && metric.recommendation && (
                            <div className={styles.recommendationBox}>
                                <strong>The fix:</strong> {metric.recommendation}
                            </div>
                        )}
                    </div>
                ))}
            </section>

            {/* Educational / Methodology Section */}
            <section className={styles.methodologySection}>
                <div className={styles.methodologyHeader}>
                    <h2>What exactly are we auditing?</h2>
                    <p>This automated check is just the surface. A true HubSpot transformation requires a deep understanding of your commercial goals. Here is our full 4-Step Blueprint methodology:</p>
                </div>

                <div className={styles.stepsGrid}>
                    <div className={styles.stepCard}>
                        <div className={styles.stepNumber}>01</div>
                        <h3>Commercial & Sales Alignment Workshop</h3>
                        <p>We collaborate with leadership to map your 2026 goals, regional sales structures, revenue streams, and handover points. The blueprint must be built around your real-world operations.</p>
                    </div>

                    <div className={styles.stepCard}>
                        <div className={styles.stepNumber}>02</div>
                        <h3>CRM Audit & Data Assessment</h3>
                        <p>A deep dive inside your portal (where automated tools cannot go) to evaluate user adoption, behavioural data, tracking, scoring layers, and the gaps between your current system and future needs.</p>
                    </div>

                    <div className={styles.stepCard}>
                        <div className={styles.stepNumber}>03</div>
                        <h3>System Design & Blueprinting</h3>
                        <p>We produce a structured playbook outlining optimised data architecture, standardised sales methodologies, automation opportunities, and reporting frameworks for leadership to scale across regions.</p>
                    </div>

                    <div className={styles.stepCard}>
                        <div className={styles.stepNumber}>04</div>
                        <h3>Review & Presentation</h3>
                        <p>A dedicated session with your leadership to walk through our findings, priority recommendations, resourcing options, and a clear timeline for getting your CRM right.</p>
                    </div>
                </div>
            </section>

            <section className={styles.ctaSection}>
                <div className={styles.ctaCard}>
                    <h2>Want the rest of the picture?</h2>
                    <p>
                        This automated test identified immediate technical debt, but resolving your core efficiency issues requires a strategic plan.
                        Book a call to talk through the full <strong>HubSpot Blueprint Audit</strong> and get a step-by-step remediation plan built around your business.
                    </p>
                    <div className={styles.ctaActions}>
                        <a className="btn-primary" href={BOOK_URL}>Book thirty minutes with Jarrud</a>
                        <a className="btn-ghost" href={GATE_URL.replace('/hubspot-audit', '/solutions/portal-rescue')}>See portal rescue</a>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default function ReportPage() {
    return (
        <main className={styles.pageWrapper}>
            <Suspense fallback={<div className={styles.loading}>Generating your audit...</div>}>
                <ReportContent />
            </Suspense>
        </main>
    );
}
