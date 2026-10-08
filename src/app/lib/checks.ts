/*
 * The check catalogue. One source for the on-screen report, the PDF and the
 * write-back to the Muloo portal. The engine only produces numbers and a
 * status per check; every word a prospect reads lives here, so copy changes
 * never touch the engine.
 *
 * Keep it honest: the free score only claims what the read-only scopes can
 * actually see. Anything it cannot see belongs in NOT_COVERED, which is the
 * case for the paid HubSpot Audit.
 */

export type Status = 'pass' | 'warn' | 'fail' | 'skip';

export interface CheckResult {
    id: string;
    status: Status;
    /** The count that triggered the status (contacts, deals, properties, users). */
    value?: number;
    /** What the count is out of, when a share makes sense. */
    total?: number;
}

export interface AuditRun {
    v: 2;
    score: number;
    at: string;
    portalDomain?: string;
    hubId?: number;
    checks: CheckResult[];
}

export type CategoryId = 'data' | 'ownership' | 'pipeline' | 'governance' | 'model' | 'attribution';

export const CATEGORIES: { id: CategoryId; label: string; weight: number }[] = [
    { id: 'data', label: 'Data quality', weight: 1 },
    { id: 'ownership', label: 'Ownership and routing', weight: 1.5 },
    { id: 'pipeline', label: 'Pipeline and forecast', weight: 1.25 },
    { id: 'governance', label: 'Access and governance', weight: 1.5 },
    { id: 'model', label: 'Data model', weight: 0.75 },
    { id: 'attribution', label: 'Attribution', weight: 0.75 },
];

export interface CheckDef {
    id: string;
    category: CategoryId;
    title: string;
    /** Why it matters, in one sentence. */
    why: string;
    /** Finding line. `n` is the count, `t` the total, `p` the share as a whole percentage. */
    finding: (n: number, t: number, p: number) => string;
    pass: string;
    fix: string;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export const CHECKS: CheckDef[] = [
    {
        id: 'contacts_unowned', category: 'ownership', title: 'Contacts with no owner',
        why: 'A contact with no owner is a lead nobody is accountable for. It does not get followed up and it does not show up in anyone’s reports.',
        finding: (n, t, p) => `${plural(n, 'contact has', 'contacts have')} no owner: ${p}% of ${t.toLocaleString('en-GB')}.`,
        pass: 'Every contact has an owner.',
        fix: 'Build an active list of contacts where Contact owner is unknown and bulk assign them. Then add an owner rotation to the workflow that runs when a form is submitted, so new leads never land unowned.',
    },
    {
        id: 'deals_unowned', category: 'ownership', title: 'Open deals with no owner',
        why: 'Unowned deals fall out of every rep’s pipeline view and out of the forecast.',
        finding: (n, t, p) => `${plural(n, 'open deal has', 'open deals have')} no owner: ${p}% of ${t.toLocaleString('en-GB')} open deals.`,
        pass: 'Every open deal has an owner.',
        fix: 'Filter the deals board by Deal owner is unknown, assign each one, and make Deal owner required on deal creation in the pipeline settings.',
    },
    {
        id: 'deals_past_close', category: 'pipeline', title: 'Open deals past their close date',
        why: 'A close date in the past on an open deal means the forecast is counting money that has already not arrived.',
        finding: (n, t, p) => `${plural(n, 'open deal is', 'open deals are')} past the close date: ${p}% of open deals.`,
        pass: 'No open deals are past their close date.',
        fix: 'Have each owner either move the close date or close the deal lost. Then add a workflow that creates a task for the owner the day a close date passes on an open deal.',
    },
    {
        id: 'deals_stale', category: 'pipeline', title: 'Open deals with no activity in 90 days',
        why: 'Deals nobody has touched in a quarter are usually dead. Left open, they inflate the pipeline and hide the deals that need attention.',
        finding: (n, t, p) => `${plural(n, 'open deal has', 'open deals have')} had no logged activity in 90 days: ${p}% of open deals.`,
        pass: 'Every open deal has had activity in the last 90 days.',
        fix: 'Review the list with each rep and close lost with a reason. Add a Stalled reason to your closed lost options and a workflow that alerts the manager when an open deal goes 60 days without activity.',
    },
    {
        id: 'deals_no_amount', category: 'pipeline', title: 'Open deals with no amount',
        why: 'A deal with no amount adds nothing to the forecast, so pipeline value is understated and coverage ratios mean nothing.',
        finding: (n, t, p) => `${plural(n, 'open deal has', 'open deals have')} no amount: ${p}% of open deals.`,
        pass: 'Every open deal carries an amount.',
        fix: 'Make Amount required when a deal enters the stage where pricing is known, using the pipeline’s conditional stage properties.',
    },
    {
        id: 'contacts_no_email', category: 'data', title: 'Contacts with no email address',
        why: 'Without an email a contact cannot be marketed to, deduplicated or matched to a company automatically.',
        finding: (n, t, p) => `${plural(n, 'contact has', 'contacts have')} no email address: ${p}% of contacts.`,
        pass: 'Every contact has an email address.',
        fix: 'Find the source first: usually an import or an integration creating contacts from phone or chat. Fix the source, then enrich or archive the records that are left.',
    },
    {
        id: 'contacts_no_lifecycle', category: 'data', title: 'Contacts with no lifecycle stage',
        why: 'Lifecycle stage is how HubSpot knows a lead from a customer. Without it, funnel reporting and lead handover do not work.',
        finding: (n, t, p) => `${plural(n, 'contact has', 'contacts have')} no lifecycle stage: ${p}% of contacts.`,
        pass: 'Every contact has a lifecycle stage.',
        fix: 'Agree the stage definitions with sales and marketing, backfill the blanks with a single workflow, and set a default stage on every form and import.',
    },
    {
        id: 'contacts_no_company', category: 'data', title: 'Contacts not linked to a company',
        why: 'In B2B, a contact with no company is invisible to account reporting, deal association and account based marketing.',
        finding: (n, t, p) => `${plural(n, 'contact is', 'contacts are')} not linked to a company: ${p}% of contacts.`,
        pass: 'Contacts are linked to companies.',
        fix: 'Switch on automatic company creation and association from email domain in Settings, Objects, Companies. Then review the free email domains (Gmail and the like) separately.',
    },
    {
        id: 'super_admins', category: 'governance', title: 'Super admin access',
        why: 'Super admins can export every record, delete data and change billing. The fewer people who hold it, the smaller the blast radius of one mistake or one compromised login.',
        finding: (n, t) => `${n} of ${plural(t, 'user is a', 'users are')} super admin${n === 1 ? '' : 's'}.`,
        pass: 'Super admin access is limited to a few people.',
        fix: 'Keep super admin to two named people. Move everyone else to a permission set that matches their job, and switch off export rights for anyone who does not need them.',
    },
    {
        id: 'contact_props_sprawl', category: 'model', title: 'Custom contact properties',
        why: 'Every extra property is another field on the record, another option in every filter, and another thing to keep in step with your forms and integrations.',
        finding: (n) => `${plural(n, 'custom contact property', 'custom contact properties')}.`,
        pass: 'The contact data model is a manageable size.',
        fix: 'In Settings, Properties, filter to Custom and sort by usage. Archive anything with no values and nothing depending on it, and merge the near duplicates.',
    },
    {
        id: 'props_undocumented', category: 'model', title: 'Custom properties with no description',
        why: 'An undocumented property is one only its creator understands. When they leave, nobody knows what it means or whether it is safe to change.',
        finding: (n, t, p) => `${plural(n, 'custom property has', 'custom properties have')} no description: ${p}% of ${t.toLocaleString('en-GB')} custom properties checked.`,
        pass: 'Custom properties are documented.',
        fix: 'Give every custom property a short description saying what it is for and what writes to it. Start with the ones used in workflows and reports.',
    },
    {
        id: 'props_duplicate_labels', category: 'model', title: 'Properties with duplicate labels',
        why: 'Two properties with the same label on the same object means forms, reports and integrations quietly write to different fields.',
        finding: (n) => `${plural(n, 'property shares', 'properties share')} a label with another property on the same object.`,
        pass: 'No duplicate property labels.',
        fix: 'Pick the property each workflow, form and integration should use, migrate the values across, and archive the other one.',
    },
    {
        id: 'contacts_offline_source', category: 'attribution', title: 'Contacts with an offline source',
        why: 'Offline source covers imports, integrations and records created by hand. A high share means you cannot tell which channels produce your leads.',
        finding: (n, t, p) => `${plural(n, 'contact is', 'contacts are')} attributed to offline sources: ${p}% of contacts.`,
        pass: 'Most contacts carry a trackable source.',
        fix: 'Make sure every website form is a HubSpot form or uses the HubSpot tracking code, and pass UTM parameters on every campaign link. Imports will always be offline; integrations should set the original source drill down.',
    },
];

export const CHECK_BY_ID: Record<string, CheckDef> = Object.fromEntries(CHECKS.map(c => [c.id, c]));

/** What the free score cannot see. This is the honest case for the paid audit. */
export const NOT_COVERED = [
    'Workflows that error, loop or that nobody owns',
    'Paid seats nobody logs into',
    'Duplicate contacts and companies',
    'Integration sync errors and field mapping',
    'Dashboards and reports that disagree with each other',
    'Lead scoring, routing rules and SLA handover',
];

const pct = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 100) : 0);

export function describe(r: CheckResult) {
    const def = CHECK_BY_ID[r.id];
    const n = r.value ?? 0, t = r.total ?? 0;
    return {
        def,
        text: r.status === 'skip' ? 'Not checked on this portal.' : r.status === 'pass' ? def.pass : def.finding(n, t, pct(n, t)),
    };
}

export const POINTS: Record<Exclude<Status, 'skip'>, number> = { pass: 1, warn: 0.5, fail: 0 };

/** Weighted score out of 100 across the checks that actually ran. */
export function scoreRun(checks: CheckResult[]): number {
    let got = 0, max = 0;
    for (const r of checks) {
        if (r.status === 'skip') continue;
        const def = CHECK_BY_ID[r.id];
        const w = CATEGORIES.find(c => c.id === def?.category)?.weight ?? 1;
        got += w * POINTS[r.status];
        max += w;
    }
    return max > 0 ? Math.round((got / max) * 100) : 0;
}

export function verdict(score: number) {
    if (score >= 85) return { label: 'In good shape', line: 'The basics are sound. The findings below are the edges worth tidying before they grow.' };
    if (score >= 60) return { label: 'Worth fixing', line: 'Your portal runs, but it is leaking time and trust. Each finding below comes with the fix.' };
    return { label: 'Action needed', line: 'The data your team relies on is not reliable yet. Start with the critical findings: each one comes with the fix.' };
}

/** Findings worst first, then by category order. */
export function rank(checks: CheckResult[]) {
    const order: Record<Status, number> = { fail: 0, warn: 1, pass: 2, skip: 3 };
    const cat = (id: string) => CATEGORIES.findIndex(c => c.id === CHECK_BY_ID[id]?.category);
    return [...checks].filter(c => CHECK_BY_ID[c.id]).sort((a, b) => order[a.status] - order[b.status] || cat(a.id) - cat(b.id));
}
