# Muloo Audit: free HubSpot portal score

The lead magnet behind **Free portal score** on wearemuloo.com. Live at `audit.wearemuloo.com`, hosted on Railway.

## The flow

```
/hubspot-audit (HubSpot page, HubSpot form: the lead, consent, attribution)
  -> audit.wearemuloo.com/start#mu=<base64 {f,l,e,c,s}>
  -> /api/lead          fragment held in a signed httpOnly cookie, cleared from the address bar
  -> /api/auth/hubspot  no lead cookie = back to the gate; otherwise HubSpot OAuth (read only)
  -> callback           13 checks run, result written to the Muloo contact, app uninstalled
  -> /report            on-screen report, read from a signed httpOnly cookie
  -> /api/report/pdf    branded PDF built on the fly (pdf-lib, no headless browser)
```

## The checks

Defined once in `src/app/lib/checks.ts` (copy, fixes, weights) and run by `src/app/utils/audit-engine.ts` (numbers only). Every check runs on its own: one that fails is marked "not checked" and left out of the score, never counted as a pass.

| Category | Checks |
|---|---|
| Ownership and routing | Contacts with no owner; open deals with no owner |
| Pipeline and forecast | Open deals past close date; no activity in 90 days; no amount |
| Data quality | Contacts with no email; no lifecycle stage; no company |
| Access and governance | Super admin share |
| Data model | Custom contact properties; undocumented properties; duplicate labels |
| Attribution | Contacts with an offline source |

Scopes requested (must match the HubSpot app): `crm.objects.contacts.read crm.objects.deals.read crm.schemas.companies.read settings.users.read oauth`.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` | The Muloo audit OAuth app |
| `AUDIT_COOKIE_SECRET` | Signs the lead and report cookies. Falls back to the client secret; set its own |
| `MULOO_HUBSPOT_TOKEN` | Private app token for the write back to the Muloo portal (contacts write) |
| `MULOO_SITE_URL`, `MULOO_GATE_URL`, `MULOO_BOOK_URL` | Optional overrides; default to www.wearemuloo.com |
| `AUDIT_KEEP_INSTALL` | `true` stops the uninstall after each run (debugging only) |

## Security notes

- No lead or report data in URLs. Both live in HMAC-signed httpOnly cookies, so a report cannot be forged or shared by link.
- The refresh token is never stored, and the app uninstalls itself from the visitor's portal after the run.
- Write back sets audit properties only, never name or company, so a forged fragment cannot rename an existing contact.
- CSP, frame-ancestors none, nosniff, strict referrer policy and HSTS set in `next.config.ts`.

## Run locally

```bash
npm install
AUDIT_COOKIE_SECRET=dev npm run dev   # http://localhost:5002
```
