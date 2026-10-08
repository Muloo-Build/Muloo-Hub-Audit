import { LEAD_COOKIE, REPORT_COOKIE, openLead, readCookie, unseal } from '@/app/lib/lead';
import { BOOK_URL, GATE_URL, SITE_URL } from '@/app/lib/config';
import { buildReportPdf } from '@/app/lib/pdf';
import type { AuditRun } from '@/app/lib/checks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
    const run = unseal<AuditRun>(readCookie(request, REPORT_COOKIE));
    if (!run || run.v !== 2) {
        return new Response('No report found on this browser. Run the free portal score again.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    const lead = openLead(readCookie(request, LEAD_COOKIE));
    try {
        const bytes = await buildReportPdf({ run, firstName: lead?.f, lastName: lead?.l, company: lead?.c, auditUrl: GATE_URL, bookUrl: BOOK_URL, siteUrl: SITE_URL });
        const slug = (run.portalDomain || 'portal').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return new Response(Buffer.from(bytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="muloo-portal-score-${slug}-${run.at.slice(0, 10)}.pdf"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (e) {
        console.error('PDF build failed:', e);
        return new Response('The PDF could not be built. Your on-screen report is unaffected.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
}
