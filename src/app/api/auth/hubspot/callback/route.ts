import { NextResponse } from 'next/server';
import { runAuditEngine } from '@/app/utils/audit-engine';
import { LEAD_COOKIE, STATE_COOKIE, openLead, readCookie } from '@/app/lib/lead';
import { getPortalInfo, writeAuditToMuloo } from '@/app/lib/muloo-crm';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const host = request.headers.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    const redirectUri = `${baseUrl}/api/auth/hubspot/callback`;
    const fail = (reason: string) => NextResponse.redirect(new URL(`/report?status=error&reason=${encodeURIComponent(reason)}`, baseUrl));

    // Declining the HubSpot consent screen lands here with no code.
    if (!code) return fail('not-connected');

    const expectedState = readCookie(request, STATE_COOKIE);
    if (!expectedState || state !== expectedState) return fail('expired');

    const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: 'HubSpot configuration missing on the server' }, { status: 500 });
    }

    const lead = openLead(readCookie(request, LEAD_COOKIE));

    try {
        const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
            body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }).toString(),
        });

        if (!tokenResponse.ok) {
            console.error('HubSpot Token Error:', await tokenResponse.text());
            return fail('token');
        }

        const { access_token: accessToken } = await tokenResponse.json();
        const portal = await getPortalInfo(accessToken);
        const scores = await runAuditEngine(accessToken);
        await writeAuditToMuloo({ lead, portal, results: scores });

        const encodedScores = encodeURIComponent(JSON.stringify(scores));
        const response = NextResponse.redirect(new URL(`/report?status=success&data=${encodedScores}`, baseUrl));
        response.cookies.delete(STATE_COOKIE);
        return response;
    } catch (error) {
        console.error('OAuth Exchange Exception:', error);
        await writeAuditToMuloo({ lead, portal: {}, failed: true });
        return fail('audit');
    }
}
