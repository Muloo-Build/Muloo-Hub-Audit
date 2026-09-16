import type { AuditResults } from '@/app/utils/audit-engine';
import type { Lead } from './lead';

/*
 * Write the audit back to the Muloo portal, on the contact the site's form
 * created. Upsert by email, so a visitor who somehow skipped the form still
 * becomes a contact rather than a lost lead. Properties live in the
 * "Muloo lead magnets" group. Never throws: a failed write-back must not cost
 * the visitor their report.
 */
const TOKEN = () => process.env.MULOO_HUBSPOT_TOKEN || '';

export interface PortalInfo { hubId?: number; hubDomain?: string; userEmail?: string }

export async function getPortalInfo(accessToken: string): Promise<PortalInfo> {
    try {
        const r = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`);
        if (!r.ok) return {};
        const d = await r.json();
        return { hubId: d.hub_id, hubDomain: d.hub_domain, userEmail: typeof d.user === 'string' ? d.user.toLowerCase() : undefined };
    } catch { return {}; }
}

export async function writeAuditToMuloo(opts: { lead: Lead | null; portal: PortalInfo; results?: AuditResults; failed?: boolean }): Promise<boolean> {
    const token = TOKEN();
    const email = opts.lead?.e || opts.portal.userEmail;
    if (!token || !email) {
        console.warn('Audit write-back skipped:', !token ? 'MULOO_HUBSPOT_TOKEN not set' : 'no email');
        return false;
    }
    const issues = (opts.results?.metrics || [])
        .filter(m => m.status !== 'success')
        .map(m => `${m.status === 'error' ? 'Critical' : 'Warning'}: ${m.title}. ${m.description}`)
        .join('\n');
    const properties: Record<string, string> = {
        email,
        muloo_audit_status: opts.failed ? 'failed' : 'completed',
    };
    if (opts.lead?.f) properties.firstname = opts.lead.f;
    if (opts.lead?.l) properties.lastname = opts.lead.l;
    if (opts.lead?.c) properties.company = opts.lead.c;
    if (opts.portal.hubId) properties.muloo_audit_portal_id = String(opts.portal.hubId);
    if (opts.portal.hubDomain) properties.muloo_audit_portal_domain = opts.portal.hubDomain;
    if (opts.results) {
        properties.muloo_audit_score = String(opts.results.overallScore);
        properties.muloo_audit_completed_at = new Date().toISOString();
        properties.muloo_audit_top_issues = issues || 'No issues found';
    }
    try {
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: [{ idProperty: 'email', id: email, properties }] }),
        });
        if (!r.ok) console.error('Audit write-back failed:', r.status, await r.text());
        return r.ok;
    } catch (e) {
        console.error('Audit write-back exception:', e);
        return false;
    }
}
