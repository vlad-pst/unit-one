/* ════════ STATUS STORE + SHARED HELPERS ════════
 * _ST status store (localStorage keys oa_se_st / oa_h_st, migrations,
 * STATUS_ORDER), plus the formatting/util helpers used across render & hero
 * (parsePrice, fmtD, fmtTS, tog, getF, isHiddenExpired, daysSince).
 * Classic script: all declarations stay top-level so render/hero/main can see them. */

function parsePrice(p) {
  if (!p) return 0;
  const m = String(p).replace(/[€\s*,.]/g, '').match(/\d+/);
  return m ? parseInt(m[0]) : 0;
}

// ── Status sort order ──────────────────────────────────────
// Asc order: Starred(0) → Queued(1) → Referenced(2) → Sent(3) → Pass(4) → unset(5)
const STATUS_ORDER = { 'starred': 0, 'queued': 1, 'referenced': 2, 'sent': 3, 'pass': 4, '': 5 };

// ── Expired visibility rule ────────────────────────────────
// A listing is hidden from the table (but still counted in stats) when:
//   expired === true AND expired_since is 1 or more days ago.
// expired_since is set by the scheduled task on the day it first marks
// a listing as gone. Day 0 = visible as expired. Day 1+ = hidden.
function daysSince(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr + 'T12:00:00');
  return Math.floor((new Date() - d) / 86400000);
}
function isHiddenExpired(item) {
  return item.expired === true && daysSince(item.expired_since) >= 1;
}

// ── Status storage: in-memory primary, localStorage secondary ──────────
// _ST is the single source of truth for the current session.
// localStorage is loaded once at startup and flushed on every change.
const _ST = { se: {}, h: {} };

(function loadStatuses() {
  // Migrate old status values to new names (runs once, harmless on subsequent loads)
  const MIGRATE = { 'interested': 'starred', 'pending': 'queued', 'applied': 'sent', 'not-interested': 'pass' };
  function migrateObj(obj) {
    let changed = false;
    Object.keys(obj).forEach(id => {
      if (MIGRATE[obj[id]]) { obj[id] = MIGRATE[obj[id]]; changed = true; }
    });
    return changed;
  }
  try {
    const se = localStorage.getItem('oa_se_st');
    const h  = localStorage.getItem('oa_h_st');
    if (se) _ST.se = JSON.parse(se);
    if (h)  _ST.h  = JSON.parse(h);
    // Apply migration and persist if anything changed
    if (migrateObj(_ST.se)) localStorage.setItem('oa_se_st', JSON.stringify(_ST.se));
    if (migrateObj(_ST.h))  localStorage.setItem('oa_h_st',  JSON.stringify(_ST.h));
    // One-time migration v2: wipe all 'queued' → '' (blank/unassigned).
    // Runs exactly once. After this, 'queued' is a deliberate user choice again.
    if (!localStorage.getItem('oa_migration_v2')) {
      ['se','h','p'].forEach(src => {
        if (!_ST[src]) return;
        Object.keys(_ST[src]).forEach(id => { if (_ST[src][id] === 'queued') _ST[src][id] = ''; });
      });
      localStorage.setItem('oa_se_st', JSON.stringify(_ST.se));
      localStorage.setItem('oa_h_st',  JSON.stringify(_ST.h));
      localStorage.setItem('oa_migration_v2', '1');
    }
  } catch(e) { /* localStorage unavailable — in-memory only */ }
})();

function saveStatuses() {
  try {
    localStorage.setItem('oa_se_st', JSON.stringify(_ST.se));
    localStorage.setItem('oa_h_st',  JSON.stringify(_ST.h));
  } catch(e) {}
}

// Called from inline onchange on each select.
// Updates ONLY that select element — no table redraw.
function setStatus(src, id, sel) {
  const val = sel.value;
  _ST[src][id] = val;
  saveStatuses();
  // Update class in place (styling)
  sel.className = 'sel ' + val;
  // Show a brief flash on the row
  const row = sel.closest('tr');
  if (row) {
    row.style.transition = 'background 0.3s';
    row.style.background = val === 'starred'  ? 'rgba(194,65,12,0.04)'
                         : val === 'sent'     ? 'rgba(43,36,32,0.04)'
                         : val === 'queued'   ? 'rgba(138,125,107,0.04)'
                         : '';
    setTimeout(() => { row.style.background = ''; }, 600);
  }
  // If a filter is active that would now hide this row, re-draw
  const f = getF(src);
  if (f !== 'all' && f !== 'new') {
    src === 'se' ? drawSE() : drawH();
  }
}

function getStatus(src, id) { return _ST[src]?.[id] ?? ''; }

function fmtD(s){ if(!s)return'—'; const iso=/^\d{4}-\d{2}-\d{2}$/.test(s); const d=new Date(iso?s+'T12:00:00':s); if(isNaN(d))return s; return d.toLocaleDateString('en-NL',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtTS(s){ if(!s)return'—'; const d=new Date(s); const tz={timeZone:'Europe/Amsterdam'}; return d.toLocaleDateString('en-NL',{day:'2-digit',month:'short',...tz})+' '+d.toLocaleTimeString('en-NL',{hour:'2-digit',minute:'2-digit',...tz}); }
function tog(bid,aid){ const b=document.getElementById(bid),a=document.getElementById(aid); b.classList.toggle('open'); a.textContent=b.classList.contains('open')?(a.textContent.replace('▾','▴')):(a.textContent.replace('▴','▾')); }
function getF(src){ return document.querySelector(`.fb[data-src="${src}"].on`)?.dataset.f||'all'; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parsePrice, STATUS_ORDER, daysSince, isHiddenExpired, _ST, saveStatuses, setStatus, getStatus, fmtD, fmtTS, tog, getF };
}
