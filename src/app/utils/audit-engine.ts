import { CheckResult, Status, scoreRun, type AuditRun } from '@/app/lib/checks';

/*
 * The audit engine. Read only, against the visitor's own portal, using only
 * the scopes the Muloo audit app already requests:
 *   crm.objects.contacts.read, crm.objects.deals.read,
 *   crm.schemas.companies.read, settings.users.read, oauth
 *
 * Every check runs on its own. One that fails (a missing scope, a timeout, a
 * portal with no deals) is marked skip and left out of the score, so a single
 * error can never hand someone a flattering 100.
 *
 * It reads counts and property definitions only. No record is stored.
 */

const API = 'https://api.hubapi.com';
const DAY = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Filter = { propertyName: string; operator: string; value?: string };

class Hub {
    constructor(private token: string) { }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HubSpot response shapes vary by endpoint
    async req(path: string, init?: RequestInit, attempt = 0): Promise<any> {
        const r = await fetch(`${API}${path}`, {
            ...init,
            headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
            signal: AbortSignal.timeout(15000),
        });
        // Search is limited to a few requests a second per portal. Back off and retry.
        if (r.status === 429 && attempt < 3) {
            await sleep(1100 * (attempt + 1));
            return this.req(path, init, attempt + 1);
        }
        if (!r.ok) throw new Error(`${path} ${r.status}`);
        return r.json();
    }

    /** Count records matching any of the filter groups. */
    async count(object: 'contacts' | 'deals', groups: Filter[][]): Promise<number> {
        await sleep(220);
        const body = { filterGroups: groups.map(filters => ({ filters })), limit: 1, properties: ['hs_object_id'] };
        const d = await this.req(`/crm/v3/objects/${object}/search`, { method: 'POST', body: JSON.stringify(body) });
        return Number(d.total) || 0;
    }

    /** Total records of an object, via a search that matches everything. */
    async total(object: 'contacts' | 'deals'): Promise<number> {
        return this.count(object, [[{ propertyName: 'hs_object_id', operator: 'HAS_PROPERTY' }]]);
    }

    async properties(object: 'contacts' | 'companies' | 'deals') {
        const d = await this.req(`/crm/v3/properties/${object}?archived=false`);
        return (d.results || []) as { name: string; label: string; description?: string; hubspotDefined?: boolean; calculated?: boolean }[];
    }
}

/** Grade a share against warn and fail thresholds (both as fractions). */
function byShare(id: string, n: number, t: number, warn: number, fail: number): CheckResult {
    if (t === 0) return { id, status: 'skip' };
    const s = n / t;
    const status: Status = s > fail ? 'fail' : s > warn ? 'warn' : 'pass';
    return { id, status, value: n, total: t };
}

function byCount(id: string, n: number, warn: number, fail: number, total?: number): CheckResult {
    const status: Status = n > fail ? 'fail' : n > warn ? 'warn' : 'pass';
    return { id, status, value: n, total };
}

async function safely(id: string, fn: () => Promise<CheckResult>): Promise<CheckResult> {
    try { return await fn(); } catch (e) {
        console.warn(`Check ${id} skipped:`, e instanceof Error ? e.message : e);
        return { id, status: 'skip' };
    }
}

export async function runAuditEngine(accessToken: string, meta: { hubId?: number; portalDomain?: string } = {}): Promise<AuditRun> {
    const hub = new Hub(accessToken);
    const checks: CheckResult[] = [];
    const now = Date.now();
    const cutoff = String(now - 90 * DAY);

    // Contacts. Totals first, so every share has a denominator.
    let contacts = 0;
    try { contacts = await hub.total('contacts'); } catch (e) { console.warn('Contact total failed:', e); }
    const contactShare = (id: string, filters: Filter[], warn: number, fail: number) =>
        safely(id, async () => contacts ? byShare(id, await hub.count('contacts', [filters]), contacts, warn, fail) : { id, status: 'skip' });

    checks.push(await contactShare('contacts_unowned', [{ propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' }], 0.10, 0.30));
    checks.push(await contactShare('contacts_no_email', [{ propertyName: 'email', operator: 'NOT_HAS_PROPERTY' }], 0.05, 0.15));
    checks.push(await contactShare('contacts_no_lifecycle', [{ propertyName: 'lifecyclestage', operator: 'NOT_HAS_PROPERTY' }], 0.10, 0.30));
    checks.push(await contactShare('contacts_no_company', [{ propertyName: 'associatedcompanyid', operator: 'NOT_HAS_PROPERTY' }], 0.30, 0.60));
    checks.push(await contactShare('contacts_offline_source', [{ propertyName: 'hs_analytics_source', operator: 'EQ', value: 'OFFLINE' }], 0.50, 0.80));

    // Deals. Only open deals count towards the pipeline checks.
    const open: Filter = { propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' };
    let openDeals = 0;
    try { openDeals = await hub.count('deals', [[open]]); } catch (e) { console.warn('Open deal total failed:', e); }
    const dealShare = (id: string, groups: Filter[][], warn: number, fail: number) =>
        safely(id, async () => openDeals ? byShare(id, await hub.count('deals', groups), openDeals, warn, fail) : { id, status: 'skip' });

    checks.push(await dealShare('deals_unowned', [[open, { propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' }]], 0, 0.10));
    checks.push(await dealShare('deals_past_close', [[open, { propertyName: 'closedate', operator: 'LT', value: String(now) }]], 0.05, 0.20));
    const oldEnough: Filter = { propertyName: 'createdate', operator: 'LT', value: cutoff };
    checks.push(await dealShare('deals_stale', [
        [open, oldEnough, { propertyName: 'notes_last_updated', operator: 'LT', value: cutoff }],
        [open, oldEnough, { propertyName: 'notes_last_updated', operator: 'NOT_HAS_PROPERTY' }],
    ], 0.10, 0.30));
    checks.push(await dealShare('deals_no_amount', [[open, { propertyName: 'amount', operator: 'NOT_HAS_PROPERTY' }]], 0.10, 0.30));

    // Users.
    checks.push(await safely('super_admins', async () => {
        const users: { superAdmin?: boolean }[] = [];
        let after: string | undefined;
        for (let page = 0; page < 10; page++) {
            const d = await hub.req(`/settings/v3/users?limit=100${after ? `&after=${after}` : ''}`);
            users.push(...(d.results || []));
            after = d.paging?.next?.after;
            if (!after) break;
        }
        const t = users.length, n = users.filter(u => u.superAdmin).length;
        if (!t) return { id: 'super_admins', status: 'skip' };
        // Two super admins is the sensible floor for cover. Beyond that, judge the share.
        const status: Status = n <= 2 ? 'pass' : n / t > 0.5 ? 'fail' : n / t > 0.25 ? 'warn' : 'pass';
        return { id: 'super_admins', status, value: n, total: t };
    }));

    // Data model.
    const props: Record<string, Awaited<ReturnType<Hub['properties']>> | null> = {};
    for (const o of ['contacts', 'companies', 'deals'] as const) {
        try { props[o] = await hub.properties(o); } catch (e) { props[o] = null; console.warn(`Properties ${o} failed:`, e); }
    }
    const custom = (o: string) => (props[o] || []).filter(p => !p.hubspotDefined);

    checks.push(props.contacts ? byCount('contact_props_sprawl', custom('contacts').length, 100, 250) : { id: 'contact_props_sprawl', status: 'skip' });

    const loaded = (['contacts', 'companies', 'deals'] as const).filter(o => props[o]);
    if (loaded.length) {
        const all = loaded.flatMap(o => custom(o));
        const undocumented = all.filter(p => !p.description || !p.description.trim()).length;
        checks.push(all.length >= 5 ? byShare('props_undocumented', undocumented, all.length, 0.5, 0.8) : { id: 'props_undocumented', status: 'pass', value: undocumented, total: all.length });

        let dupes = 0;
        for (const o of loaded) {
            const seen = new Map<string, number>();
            for (const p of props[o]!) {
                const k = (p.label || '').trim().toLowerCase();
                if (k) seen.set(k, (seen.get(k) || 0) + 1);
            }
            for (const n of seen.values()) if (n > 1) dupes += n;
        }
        checks.push(byCount('props_duplicate_labels', dupes, 0, 6));
    } else {
        checks.push({ id: 'props_undocumented', status: 'skip' }, { id: 'props_duplicate_labels', status: 'skip' });
    }

    return { v: 2, score: scoreRun(checks), at: new Date().toISOString(), hubId: meta.hubId, portalDomain: meta.portalDomain, checks };
}
