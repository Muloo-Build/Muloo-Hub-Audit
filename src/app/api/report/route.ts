import { NextResponse } from 'next/server';
import { LEAD_COOKIE, REPORT_COOKIE, openLead, readCookie, unseal } from '@/app/lib/lead';
import type { AuditRun } from '@/app/lib/checks';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const run = unseal<AuditRun>(readCookie(request, REPORT_COOKIE));
    if (!run || run.v !== 2) return NextResponse.json({ error: 'No report' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const lead = openLead(readCookie(request, LEAD_COOKIE));
    return NextResponse.json({ run, firstName: lead?.f || '', company: lead?.c || '' }, { headers: { 'Cache-Control': 'no-store' } });
}
