# Muloo Audit

The free HubSpot portal score: a lead magnet at `audit.wearemuloo.com`. Read `README.md` for the flow, checks and environment.

Last reviewed: 8 October 2026.

## Ship it

- GitHub `Muloo-Build/Muloo-Hub-Audit`. Railway project "Muloo Hub - Audit Tool" auto deploys `main`, so a push is a release
- Before pushing: `npm run lint` and `npm run build` must pass. Check the PDF with a mocked run (stub `fetch`, call `runAuditEngine` then `buildReportPdf`) and look at the pages, not just the byte count
- After deploy: `/api/report` and `/api/report/pdf` return 404 without a cookie, `/api/auth/hubspot` with no lead redirects to the gate

## Rules

- **One gate, on HubSpot.** The lead arrives in the `#mu=` fragment from the site's form. The tool never asks for details again
- **Nothing sensitive in URLs.** Lead and report live in HMAC signed httpOnly cookies (`lib/lead.ts`). Never put scores or portal data back in a query string: it made reports forgeable
- **Write back audit properties only** (`lib/muloo-crm.ts`). Never name or company: the fragment is not signed
- **Scopes must match the HubSpot app.** Adding a check that needs a new scope means changing the app config first, or the OAuth screen errors for everyone
- **Every check isolated.** A failure is `skip` and is left out of the score; never let one error inflate the score
- **Copy lives in `lib/checks.ts`.** Site copy about the free score must only claim what these checks see (ownership, pipeline hygiene, data quality, admin access, data model, attribution). No hyphens or em dashes, UK spelling
- The app uninstalls itself from the visitor's portal after each run (`AUDIT_KEEP_INSTALL=true` to debug)
- The PDF is pdf-lib with standard fonts: text outside WinAnsi is stripped, so keep copy to plain Latin characters

## Open

- HubSpot workflow "audit completed" (email the lead, task for Jarrud) is not built, so nothing is emailed yet
- `AUDIT_COOKIE_SECRET` is not set on Railway; cookies fall back to the client secret
- Assets and links point at portal 8066413 and www; revisit when the site moves to portal 49338123

## Shared Work context

Paths are relative to the root of the synced Work folder (`~/Work` on
stormtrooper, `/Users/user/Work` on the MacBook). Its root `AGENTS.md` applies
here too.

- Master memory: `00 Memory/MEMORY.md`
- New-project standard: `00 Memory/SOP/SOP-004-new-project.md`
- Project catalog: `PROJECT_CATALOG.md`
- Session handoffs: `00 Memory/sessions/`
