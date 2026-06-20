# Pararius auto-react (local Mac)

Opens the "React with one click" link from Pararius "Just found for you" emails
in your default browser. The request leaves from your Mac on your home IP in a
real browser, so Cloudflare lets it through (no datacenter, no challenge, no
evasion). You confirmed that opening the link submits the reaction immediately.

It is push, not polling: it uses IMAP IDLE, so Gmail holds the connection open
and notifies it the instant a message arrives (about a 1-second reaction). It
runs only while your Mac is awake. On reconnect, for example after the Mac
wakes, it scans all Pararius alerts from the last `lookback_hours` and opens any
it has not already handled. A local state file prevents reacting to the same
listing twice.

Free. Python standard library only. No pip installs.

## Why not a cloud VM
A GCP/AWS/etc. VM has a datacenter IP, which is exactly what Cloudflare blocks
on the reaction endpoint. Getting a datacenter client through needs fingerprint
spoofing or residential proxies (evasion). Your Mac avoids all of that because
it is a real browser on a residential connection.

## Setup (about 5 minutes)

### 1. Gmail app password
The script reads Gmail over IMAP and needs an app password (not your normal
password).

1. Turn on 2-Step Verification: https://myaccount.google.com/security
2. Create an app password: https://myaccount.google.com/apppasswords
   (name it e.g. "pararius"). You get a 16-character code.

If your alerts arrive in a non-Gmail mailbox, change `imap_host` in
`config.json` to that provider's IMAP server.

### 2. Store the app password in the macOS Keychain
Replace the email with the account that receives the Pararius emails:

```bash
security add-generic-password -s pararius-react -a you@gmail.com -w
```

It prompts for the password. Paste the 16-character app password (no spaces).

### 3. Fill in config.json
Copy the template, then set at least `email` (your real `config.json` is gitignored, so it stays local):

```bash
cp config.example.json config.json
```

```json
{ "email": "you@gmail.com" }
```

`config.example.json` ships with `"dry_run": true` on purpose. Leave it for now.

### 4. Test before going live
Confirm it picks the right link, not the listing link.

Option A, against a real email: in Gmail open one "Just found for you" message,
More (three dots) -> Download message, save the `.eml`, then:

```bash
cd pararius-mac-react
python3 pararius_react.py --test-file ~/Downloads/that-email.eml
```

You want the line marked `REACT  <-- would open` to be the reaction link
(it should resolve to `/reageer/`, the listing link resolves to `/listing/`).
If it picks the wrong one, tweak `reaction_keywords` / `exclude_keywords` in
`config.json` and re-run.

Option B, live mailbox dry-run (opens nothing):

```bash
python3 pararius_react.py --once --dry-run
```

### 5. Go live
Set `"dry_run": false` in `config.json`, then install the background agent:

```bash
chmod +x install.sh
./install.sh
```

That loads a LaunchAgent that starts at login and runs while the Mac is awake.

## Managing it

```bash
launchctl list | grep pararius          # is it running
tail -f pararius_react.log              # watch activity
./install.sh                            # reload after editing config
launchctl bootout gui/$(id -u)/com.pararius.react   # stop it
python3 pararius_react.py --reset-state # clear dedup memory
```

## config.json reference

| Key | Meaning | Default |
|---|---|---|
| `email` | mailbox that receives the alerts | "" |
| `app_password_keychain` | Keychain service name from step 2 | `pararius-react` |
| `mailbox` | `AUTO` finds All Mail; or `INBOX`, etc. | `AUTO` |
| `subject_contains` | only emails with this in the subject | `Just found for you` |
| `from_contains` | only emails from this sender substring | `pararius` |
| `reaction_keywords` | link text that marks the react button | one click, react, reageer |
| `exclude_keywords` | link text to never open | view this property, bekijk, ... |
| `lookback_hours` | on wake, how far back to catch up | 12 |
| `idle_seconds` | IMAP IDLE refresh + safety re-scan backstop | 120 |
| `poll_seconds` | only used with the `--poll` fallback | 30 |
| `dry_run` | true logs only, false actually opens | true |
| `max_open_per_cycle` | safety cap per scan | 10 |

## Notes
- It opens links in whatever your default browser is. Stay logged into Pararius
  there, since the reaction likely uses your session.
- If no reaction link matches in an email, it is marked "skipped" and logged, so
  you can fix the keywords and run `--reset-state` to retry.
- This applies automatically to every match. Keep `dry_run` on until the
  `--test-file` output looks right.
- Automated applying may be against Pararius's terms; that is your call.
