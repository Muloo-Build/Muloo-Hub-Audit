import { NextResponse } from 'next/server';
import { runAuditEngine } from '@/app/utils/audit-engine';
import { LEAD_COOKIE, REPORT_COOKIE, STATE_COOKIE, openLead, readCookie, seal } from '@/app/lib/lead';
import { getPortalInfo, releaseAccess, writeAuditToMuloo } from '@/app/lib/muloo-crm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const host = request.headers.get('host');
    const local = Boolean(host?.includes('localhost'));
    const baseUrl = `${local ? 'http' : 'https'}://${host}`;
    const redirectUri = `${baseUrl}/api/auth/hubspot/callback`;
    const fail = (reason: string) => {
        const res = NextResponse.redirect(new URL(`/report?status=error&reason=${encodeURIComponent(reason)}`, baseUrl));
        res.cookies.delete(STATE_COOKIE);
        return res;
    };

    // Declining the HubSpot consent screen lands here with no code.
    if (!code) return fail('not-connected');

    const expectedState = readCookie(request, STATE_COOKIE);
    if (!expectedState || state !== expectedState) return fail('expired');

    const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        console.error('HubSpot client id or secret missing on the server');
        return fail('audit');
    }

    const lead = openLead(readCookie(request, LEAD_COOKIE));
    let accessToken = '';

    try {
        const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
            body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }).toString(),
            signal: AbortSignal.timeout(15000),
        });

        if (!tokenResponse.ok) {
            console.error('HubSpot token error:', tokenResponse.status);
            return fail('token');
        }

        // The refresh token is deliberately ignored: we never come back for more.
        accessToken = (await tokenResponse.json()).access_token;
        const portal = await getPortalInfo(accessToken);
        const run = await runAuditEngine(accessToken, { hubId: portal.hubId, portalDomain: portal.hubDomain });

        if (run.checks.every(c => c.status === 'skip')) {
            await writeAuditToMuloo({ lead, portal, failed: true });
            return fail('audit');
        }

        await writeAuditToMuloo({ lead, portal, run });

        // The report rides in a signed, httpOnly cookie, never in the URL:
        // no portal data in logs, history or referrers, and nobody can hand
        // round a doctored Muloo report.
        const response = NextResponse.redirect(new URL('/report?status=success', baseUrl));
        response.cookies.set(REPORT_COOKIE, seal(run), { httpOnly: true, secure: !local, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
        response.cookies.delete(STATE_COOKIE);
        return response;
    } catch (error) {
        console.error('Audit run failed:', error instanceof Error ? error.message : error);
        await writeAuditToMuloo({ lead, portal: {}, failed: true });
        return fail('audit');
    } finally {
        if (accessToken) await releaseAccess(accessToken);
    }
}
