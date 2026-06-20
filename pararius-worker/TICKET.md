# TICKET: Pararius Auto-Apply — Cloudflare Worker Fix

## Problem

Make.com auto-applies to Pararius rental listings by hitting Click+ SendGrid tracking URLs extracted from listing emails. ~25% of requests are blocked by Cloudflare JS challenges that Make.com cannot execute (no JS runtime). Another ~37% return the raw listing page with no reaction registered. Only ~38% succeed.

Root cause: Make.com's HTTP client has a datacenter TLS fingerprint (JA4) that Cloudflare's bot management scores as a bot, serving a JS challenge. The challenge requires executing `window.document.forms[0].submit()` — impossible without a JS runtime.

## Solution

Deploy a Cloudflare Worker using the Browser Rendering API (`@cloudflare/puppeteer`). Make.com POSTs the Click+ URL to the Worker; the Worker navigates using real Chromium (valid TLS fingerprint, JS execution), follows all redirects including any CF challenge, and returns a JSON success/fail response.

## Architecture

```
Pararius email
  → Gmail filter
  → Make.com mailhook
  → Text Parser (regex extracts Click+ URL)
  → HTTP POST to CF Worker /apply  ← CHANGE THIS
  → Worker launches Chromium
  → Chromium → url<N>.pararius.nl (SendGrid, no CF) → 302
  → Chromium → pararius.nl/reageer/[token] (CF challenge solved natively)
  → Page contains "Uw reactie is doorgestuurd"
  → Worker returns { success: true }
```

## Files

All files live in `/pararius-worker/` in the unit-one repo.

```
pararius-worker/
  src/index.js       ← Worker entry point (already written)
  wrangler.toml      ← CF Worker config (already written)
  package.json       ← Dependencies (already written)
  TICKET.md          ← This file
  PLAN.md            ← Human deployment steps
```

## Worker Contract

**Endpoint:** `POST /apply`

**Request headers:**
```
Authorization: Bearer <WORKER_SECRET>
Content-Type: application/json
```

**Request body:**
```json
{
  "url": "https://url2220.pararius.nl/ls/click?upn=...",
  "cookies": "PHPSESSID=abc123; ujt_id=cff313b3-..."  // optional
}
```

**Response (success):**
```json
{
  "success": true,
  "finalUrl": "https://www.pararius.nl/reageer/...",
  "statusCode": 200,
  "message": "Reaction registered — confirmation text found on page"
}
```

**Response (failure):**
```json
{
  "success": false,
  "finalUrl": "https://www.pararius.nl/appartement/...",
  "statusCode": 200,
  "message": "No confirmation found. Final URL: https://..."
}
```

**Response (auth error):**
```json
{ "error": "Unauthorized" }   // HTTP 401
```

## Make.com Changes Required

In scenario 6186681 "Integration Webhooks", Module 4 (HTTP — Make a request):

| Field | Old value | New value |
|-------|-----------|-----------|
| URL | `{{3. Fallback Match}}` | `https://pararius-apply.<subdomain>.workers.dev/apply` |
| Method | GET | POST |
| Headers | Cookie: PHPSESSID=...; ... | Authorization: Bearer `<WORKER_SECRET>` |
| Body type | — | Raw |
| Content type | — | `application/json` |
| Request content | — | `{"url": "{{3. Fallback Match}}"}` |
| Parse response | true | true |
| Allow redirects | true | true (no-op, Worker handles redirects) |

## Cloudflare Requirements

- Workers Paid plan ($5/month) — required for Browser Rendering API
- Browser Rendering enabled via `wrangler.toml` `[browser]` binding
- `WORKER_SECRET` environment variable (set via `wrangler secret put WORKER_SECRET`)

## Cost Estimate

At ~30 emails/month × ~5s per browser session = ~2.5 minutes of browser time/month.
Free tier includes 10 browser hours/month. Effective cost: $0 beyond the $5/month Workers Paid base.

## Success Criteria

- Worker returns `{ "success": true }` for a real Pararius Click+ URL
- Corresponding "Your response has been forwarded" confirmation email arrives in Gmail within 60 seconds
- Make.com run history shows HTTP module returning 200 with `success: true` in response body

## Security Notes

- Worker validates `Authorization: Bearer <secret>` on every request
- Secret is stored as a CF Worker secret (encrypted at rest), never in wrangler.toml or source code
- URL is validated to only accept `pararius.nl` hostnames
- No cookies are stored server-side; they are passed per-request and discarded after the browser session closes

## Known Limitations

- Browser Rendering API sessions are not persistent — each request launches and closes a fresh Chromium instance (~2-4s overhead)
- WORKER_SECRET must be updated in both CF Worker secrets and Make.com HTTP module headers if rotated
- If Pararius changes their reaction confirmation page text, update the `SUCCESS_PHRASES` array in `src/index.js`
- `cookies` field is optional; without it, the reaction token in the URL alone should be sufficient for Click+ links

## Testing

```bash
# Deploy
cd pararius-worker
npm install
wrangler secret put WORKER_SECRET   # enter any random string
wrangler deploy

# Test with curl (replace URL and secret)
curl -X POST https://pararius-apply.<subdomain>.workers.dev/apply \
  -H "Authorization: Bearer <your-secret>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://url2220.pararius.nl/ls/click?upn=..."}'

# Expected response
# { "success": true, "finalUrl": "https://www.pararius.nl/reageer/...", ... }
```
