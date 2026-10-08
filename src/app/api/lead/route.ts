import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { LEAD_COOKIE, normaliseLead, openLead, readCookie, sealLead } from '@/app/lib/lead';

const secure = (request: Request) => !(request.headers.get('host') || '').includes('localhost');

// The start page asks whether a lead is already held, so a refresh after the
// fragment is cleared does not bounce the visitor back to the form.
export async function GET(request: Request) {
    const lead = openLead(readCookie(request, LEAD_COOKIE));
    return NextResponse.json({ hasLead: Boolean(lead), firstName: lead?.f || '' });
}

export async function POST(request: Request) {
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
    const lead = normaliseLead(body);
    if (!lead) return NextResponse.json({ error: 'Invalid lead' }, { status: 422 });
    let sealed: string;
    try { sealed = sealLead(lead); } catch (e) {
        console.error('Lead cookie not set:', e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }
    const response = NextResponse.json({ ok: true, firstName: lead.f });
    response.cookies.set(LEAD_COOKIE, sealed, { httpOnly: true, secure: secure(request), sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
    return response;
}
