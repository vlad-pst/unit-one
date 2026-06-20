#!/usr/bin/env python3
"""
Pararius auto-react (local, free, no datacenter, no Cloudflare wall).

What it does
------------
Polls your Gmail over IMAP. When a Pararius "Just found for you" email is
present, it finds the "React with one click" link (NOT the "View this property"
link), and opens it in your default browser. Because that request leaves from
your own machine on your home IP in a real browser, Cloudflare lets it through,
and (per your test) opening the link submits the reaction immediately.

Behaviour you asked for
-----------------------
- Push, not polling: it uses IMAP IDLE, so Gmail's server holds the connection
  and notifies it the instant a message arrives (~1s reaction). A low-frequency
  refresh (`idle_seconds`) re-arms IDLE and doubles as a safety re-scan.
- Runs only while your Mac is awake (launchd KeepAlive daemon).
- On (re)connect, e.g. after wake, it scans all Pararius alerts from the last
  `lookback_hours` and opens any it has not already handled.
- Dedup via a local state file, so a listing is never reacted to twice.

Stdlib only. No pip installs.

CLI
---
  python3 pararius_react.py                 # run the daemon (IMAP IDLE push)
  python3 pararius_react.py --poll          # fallback: polling instead of push
  python3 pararius_react.py --once          # one scan then exit
  python3 pararius_react.py --once --dry-run # show what it WOULD open, open nothing
  python3 pararius_react.py --live          # force live (override config dry_run)
  python3 pararius_react.py --test-file x.eml  # parse a saved .eml, print link choice
  python3 pararius_react.py --list-mailboxes   # list IMAP folders
  python3 pararius_react.py --reset-state      # clear the dedup state
"""

import argparse
import email
import html
import json
import imaplib
import re
import select
import ssl
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
CONFIG_FILE = APP_DIR / "config.json"
STATE_FILE = APP_DIR / "state.json"
LOG_FILE = APP_DIR / "pararius_react.log"

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

DEFAULTS = {
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "email": "",                       # your gmail address
    "app_password_keychain": "pararius-react",  # macOS Keychain service name
    "app_password": "",                # plaintext fallback (not recommended)
    "mailbox": "AUTO",                 # AUTO = detect All Mail; or "INBOX", etc.
    "subject_contains": "Just found for you",
    "from_contains": "pararius",
    "link_pattern": r"https?://url\d+\.pararius\.nl/ls/click\?[^\s\"'<>]+",
    "reaction_keywords": ["one click", "react", "reageer", "reageren"],
    "exclude_keywords": ["view this property", "view listing", "bekijk",
                         "view property", "unsubscribe", "afmelden"],
    "lookback_hours": 12,
    "idle_seconds": 120,               # IMAP IDLE refresh + safety re-scan backstop
    "poll_seconds": 30,                # only used with the --poll fallback
    "dry_run": True,                   # START in dry-run; flip to false to go live
    "max_open_per_cycle": 10,
}


# ---------- logging ----------
def log(msg):
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except OSError:
        pass


# ---------- config / state ----------
def load_config():
    cfg = dict(DEFAULTS)
    if CONFIG_FILE.exists():
        try:
            cfg.update(json.loads(CONFIG_FILE.read_text()))
        except (json.JSONDecodeError, OSError) as e:
            log(f"WARNING: could not read config.json ({e}); using defaults")
    return cfg


def load_state():
    if STATE_FILE.exists():
        try:
            s = json.loads(STATE_FILE.read_text())
            s.setdefault("processed", {})
            s.setdefault("skipped", {})
            return s
        except (json.JSONDecodeError, OSError):
            pass
    return {"processed": {}, "skipped": {}}


def save_state(state):
    try:
        STATE_FILE.write_text(json.dumps(state, indent=2))
    except OSError as e:
        log(f"WARNING: could not save state ({e})")


def get_app_password(cfg):
    if cfg.get("app_password"):
        return cfg["app_password"]
    svc = cfg.get("app_password_keychain")
    acct = cfg.get("email")
    if svc:
        try:
            out = subprocess.run(
                ["security", "find-generic-password", "-s", svc, "-a", acct, "-w"],
                capture_output=True, text=True, check=True,
            )
            return out.stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
    return ""


# ---------- HTML link extraction ----------
class LinkExtractor(HTMLParser):
    """Collect every <a> with its visible text and any nested img alt/title."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self._cur = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "a":
            self._cur = {"href": d.get("href", "") or "", "text": "", "alt": ""}
            self._text = []
        elif tag == "img" and self._cur is not None:
            self._cur["alt"] += " " + (d.get("alt", "") or "") + " " + (d.get("title", "") or "")

    def handle_data(self, data):
        if self._cur is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._cur is not None:
            self._cur["text"] = re.sub(r"\s+", " ", " ".join(self._text)).strip()
            self._cur["href"] = html.unescape(self._cur["href"])
            self.links.append(self._cur)
            self._cur = None
            self._text = []


def get_html_body(msg):
    parts = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    parts.append(payload.decode(charset, errors="replace"))
    elif msg.get_content_type() == "text/html":
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            parts.append(payload.decode(charset, errors="replace"))
    return "\n".join(parts)


def pick_links(html_body, cfg):
    """Return (all_clickplus_candidates, chosen_reaction_links)."""
    pattern = re.compile(cfg["link_pattern"])
    ex = LinkExtractor()
    ex.feed(html_body)

    candidates = []
    seen_href = set()
    for l in ex.links:
        if l["href"] and pattern.search(l["href"]) and l["href"] not in seen_href:
            seen_href.add(l["href"])
            candidates.append(l)

    react_kw = [k.lower() for k in cfg["reaction_keywords"]]
    excl_kw = [k.lower() for k in cfg["exclude_keywords"]]

    def label(l):
        return (l["text"] + " " + l["alt"]).lower()

    chosen = [l for l in candidates
              if any(k in label(l) for k in react_kw)
              and not any(x in label(l) for x in excl_kw)]
    return candidates, chosen


# ---------- IMAP ----------
def imap_connect(cfg, pw):
    M = imaplib.IMAP4_SSL(cfg["imap_host"], cfg["imap_port"])
    M.login(cfg["email"], pw)
    return M


def find_all_mail(M):
    typ, data = M.list()
    if typ != "OK":
        return None
    for raw in data:
        s = raw.decode(errors="replace")
        if "\\All" in s:
            m = re.search(r'"([^"]+)"\s*$', s) or re.search(r'(\S+)\s*$', s)
            if m:
                return m.group(1)
    return None


def select_mailbox(M, cfg):
    mb = cfg.get("mailbox", "AUTO")
    if mb == "AUTO":
        mb = find_all_mail(M) or "INBOX"
    for candidate in (mb, "INBOX"):
        try:
            typ, _ = M.select(f'"{candidate}"', readonly=True)
            if typ == "OK":
                return candidate
        except imaplib.IMAP4.error:
            continue
    raise RuntimeError("Could not select any mailbox")


def imap_date(dt):
    return f"{dt.day:02d}-{MONTHS[dt.month - 1]}-{dt.year}"


def search_recent(M, cfg):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=cfg["lookback_hours"])
    crit = ["SINCE", imap_date(cutoff)]
    if cfg.get("subject_contains"):
        crit += ["SUBJECT", f'"{cfg["subject_contains"]}"']
    if cfg.get("from_contains"):
        crit += ["FROM", f'"{cfg["from_contains"]}"']
    typ, data = M.uid("SEARCH", None, *crit)
    if typ != "OK" or not data or not data[0]:
        return []
    return data[0].split()


def fetch_message(M, uid):
    typ, msgdata = M.uid("FETCH", uid, "(BODY.PEEK[])")
    if typ != "OK" or not msgdata or msgdata[0] is None:
        return None
    return email.message_from_bytes(msgdata[0][1])


def decoded_subject(msg):
    try:
        return str(make_header(decode_header(msg.get("Subject", ""))))
    except Exception:
        return msg.get("Subject", "")


def open_url(url):
    subprocess.run(["open", url], check=False)


# ---------- core cycle ----------
def process_once(M, cfg, state):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=cfg["lookback_hours"])
    opened = 0
    for uid in search_recent(M, cfg):
        if opened >= cfg["max_open_per_cycle"]:
            log("Reached max_open_per_cycle; stopping this cycle.")
            break

        msg = fetch_message(M, uid)
        if msg is None:
            continue

        mid = (msg.get("Message-ID") or f"uid:{uid.decode()}").strip()
        if mid in state["processed"] or mid in state["skipped"]:
            continue

        # precise interval filter (IMAP SINCE is date-only)
        try:
            sent = parsedate_to_datetime(msg.get("Date"))
            if sent and sent.tzinfo is None:
                sent = sent.replace(tzinfo=timezone.utc)
            if sent and sent < cutoff:
                continue
        except (TypeError, ValueError):
            pass

        subj = decoded_subject(msg)
        candidates, chosen = pick_links(get_html_body(msg), cfg)
        log(f"Email: {subj!r}  candidates={len(candidates)} reaction={len(chosen)}")
        for l in candidates:
            tag = "REACT" if l in chosen else "other"
            label = (l["text"] or l["alt"].strip())[:48]
            log(f"   [{tag}] {label!r} -> {l['href'][:90]}")

        if not chosen:
            log("   !! No reaction link matched. Marking skipped (adjust keywords + --reset-state to retry).")
            state["skipped"][mid] = {"subject": subj, "ts": time.time()}
            save_state(state)
            continue

        if cfg["dry_run"]:
            for l in chosen:
                log(f"   DRY-RUN would open: {l['href']}")
            continue  # do not record, so going live will act on these

        for l in chosen:
            open_url(l["href"])
            log(f"   OPENED: {l['href']}")
            opened += 1
            time.sleep(2)
        state["processed"][mid] = {"subject": subj, "ts": time.time(),
                                   "links": [l["href"] for l in chosen]}
        save_state(state)

    return opened


def imap_idle(M, timeout):
    """Issue IMAP IDLE, block until the server pushes activity (or `timeout`s
    elapse), then end IDLE. Returns True if new mail was signalled.

    This is the push: Gmail holds the connection and notifies us the instant a
    message arrives. The timeout only exists to refresh IDLE (servers drop it
    after ~30 min) and to trigger a cheap safety re-scan.
    """
    tag = M._new_tag()
    M.send(tag + b" IDLE\r\n")
    resp = M.readline()
    if not resp.startswith(b"+"):
        raise imaplib.IMAP4.abort(f"IDLE not accepted: {resp!r}")

    new_mail = False
    try:
        ready, _, _ = select.select([M.sock], [], [], timeout)
        if ready:
            M.sock.settimeout(2)
            while True:
                line = M.readline()
                if not line:
                    break
                if b"EXISTS" in line or b"RECENT" in line:
                    new_mail = True
                more, _, _ = select.select([M.sock], [], [], 0)
                if not more:
                    break
    except (OSError, ssl.SSLError):
        new_mail = True  # something happened; rescan and let reconnect heal if needed
    finally:
        try:
            M.sock.settimeout(None)
        except OSError:
            pass
        M.send(b"DONE\r\n")
        try:
            M.sock.settimeout(10)
            while True:
                line = M.readline()
                if not line or line.startswith(tag):
                    break
        except (OSError, ssl.SSLError):
            raise imaplib.IMAP4.abort("connection lost while ending IDLE")
        finally:
            try:
                M.sock.settimeout(None)
            except OSError:
                pass
    return new_mail


def run_idle_daemon(cfg):
    """Default daemon: event-driven via IMAP IDLE (push), with reconnect and a
    catch-up scan on every (re)connect so nothing is missed across sleep/wake."""
    pw = get_app_password(cfg)
    if not pw:
        log("FATAL: no app password found (set it in Keychain or config.json). See README.")
        sys.exit(1)
    if not cfg.get("email"):
        log("FATAL: 'email' is empty in config.json.")
        sys.exit(1)

    log(f"Starting (push / IMAP IDLE). dry_run={cfg['dry_run']} "
        f"idle_refresh={cfg['idle_seconds']}s lookback={cfg['lookback_hours']}h")
    state = load_state()
    M = None
    while True:
        try:
            if M is None:
                M = imap_connect(cfg, pw)
                mb = select_mailbox(M, cfg)
                log(f"Connected (push mode). Mailbox: {mb}")
                process_once(M, cfg, state)  # catch up on anything missed while away
            got = imap_idle(M, cfg["idle_seconds"])
            if got:
                log("Push received: new mail signalled.")
            select_mailbox(M, cfg)  # refresh mailbox view
            process_once(M, cfg, state)
        except (imaplib.IMAP4.abort, imaplib.IMAP4.error, OSError, ssl.SSLError) as e:
            log(f"Connection dropped ({e}); reconnecting...")
            try:
                M.logout()
            except Exception:
                pass
            M = None
            time.sleep(3)
        except Exception as e:
            log(f"ERROR: {e}")
            try:
                M.logout()
            except Exception:
                pass
            M = None
            time.sleep(5)


def run_daemon(cfg):
    """Fallback polling daemon (use --poll). Prefer run_idle_daemon."""
    pw = get_app_password(cfg)
    if not pw:
        log("FATAL: no app password found (set it in Keychain or config.json). See README.")
        sys.exit(1)
    if not cfg.get("email"):
        log("FATAL: 'email' is empty in config.json.")
        sys.exit(1)

    log(f"Starting (polling fallback). dry_run={cfg['dry_run']} poll={cfg['poll_seconds']}s "
        f"lookback={cfg['lookback_hours']}h")
    state = load_state()
    M = None
    while True:
        try:
            if M is None:
                M = imap_connect(cfg, pw)
                mb = select_mailbox(M, cfg)
                log(f"Connected. Mailbox: {mb}")
            else:
                try:
                    M.noop()
                except Exception:
                    try:
                        M.logout()
                    except Exception:
                        pass
                    M = imap_connect(cfg, pw)
                    select_mailbox(M, cfg)
                    log("Reconnected after wake/drop.")
            select_mailbox(M, cfg)  # refresh mailbox view for new mail
            process_once(M, cfg, state)
        except Exception as e:
            log(f"ERROR: {e}")
            try:
                M.logout()
            except Exception:
                pass
            M = None
        time.sleep(cfg["poll_seconds"])


# ---------- one-off helpers ----------
def cmd_test_file(path, cfg):
    raw = Path(path).read_bytes()
    msg = email.message_from_bytes(raw)
    print(f"Subject: {decoded_subject(msg)!r}\n")
    candidates, chosen = pick_links(get_html_body(msg), cfg)
    if not candidates:
        print("No Click+ (url<N>.pararius.nl/ls/click) links found at all.")
        return
    print(f"{len(candidates)} Click+ link(s) found:\n")
    for l in candidates:
        tag = "REACT  <-- would open" if l in chosen else "skip"
        label = l["text"] or l["alt"].strip()
        print(f"  [{tag}]")
        print(f"     label: {label!r}")
        print(f"     href : {l['href']}\n")
    print(f"=> {len(chosen)} link(s) would be opened.")


def cmd_list_mailboxes(cfg):
    pw = get_app_password(cfg)
    M = imap_connect(cfg, pw)
    typ, data = M.list()
    for raw in (data or []):
        print(raw.decode(errors="replace"))
    M.logout()


def main():
    ap = argparse.ArgumentParser(description="Pararius local auto-react")
    ap.add_argument("--once", action="store_true", help="run one scan then exit")
    ap.add_argument("--dry-run", action="store_true", help="force dry-run")
    ap.add_argument("--live", action="store_true", help="force live (open links)")
    ap.add_argument("--test-file", metavar="EML", help="parse a saved .eml and show link choice")
    ap.add_argument("--list-mailboxes", action="store_true", help="list IMAP folders")
    ap.add_argument("--reset-state", action="store_true", help="clear dedup state")
    ap.add_argument("--poll", action="store_true", help="use polling instead of IMAP IDLE push")
    args = ap.parse_args()

    cfg = load_config()
    if args.dry_run:
        cfg["dry_run"] = True
    if args.live:
        cfg["dry_run"] = False

    if args.test_file:
        cmd_test_file(args.test_file, cfg)
        return
    if args.list_mailboxes:
        cmd_list_mailboxes(cfg)
        return
    if args.reset_state:
        save_state({"processed": {}, "skipped": {}})
        print("State cleared.")
        return

    if args.once:
        pw = get_app_password(cfg)
        if not pw or not cfg.get("email"):
            print("Missing email or app password. See README.")
            sys.exit(1)
        state = load_state()
        M = imap_connect(cfg, pw)
        select_mailbox(M, cfg)
        n = process_once(M, cfg, state)
        M.logout()
        print(f"Done. Opened {n} link(s). dry_run={cfg['dry_run']}")
        return

    if args.poll:
        run_daemon(cfg)
    else:
        run_idle_daemon(cfg)


if __name__ == "__main__":
    main()
