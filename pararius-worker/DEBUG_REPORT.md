# Pararius Auto-Apply — Debug Report for Next Agent

## Goal

Auto-apply to Pararius rental listings from Gmail. When a "Just found for you" email arrives from Pararius, extract the one-click reaction link and submit it automatically via Make.com (no-code automation platform). Zero recurring cost required.

---

## The Email Flow (what Pararius sends)

Each listing alert email contains **two types of Click+ (SendGrid tracking) links** with identical URL structure:
```
https://url<N>.pararius.nl/ls/click?upn=<long_token>
```
1. "View this property" → resolves to `https://www.pararius.com/en/listing/<uuid>&utm_campaign=for_rent...`
2. "React with one click +" → resolves to `https://www.pararius.nl/reageer/<token>`

Only link #2 submits the rental application. The surrounding HTML distinguishes them visually but the URL format is identical.

---

## Make.com Pipeline (current state)

```
Webhooks 1 (Custom mailhook)
  → Text Parser 3 (regex: Match pattern)
  → HTTP 4 (GET, Allow redirects=OFF → captures 302 Location header)
  → HTTP 5 (GET, URL={{4.headers.location}}, browser headers + cookies)
```

Mailhook address: `q7tv64j0961ozo8y8ric83d8ljy2dy2l@hook.eu1.make.com`
Scenario ID: 6186681 at https://eu1.make.com/1946233/scenarios/6186681/edit

### Module configuration as saved

**Module 3 — Text Parser:**
- Pattern: regex extracting `https?://url\d+\.pararius\.nl/ls/click\?[^\s"<>]+` (first match)
- Variable: `{{3. Fallback Match}}`

**Module 4 — HTTP:**
- URL: `{{3. Fallback Match}}`
- Method: GET
- Headers: Cookie = `PHPSESSID=121c45c3563bbda100f7f68151dcfd1d; ujt_id=cff313b3-bc34-4f78-881c-2e86085595e1; cf_clearance=<value>`
- Allow redirects: No
- Return error if HTTP request fails: No

**Module 5 — HTTP:**
- URL: `{{4.headers.location}}`
- Method: GET
- Authentication: No authentication
- Headers: Cookie = `PHPSESSID=...; ujt_id=...` + User-Agent = Chrome/137
- Allow redirects: Yes
- Return error if HTTP request fails: Yes
- Parse response: Yes

---

## Test Run Results (live test, Jun 15 2026)

Email forwarded: "Just found for you: €3,000 per month, Ceintuurbaan in Amsterdam"

| Module | Status | Notes |
|--------|--------|-------|
| Webhooks 1 | ✅ 1 bundle | Email received |
| Text Parser 3 | ✅ 1 bundle | URL extracted |
| HTTP 4 | ✅ 302 | Got Location header |
| HTTP 5 | ⚠️ Error | Cloudflare challenge |

### HTTP 4 output (confirmed)
- Input URL: `https://url2220.pararius.nl/ls/click?upn=u001.dTRjjQ5KVQtAco72...`
- Status: 302
- **Location header**: `https://www.pararius.com/en/listing/8e09a3dc-7560-59...&utm_campaign=for_rent...`
- Server: cloudflare ← url<N>.pararius.nl is also behind Cloudflare (CNAME to SendGrid, but CF proxied)

### HTTP 5 output (confirmed)
- Error: "Settings couldn't be applied / Forbidden"
- Body: `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>` ← Cloudflare JS challenge

---

## Bug 1 — Wrong URL extracted

The regex in Text Parser 3 matches the **first** Click+ URL in the email HTML, which is the "View this property" link, not the "React with one click +" link. The listing link comes first in the HTML.

**Result:** Module 4's Location header resolves to a listing page (`/en/listing/...`), not the reaction endpoint (`/reageer/...`).

**Fix needed:** Extract the reaction link specifically. Options:
- Find a context-specific pattern in the raw email HTML near the reaction button (e.g., a surrounding anchor or CTA text)
- Use Make.com's Text Parser to extract ALL matches, then filter for the one resolving to `/reageer/` — but this requires following each link
- The raw email HTML likely has a distinctive attribute near "React with one click" — worth inspecting the raw email source to find it

---

## Bug 2 — Cloudflare blocks Make.com's HTTP client

**Root cause confirmed:** pararius.nl (including the `/reageer/` endpoint) is protected by Cloudflare's Bot Management. The challenge requires JS execution (`window.document.forms[0].submit()`). Make.com's HTTP module is a plain HTTP client — no JS runtime.

**What was tried:**
- Two-step approach: Module 4 (no-redirect) captures 302 → Module 5 hits the real URL
- Passing `cf_clearance` cookie from a real browser session
- Passing `PHPSESSID` + `ujt_id` session cookies
- Passing Chrome User-Agent + Sec-Fetch-* headers

**Why cf_clearance doesn't help:** The cookie is cryptographically bound to the TLS fingerprint (JA4) of the browser session that solved the challenge. Make.com uses a datacenter TLS stack with a different JA4 fingerprint. Cloudflare detects the mismatch and re-challenges.

**What hasn't been tried / worth exploring:**
- Does the `/reageer/<token>` endpoint accept a direct HTTP POST (bypassing the JS challenge entirely)? The page might render a simple HTML form — if the token is enough to authenticate the reaction, a direct POST to the form action URL might work without solving the challenge.
- Does Pararius have an API or alternative endpoint that processes reactions without the CF layer?
- What does the `/reageer/<token>` page's raw HTML look like when fetched without CF challenge (e.g., via curl with the correct headers from a residential IP)? The challenge might only fire for datacenter IPs.
- Residential proxy services with free tiers (unlikely but worth checking)
- Can the reaction be submitted via the Pararius mobile app API? App APIs sometimes bypass web CF protection.
- What headers does a successful reaction request send? (Check browser DevTools Network tab while clicking "React with one click +" manually — the actual form POST might be capturable)

---

## Proposed Fix (requires $5/month — Cloudflare Worker)

Code is already written at `/pararius-worker/src/index.js`. Uses `@cloudflare/puppeteer` (Browser Rendering API) — real Chromium, valid TLS fingerprint, JS execution. Solves both bugs:
1. Worker receives the raw Click+ URL directly from Module 4 (skips the URL extraction issue entirely — Chromium follows all redirects to the right page)
2. Real Chromium solves Cloudflare JS challenge natively

**Blocker:** Workers Paid plan required ($5/month). User declined.

See `PLAN.md` for deployment steps (20 min total). See `TICKET.md` for full spec.

---

## What the New Agent Should Prioritize

1. **Try a direct POST to the /reageer/ form** — fetch the page from a residential IP (or via curl with right headers), inspect the form action + hidden fields, then POST directly from Make.com. If the form action accepts a POST with just the token, Cloudflare challenge might not fire on POST.

2. **Inspect raw email HTML** to find a reliable pattern that distinguishes the reaction Click+ URL from the listing view Click+ URL — this is needed regardless of approach.

3. **Explore free browser automation platforms** — e.g., Browserless free tier, Playwright on a free Supabase Edge Function, GitHub Actions triggered via webhook. If any free tier offers headless Chromium accessible via HTTP, it slots in as a drop-in replacement for the CF Worker.

4. **Check if Pararius mobile API is accessible** — sometimes bypasses CF protection entirely.
