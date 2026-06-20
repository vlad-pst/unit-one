# Deployment Plan — Pararius Auto-Apply CF Worker

## What you need to do (human steps)
Everything else is already done (code is written).

---

## Prerequisites

- Node.js installed (`node --version` — needs v18+)
- A Cloudflare account (cloudflare.com — free to create)

---

## Step 1 — Upgrade Cloudflare to Workers Paid

Browser Rendering requires the Workers Paid plan.

1. Go to https://dash.cloudflare.com → Workers & Pages → Plans
2. Upgrade to **Workers Paid** ($5/month)
3. Confirm Browser Rendering is available (it appears automatically on paid plans)

---

## Step 2 — Install Wrangler CLI

Open Terminal (iTerm):

```bash
npm install -g wrangler
wrangler --version   # should print 4.x.x
```

---

## Step 3 — Install Worker dependencies

```bash
cd ~/CodingProjects/unit-one/pararius-worker
npm install
```

---

## Step 4 — Log in to Cloudflare

```bash
wrangler login
```

This opens a browser window. Log in with your Cloudflare account. Return to Terminal when done.

---

## Step 5 — Set the Worker secret

Pick any random string as your secret (e.g. paste output of `openssl rand -hex 20`).
**Save it** — you'll need it for Make.com in Step 8.

```bash
wrangler secret put WORKER_SECRET
# Paste your secret when prompted, press Enter
```

---

## Step 6 — Deploy the Worker

```bash
wrangler deploy
```

Output will include a line like:
```
Published pararius-apply (1.23 sec)
https://pararius-apply.<your-subdomain>.workers.dev
```

Copy that URL. You'll need it for Step 8.

---

## Step 7 — Quick smoke test

```bash
curl -X POST https://pararius-apply.<your-subdomain>.workers.dev/apply \
  -H "Authorization: Bearer <YOUR_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.pararius.nl"}'
```

Expected: `{ "success": false, "finalUrl": "https://www.pararius.nl/...", ... }`
(false is correct here — pararius.nl homepage has no reaction confirmation text)

---

## Step 8 — Update Make.com (the only UI step)

Go to https://eu1.make.com/1946233/scenarios/6186681/edit

Click **Edit** → open **Module 4** (HTTP — Make a request) → change:

| Field | New value |
|-------|-----------|
| URL | `https://pararius-apply.<your-subdomain>.workers.dev/apply` |
| Method | **POST** |
| Headers → remove Cookie row, add: | `Authorization` = `Bearer <YOUR_SECRET>` |
| Body type | **Raw** |
| Content type | `application/json` |
| Request content | `{"url": "{{3. Fallback Match}}"}` |

Save with **Cmd+S**.

---

## Step 9 — End-to-end test

1. In Make.com, click **Run once**
2. Forward any recent Pararius listing email (with "React with one click +") to:
   `q7tv64j0961ozo8y8ric83d8ljy2dy2l@hook.eu1.make.com`
3. Watch the Make.com run complete
4. Click the HTTP module bubble → check Output → should show `"success": true`
5. Check Gmail within ~60 seconds for "Your response has been forwarded" from Pararius

---

## Summary of who does what

| Step | Who | Estimated time |
|------|-----|---------------|
| Steps 1-6 | You (terminal + browser) | ~10 min |
| Step 7 | You (curl) | 1 min |
| Step 8 | You (Make.com UI) | 5 min |
| Step 9 | You (test) | 2 min |
| Code writing | Already done ✓ | — |

**Total human effort: ~20 minutes.**
