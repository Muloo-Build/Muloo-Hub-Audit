import { PDFDocument, PDFFont, PDFPage, PDFString, RGB, StandardFonts, rgb, setCharacterSpacing } from 'pdf-lib';
import { CATEGORIES, CHECK_BY_ID, NOT_COVERED, describe, rank, verdict, type AuditRun, type CheckResult } from './checks';
import { WORDMARK_PNG } from './wordmark';

/*
 * The take-away PDF. Built with pdf-lib, so it needs no headless browser on
 * the server and renders the same everywhere. Navy cover and close in the
 * site's dark style; white inner pages so it prints.
 */

const W = 595.28, H = 841.89, M = 48;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
    navy: hex('#050A30'), card: hex('#0E1546'), teal: hex('#00C4CC'), white: hex('#FFFFFF'),
    fg2: hex('#9BA3B5'), line: hex('#252C5A'), ink: hex('#050A30'), ink2: hex('#4A5170'), ink3: hex('#7A8099'),
    rule: hex('#E3E6EF'), fixBg: hex('#ECFAFB'), fixLine: hex('#B5EBEE'),
    pass: hex('#59BF96'), warn: hex('#F47621'), fail: hex('#E5397A'),
};
const BURST = ['#6366F1', '#A855F7', '#EC4899', '#F97316'];
const bandColour = (s: number) => (s >= 85 ? C.pass : s >= 60 ? C.warn : C.fail);
const statusColour = { pass: C.pass, warn: C.warn, fail: C.fail, skip: C.ink3 } as const;
const statusLabel = { pass: 'PASSED', warn: 'WARNING', fail: 'CRITICAL', skip: 'NOT CHECKED' } as const;

export interface PdfInput { run: AuditRun; firstName?: string; lastName?: string; company?: string; auditUrl: string; bookUrl: string; siteUrl: string }

export async function buildReportPdf(input: PdfInput): Promise<Uint8Array> {
    const { run } = input;
    const doc = await PDFDocument.create();
    doc.setTitle(`HubSpot portal score${run.portalDomain ? `: ${run.portalDomain}` : ''}`);
    doc.setAuthor('Muloo');
    doc.setSubject('Free HubSpot portal score');
    doc.setCreator('Muloo Audit (audit.wearemuloo.com)');
    doc.setProducer('Muloo Audit');
    doc.setCreationDate(new Date(run.at));

    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const logo = await doc.embedPng(Buffer.from(WORDMARK_PNG, 'base64'));

    // Helvetica only speaks WinAnsi. Anything else (emoji, CJK in a company name) becomes a space.
    const charset = new Set(reg.getCharacterSet());
    const safe = (s: string) => Array.from(s || '').map(ch => (charset.has(ch.codePointAt(0)!) ? ch : ' ')).join('').replace(/\s+/g, ' ').trim();

    const text = (p: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color: RGB, spacing = 0) => {
        if (spacing) p.pushOperators(setCharacterSpacing(spacing));
        p.drawText(safe(s), { x, y, size, font, color });
        if (spacing) p.pushOperators(setCharacterSpacing(0));
    };
    const widthOf = (s: string, font: PDFFont, size: number, spacing = 0) => font.widthOfTextAtSize(safe(s), size) + spacing * Math.max(0, safe(s).length - 1);
    const wrap = (s: string, font: PDFFont, size: number, max: number) => {
        const words = safe(s).split(' ');
        const lines: string[] = [];
        let line = '';
        for (const w of words) {
            const next = line ? `${line} ${w}` : w;
            if (font.widthOfTextAtSize(next, size) > max && line) { lines.push(line); line = w; } else line = next;
        }
        if (line) lines.push(line);
        return lines;
    };
    const para = (p: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color: RGB, max: number, lead = 1.45) => {
        const lines = wrap(s, font, size, max);
        lines.forEach((l, i) => p.drawText(l, { x, y: y - i * size * lead, size, font, color }));
        return lines.length * size * lead;
    };
    const roundRect = (p: PDFPage, x: number, top: number, w: number, h: number, r: number, o: { fill?: RGB; border?: RGB; bw?: number }) => {
        const path = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
        p.drawSvgPath(path, { x, y: top, color: o.fill, borderColor: o.border, borderWidth: o.border ? o.bw ?? 1 : 0 });
    };
    const burst = (p: PDFPage, y: number, h: number) => {
        const steps = 60, sw = W / steps;
        for (let i = 0; i < steps; i++) {
            const t = (i / (steps - 1)) * (BURST.length - 1), k = Math.min(Math.floor(t), BURST.length - 2), f = t - k;
            const a = hex(BURST[k]), b = hex(BURST[k + 1]);
            p.drawRectangle({ x: i * sw, y, width: sw + 0.5, height: h, color: rgb(a.red + (b.red - a.red) * f, a.green + (b.green - a.green) * f, a.blue + (b.blue - a.blue) * f) });
        }
    };
    const link = (p: PDFPage, x: number, y: number, w: number, h: number, url: string) => {
        const annot = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + w, y + h], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } });
        p.node.addAnnot(doc.context.register(annot));
    };
    const button = (p: PDFPage, label: string, x: number, top: number, url: string, primary: boolean) => {
        const size = 10.5, w = widthOf(label, bold, size) + 40, h = 30;
        if (primary) {
            // Gradient border in the site's style: burst behind, navy inset.
            const steps = 24;
            for (let i = 0; i < steps; i++) {
                const t = (i / (steps - 1)) * (BURST.length - 1), k = Math.min(Math.floor(t), BURST.length - 2), f = t - k;
                const a = hex(BURST[k]), b = hex(BURST[k + 1]);
                p.drawRectangle({ x: x + (w * i) / steps, y: top - h, width: w / steps + 0.4, height: h, color: rgb(a.red + (b.red - a.red) * f, a.green + (b.green - a.green) * f, a.blue + (b.blue - a.blue) * f) });
            }
            roundRect(p, x + 1.5, top - 1.5, w - 3, h - 3, (h - 3) / 2, { fill: C.navy });
            // Mask the square gradient corners back to the page colour.
            const cw = h / 2;
            p.drawSvgPath(`M 0 0 H ${cw} A ${cw} ${cw} 0 0 0 0 ${cw} Z M 0 ${h} H ${cw} A ${cw} ${cw} 0 0 1 0 ${cw} Z`, { x, y: top, color: C.navy });
            p.drawSvgPath(`M ${cw} 0 H 0 A ${cw} ${cw} 0 0 1 ${cw} ${cw} Z M ${cw} ${h} H 0 A ${cw} ${cw} 0 0 0 ${cw} ${cw} Z`, { x: x + w - cw, y: top, color: C.navy });
        } else {
            roundRect(p, x, top, w, h, h / 2, { border: C.line, bw: 1 });
        }
        text(p, label, x + 20, top - h / 2 - size * 0.35, size, bold, C.white);
        link(p, x, top - h, w, h, url);
        return w;
    };

    const date = new Date(run.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const v = verdict(run.score);
    const ranked = rank(run.checks);
    const issues = ranked.filter(c => c.status === 'fail' || c.status === 'warn');
    const passed = ranked.filter(c => c.status === 'pass');
    const skipped = ranked.filter(c => c.status === 'skip');
    const count = (s: CheckResult['status']) => run.checks.filter(c => c.status === s).length;

    /* ---------- Cover ---------- */
    const cover = doc.addPage([W, H]);
    cover.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.navy });
    burst(cover, H - 4, 4);
    const lw = 96, lh = (logo.height / logo.width) * lw;
    cover.drawImage(logo, { x: M, y: H - M - lh, width: lw, height: lh });
    const tag = 'FREE PORTAL SCORE';
    text(cover, tag, W - M - widthOf(tag, bold, 7.5, 1.6), H - M - lh / 2 - 3, 7.5, bold, C.fg2, 1.6);

    let y = H - 190;
    text(cover, 'HUBSPOT PORTAL SCORE', M, y, 8.5, bold, C.teal, 2);
    y -= 44;
    text(cover, run.portalDomain || 'Your HubSpot portal', M, y, 30, bold, C.white);
    y -= 26;
    const who = [input.firstName, input.lastName].filter(Boolean).join(' ');
    const prepared = [who ? `Prepared for ${who}` : '', input.company || ''].filter(Boolean).join(', ');
    if (prepared) { text(cover, prepared, M, y, 12, reg, C.fg2); y -= 18; }
    text(cover, [run.hubId ? `Hub ID ${run.hubId}` : '', date].filter(Boolean).join('   |   '), M, y, 10, reg, C.fg2);

    // Score card
    const cardTop = y - 36, cardH = 250;
    roundRect(cover, M, cardTop, W - 2 * M, cardH, 14, { fill: C.card, border: C.line, bw: 1 });
    const cx = M + 100, cy = cardTop - 104, r = 62;
    cover.drawCircle({ x: cx, y: cy, size: r, borderColor: C.line, borderWidth: 9 });
    const theta = (Math.min(run.score, 99.9) / 100) * 2 * Math.PI;
    if (run.score > 0) {
        const ex = (r * Math.sin(theta)).toFixed(2), ey = (-r * Math.cos(theta)).toFixed(2);
        cover.drawSvgPath(`M 0 ${-r} A ${r} ${r} 0 ${theta > Math.PI ? 1 : 0} 1 ${ex} ${ey}`, { x: cx, y: cy, borderColor: bandColour(run.score), borderWidth: 9 });
    }
    const sv = String(run.score);
    text(cover, sv, cx - widthOf(sv, bold, 44) / 2, cy - 8, 44, bold, C.white);
    text(cover, 'OUT OF 100', cx - widthOf('OUT OF 100', bold, 7, 1.4) / 2, cy - 26, 7, bold, C.fg2, 1.4);

    const tx = M + 200, tw = W - M - 24 - tx;
    text(cover, v.label, tx, cardTop - 56, 22, bold, bandColour(run.score));
    const vh = para(cover, v.line, tx, cardTop - 78, 10.5, reg, C.fg2, tw);
    const ty = cardTop - 78 - vh - 18;
    let tx2 = tx;
    for (const [n, label, col] of [[count('fail'), 'critical', C.fail], [count('warn'), 'warnings', C.warn], [count('pass'), 'passed', C.pass]] as const) {
        text(cover, String(n), tx2, ty, 18, bold, col);
        const nw = widthOf(String(n), bold, 18);
        text(cover, label, tx2 + nw + 5, ty + 1, 10, reg, C.fg2);
        tx2 += nw + widthOf(label, reg, 10) + 26;
    }

    // Category bars
    const by = cardTop - 196;
    const cats = CATEGORIES.map(c => {
        const rs = run.checks.filter(r2 => CHECK_BY_ID[r2.id]?.category === c.id && r2.status !== 'skip');
        if (!rs.length) return null;
        const pts = rs.reduce((a, r2) => a + (r2.status === 'pass' ? 1 : r2.status === 'warn' ? 0.5 : 0), 0);
        return { label: c.label, p: Math.round((pts / rs.length) * 100) };
    }).filter(Boolean) as { label: string; p: number }[];
    const colW = (W - 2 * M - 48) / 2;
    cats.forEach((c, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = M + 24 + col * (colW + 0), yy = by - row * 22;
        text(cover, c.label, x, yy, 9, reg, C.fg2);
        const bx = x + 118, bw = colW - 118 - 34;
        roundRect(cover, bx, yy + 7, bw, 5, 2.5, { fill: C.line });
        roundRect(cover, bx, yy + 7, Math.max(5, (bw * c.p) / 100), 5, 2.5, { fill: bandColour(c.p) });
        text(cover, String(c.p), bx + bw + 8, yy, 9, bold, C.white);
    });

    // How to read it
    y = cardTop - cardH - 40;
    text(cover, 'HOW TO READ THIS', M, y, 7.5, bold, C.teal, 1.6);
    y -= 18;
    y -= para(cover, `The score is weighted across ${run.checks.filter(c => c.status !== 'skip').length} read only checks run live against your portal on ${date}. A critical finding scores nothing, a warning half, a pass in full. Ownership and access carry the most weight because they cost the most when they go wrong. Anything we could not check is left out of the score rather than counted as a pass.`, M, y, 9.5, reg, C.fg2, W - 2 * M);
    y -= 6;
    para(cover, 'We counted records and read property settings. We did not copy, store or change any record, and our access to your portal ended when the run finished.', M, y, 9.5, reg, C.fg2, W - 2 * M);

    text(cover, input.siteUrl.replace(/^https?:\/\//, ''), M, 36, 8, reg, C.fg2);

    /* ---------- Inner pages ---------- */
    const inner: PDFPage[] = [];
    let page!: PDFPage;
    let cursor = 0;
    const newInner = () => {
        page = doc.addPage([W, H]);
        inner.push(page);
        burst(page, H - 3, 3);
        const iw = 58, ih = (logo.height / logo.width) * iw;
        page.drawImage(logo, { x: M, y: H - 30 - ih, width: iw, height: ih });
        const right = `Free portal score${run.portalDomain ? `   |   ${run.portalDomain}` : ''}`;
        text(page, right, W - M - widthOf(right, reg, 8), H - 30 - ih / 2 - 3, 8, reg, C.ink3);
        page.drawLine({ start: { x: M, y: H - 52 }, end: { x: W - M, y: H - 52 }, thickness: 0.6, color: C.rule });
        cursor = H - 84;
    };
    const need = (h: number) => { if (cursor - h < 70) newInner(); };
    const heading = (s: string, sub?: string) => {
        need(sub ? 70 : 50);
        text(page, s, M, cursor, 18, bold, C.ink);
        cursor -= 18;
        if (sub) cursor -= para(page, sub, M, cursor, 9.5, reg, C.ink2, W - 2 * M) + 2;
        cursor -= 10;
    };

    newInner();
    if (issues.length) {
        heading('What to fix, worst first', `${issues.length} finding${issues.length === 1 ? '' : 's'} from this run. Each one says why it matters and how to fix it inside HubSpot.`);
        const bw = W - 2 * M, pad = 16, inW = bw - 2 * pad - 4;
        for (const r2 of issues) {
            const { def, text: res } = describe(r2);
            const resL = wrap(res, bold, 10.5, inW), whyL = wrap(def.why, reg, 9.5, inW), fixL = wrap(`The fix. ${def.fix}`, reg, 9.5, inW - 20);
            const fixH = fixL.length * 9.5 * 1.45 + 18;
            const h = pad + 12 + 10 + 18 + resL.length * 15 + 4 + whyL.length * 13.8 + 4 + fixH + pad - 4;
            need(h + 12);
            const top = cursor;
            roundRect(page, M, top, bw, h, 8, { border: C.rule, bw: 0.8 });
            page.drawRectangle({ x: M, y: top - h + 6, width: 3, height: h - 12, color: statusColour[r2.status] });
            let iy = top - pad - 8;
            const lab = statusLabel[r2.status];
            const lwid = widthOf(lab, bold, 6.5, 1.2) + 14;
            roundRect(page, M + pad + 4, iy + 10, lwid, 14, 7, { fill: statusColour[r2.status] });
            text(page, lab, M + pad + 11, iy + 0.5, 6.5, bold, C.white, 1.2);
            const cat = (CATEGORIES.find(c => c.id === def.category)?.label || '').toUpperCase();
            text(page, cat, M + bw - pad - widthOf(cat, bold, 6.5, 1.2), iy + 0.5, 6.5, bold, C.ink3, 1.2);
            iy -= 26;
            text(page, def.title, M + pad + 4, iy, 13, bold, C.ink);
            iy -= 18;
            resL.forEach(l => { page.drawText(l, { x: M + pad + 4, y: iy, size: 10.5, font: bold, color: C.ink }); iy -= 15; });
            iy -= 2;
            whyL.forEach(l => { page.drawText(l, { x: M + pad + 4, y: iy, size: 9.5, font: reg, color: C.ink2 }); iy -= 13.8; });
            iy -= 4;
            roundRect(page, M + pad + 4, iy + 6, inW, fixH, 6, { fill: C.fixBg, border: C.fixLine, bw: 0.6 });
            let fy = iy - 9;
            fixL.forEach((l, i) => {
                if (i === 0 && l.startsWith('The fix.')) {
                    page.drawText('The fix.', { x: M + pad + 14, y: fy, size: 9.5, font: bold, color: hex('#008E94') });
                    page.drawText(l.slice(8), { x: M + pad + 14 + bold.widthOfTextAtSize('The fix.', 9.5), y: fy, size: 9.5, font: reg, color: C.ink });
                } else page.drawText(l, { x: M + pad + 14, y: fy, size: 9.5, font: reg, color: C.ink });
                fy -= 9.5 * 1.45;
            });
            cursor = top - h - 12;
        }
        cursor -= 12;
    }

    if (passed.length) {
        heading('What passed');
        for (const r2 of passed) {
            const def = CHECK_BY_ID[r2.id];
            const line = `${def.title}. ${describe(r2).text}`;
            const lines = wrap(line, reg, 9.5, W - 2 * M - 16);
            need(lines.length * 14 + 6);
            page.drawCircle({ x: M + 3.5, y: cursor + 3.2, size: 3, color: C.pass });
            lines.forEach((l, i) => page.drawText(l, { x: M + 16, y: cursor - i * 14, size: 9.5, font: reg, color: C.ink2 }));
            cursor -= lines.length * 14 + 6;
        }
        cursor -= 12;
    }

    if (skipped.length) {
        need(50);
        text(page, 'NOT CHECKED', M, cursor, 7.5, bold, C.ink3, 1.6);
        cursor -= 16;
        cursor -= para(page, `${skipped.map(r2 => CHECK_BY_ID[r2.id].title).join(', ')}. Usually that means there were no records of that kind, or the connecting user could not see them. These are left out of the score.`, M, cursor, 9, reg, C.ink3, W - 2 * M);
    }

    /* ---------- Close ---------- */
    const close = doc.addPage([W, H]);
    close.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.navy });
    burst(close, H - 4, 4);
    close.drawImage(logo, { x: M, y: H - M - lh, width: lw, height: lh });
    y = H - 170;
    text(close, 'WHAT THIS SCORE CANNOT SEE', M, y, 8.5, bold, C.teal, 2);
    y -= 40;
    for (const l of wrap('Thirteen checks is the surface. The HubSpot Audit goes underneath.', bold, 24, W - 2 * M)) { text(close, l, M, y, 24, bold, C.white); y -= 30; }
    y -= 6;
    y -= para(close, 'The free score reads counts and settings. Most of what quietly costs a HubSpot team time sits where a quick score cannot look:', M, y, 11, reg, C.fg2, W - 2 * M);
    y -= 14;
    const gw = (W - 2 * M - 12) / 2;
    NOT_COVERED.forEach((item, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = M + col * (gw + 12), top = y - row * 46;
        roundRect(close, x, top, gw, 36, 8, { border: C.line, bw: 1 });
        const lines = wrap(item, reg, 9.5, gw - 28);
        lines.slice(0, 2).forEach((l, j) => text(close, l, x + 14, top - 15 - j * 12 + (lines.length === 1 ? -3 : 3), 9.5, reg, C.white));
    });
    y -= Math.ceil(NOT_COVERED.length / 2) * 46 + 20;
    text(close, 'The HubSpot Audit', M, y, 15, bold, C.white);
    y -= 20;
    y -= para(close, '58 portal checks, root cause analysis and sector benchmarking. You get downloadable findings and a guide to fixing issues yourself, within five working days. Pay once, then decide whether you want us to do the work.', M, y, 10.5, reg, C.fg2, W - 2 * M);
    y -= 16;
    const bw1 = button(close, 'See the HubSpot Audit', M, y, input.auditUrl, true);
    button(close, 'Book a call with a specialist', M + bw1 + 12, y, input.bookUrl, false);

    text(close, `Generated by Muloo Audit on ${date}. Based on read only counts at the time of the run.`, M, 52, 8, reg, C.fg2);
    text(close, input.siteUrl.replace(/^https?:\/\//, ''), M, 36, 8, reg, C.fg2);

    // Page numbers on the inner pages.
    const total = doc.getPageCount();
    inner.forEach((p, i) => {
        const n = `Page ${i + 2} of ${total}`;
        text(p, n, W - M - widthOf(n, reg, 8), 34, 8, reg, C.ink3);
        text(p, input.siteUrl.replace(/^https?:\/\//, ''), M, 34, 8, reg, C.ink3);
    });

    return doc.save();
}
