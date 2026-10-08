import { describe, rank, type AuditRun } from './checks';
import type { Lead } from './lead';

/*
 * Write the audit back to the Muloo portal, on the contact the site's form
 * created. Upsert by email, so a visitor who somehow skipped the form still
 * becomes a contact rather than a lost lead. Properties live in the
 * "Muloo lead magnets" group. Never throws: a failed write-back must not cost
 * the visitor their report.
 *
 * Only audit properties are written. Name and company are left alone: the
 * HubSpot form already set them, and the lead in the fragment is not signed,
 * so writing them here would let anyone rename an existing contact.
 */
const TOKEN = () => process.env.MULOO_HUBSPOT_TOKEN || '';

export interface PortalInfo { hubId?: number; hubDomain?: string; userEmail?: string }

export async function getPortalInfo(accessToken: string): Promise<PortalInfo> {
    try {
        const r = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) return {};
        const d = await r.json();
        return { hubId: d.hub_id, hubDomain: d.hub_domain, userEmail: typeof d.user === 'string' ? d.user.toLowerCase() : undefined };
    } catch { return {}; }
}

/** Plain text summary of the findings, worst first, for the contact record and the follow up email. */
export function topIssues(run: AuditRun, max = 5): string {
    const lines = rank(run.checks)
        .filter(c => c.status === 'fail' || c.status === 'warn')
        .slice(0, max)
        .map(c => `${c.status === 'fail' ? 'Critical' : 'Warning'}: ${describe(c).text}`);
    return lines.length ? lines.join('\n') : 'No issues found';
}

export async function writeAuditToMuloo(opts: { lead: Lead | null; portal: PortalInfo; run?: AuditRun; failed?: boolean }): Promise<boolean> {
    const token = TOKEN();
    const email = opts.lead?.e || opts.portal.userEmail;
    if (!token || !email) {
        console.warn('Audit write-back skipped:', !token ? 'MULOO_HUBSPOT_TOKEN not set' : 'no email');
        return false;
    }
    const properties: Record<string, string> = {
        email,
        muloo_audit_status: opts.failed ? 'failed' : 'completed',
    };
    if (opts.portal.hubId) properties.muloo_audit_portal_id = String(opts.portal.hubId);
    if (opts.portal.hubDomain) properties.muloo_audit_portal_domain = opts.portal.hubDomain;
    if (opts.run) {
        properties.muloo_audit_score = String(opts.run.score);
        properties.muloo_audit_completed_at = opts.run.at;
        properties.muloo_audit_top_issues = topIssues(opts.run);
    }
    try {
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: [{ idProperty: 'email', id: email, properties }] }),
            signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) console.error('Audit write-back failed:', r.status, await r.text());
        return r.ok;
    } catch (e) {
        console.error('Audit write-back exception:', e);
        return false;
    }
}

/*
 * Hand access back. The gate page promises access ends when the run
 * finishes, so once the checks are done we uninstall the app from the
 * visitor's portal (HubSpot emails their admins to confirm). Best effort:
 * the access token expires within 30 minutes regardless, and the refresh
 * token is never stored. Set AUDIT_KEEP_INSTALL=true to switch this off.
 */
export async function releaseAccess(accessToken: string): Promise<void> {
    if (process.env.AUDIT_KEEP_INSTALL === 'true') return;
    try {
        const r = await fetch('https://api.hubapi.com/appinstalls/v3/external-install', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(10000),
        });
        if (!r.ok && r.status !== 204) console.warn('Uninstall after audit failed:', r.status);
    } catch (e) { console.warn('Uninstall after audit exception:', e); }
}
