import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { GATE_URL } from '@/app/lib/config';
import { LEAD_COOKIE, STATE_COOKIE, openLead, readCookie } from '@/app/lib/lead';

export async function GET(request: Request) {
    const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID;
    const host = request.headers.get('host');
    const local = Boolean(host?.includes('localhost'));
    const redirectUri = `${local ? 'http' : 'https'}://${host}/api/auth/hubspot/callback`;

    if (!clientId) {
        return NextResponse.json({ error: 'HubSpot configuration missing' }, { status: 500 });
    }

    // One gate, and it is on the Muloo site. No lead, no audit.
    if (!openLead(readCookie(request, LEAD_COOKIE))) {
        return NextResponse.redirect(GATE_URL);
    }

    const scopes = ['crm.objects.contacts.read', 'crm.objects.deals.read', 'crm.schemas.companies.read', 'oauth', 'settings.users.read'].join('%20');
    const state = crypto.randomBytes(16).toString('base64url');
    const authorizationUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}`;

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: !local, sameSite: 'lax', path: '/', maxAge: 600 });
    return response;
}
