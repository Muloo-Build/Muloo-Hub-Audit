import crypto from 'crypto';

/*
 * The lead is captured by the HubSpot form on the Muloo site, never here.
 * The site hands it over in the URL fragment (#mu=<base64 json>), which the
 * browser never sends to a server. The start page posts it to /api/lead,
 * which keeps it in a signed, httpOnly cookie for the length of the OAuth
 * round trip, so the callback knows whose contact record to write back to.
 *
 * Contract, shared with the theme's mu-hero-offer and mu-region-gate:
 *   { f: first name, l: last name, e: email, c: company, s: source path }
 */
export interface Lead { f: string; l: string; e: string; c: string; s: string }

export const LEAD_COOKIE = 'mu_lead';
export const STATE_COOKIE = 'mu_oauth_state';

const secret = () => process.env.AUDIT_COOKIE_SECRET || process.env.HUBSPOT_CLIENT_SECRET || '';
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normaliseLead(input: unknown): Lead | null {
    if (!input || typeof input !== 'object') return null;
    const o = input as Record<string, unknown>;
    const lead: Lead = { f: clean(o.f, 100), l: clean(o.l, 100), e: clean(o.e, 240).toLowerCase(), c: clean(o.c, 160), s: clean(o.s, 200) };
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.e) ? lead : null;
}

export function sealLead(lead: Lead): string {
    const body = Buffer.from(JSON.stringify(lead)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    return `${body}.${sig}`;
}

export function openLead(value: string | undefined): Lead | null {
    if (!value || !secret()) return null;
    const [body, sig] = value.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try { return normaliseLead(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))); } catch { return null; }
}

export function readCookie(request: Request, name: string): string | undefined {
    const header = request.headers.get('cookie') || '';
    const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}
