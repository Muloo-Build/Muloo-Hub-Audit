import { NextResponse } from 'next/server';
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
    const response = NextResponse.json({ ok: true, firstName: lead.f });
    response.cookies.set(LEAD_COOKIE, sealLead(lead), { httpOnly: true, secure: secure(request), sameSite: 'lax', path: '/', maxAge: 60 * 60 * 2 });
    return response;
}
