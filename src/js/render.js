/* ════════ RENDER + SORT/FILTER WIRING ════════
 * drawSE / drawH / drawP table renderers, computeStats, drawGlobal, and the
 * price/status sort toggles. Classic script — relies on globals from data.js
 * (seD/hD/pD) and status.js (getStatus, parsePrice, fmtD, fmtTS, getF, etc.). */

// ── HTML-escape for scraped free-text fields interpolated into innerHTML ──
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ── Price sort state ───────────────────────────────────────
const _sortPrice = { se: 'none', h: 'none', p: 'none' };

function togglePriceSort(src) {
  // Clicking price sort clears status sort (mutually exclusive)
  _sortStatus[src] = 'none';
  const sArrow = document.getElementById(src + '-status-arrow');
  const sTh    = document.getElementById(src + '-status-th');
  if (sArrow) { sArrow.textContent = '↕'; sTh.className = 'th-sort'; }

  _sortPrice[src] = _sortPrice[src] === 'asc' ? 'desc' : 'asc';
  const th    = document.getElementById(src + '-price-th');
  const arrow = document.getElementById(src + '-sort-arrow');
  if (th) {
    th.className = 'th-sort sort-' + _sortPrice[src];
    arrow.textContent = _sortPrice[src] === 'asc' ? '↓' : '↑';
  }
  src === 'se' ? drawSE() : drawH();
}

// ── Status sort ───────────────────────────────────────────
const _sortStatus = { se: 'asc', h: 'asc', p: 'asc' }; // always active, default ascending

function toggleStatusSort(src) {
  // Deactivate price sort when status is clicked
  _sortPrice[src] = 'none';
  const pArrow = document.getElementById(src + '-sort-arrow');
  const pTh    = document.getElementById(src + '-price-th');
  if (pArrow) { pArrow.textContent = '↕'; pTh.className = 'th-sort'; }

  // Cycle asc → desc → asc only, never 'none'
  _sortStatus[src] = _sortStatus[src] === 'asc' ? 'desc' : 'asc';
  const th    = document.getElementById(src + '-status-th');
  const arrow = document.getElementById(src + '-status-arrow');
  if (th) {
    th.className = 'th-sort sort-' + _sortStatus[src];
    arrow.textContent = _sortStatus[src] === 'asc' ? '↓' : '↑';
  }
  src === 'se' ? drawSE() : drawH();
}

// ── SE ────────────────────────────────────────────
function drawSE(){
  const items=Object.values(seD.studios);
  const lc=seD.checks?.at(-1);
  const newS=new Set(lc?.new_ids||[]);

  // ── 4 analytics ──────────────────────────────────
  // 1. New: listings in the latest logged check's new_ids (same source as the New badge)
  const cntNew  = items.filter(s=>newS.has(s.id)).length;
  // 2. Sent: status = 'sent' (all time, any listing)
  const cntApp  = items.filter(s=>getStatus('se',s.id)==='sent').length;
  // 3. Pending: starred or queued AND currently available (SE is already student-only)
  const cntPnd  = items.filter(s=>s.available && ['starred','queued'].includes(getStatus('se',s.id))).length;
  // 4. Expired: cumulative count of listings ever marked expired:true (matches global)
  const cntExp  = items.filter(s=>s.expired===true).length;

  document.getElementById('se-lc').textContent=fmtTS(seD.last_checked);

  if(cntNew){
    const a=document.getElementById('se-alert');
    a.classList.add('on');
    a.innerHTML=`${cntNew} new studio${cntNew>1?'s':''} at Student Experience NDSM today<span class="alert-sep">·</span><span class="alert-dot"></span>${cntApp} applied`;
  }

  const prevS=new Set(seD.checks?.at(-2)?.studio_ids||[]), currS=new Set(lc?.studio_ids||[]);
  const goneS=new Set([...prevS].filter(x=>!currS.has(x)));

  const f=getF('se');
  let list=items;
  if(f==='available')    list=items.filter(s=>s.available);
  else if(f==='new')     list=items.filter(s=>newS.has(s.id));

  // Unassigned+new items always float to top; otherwise status asc is the default
  function seStatusVal(s) {
    const sv = getStatus('se', s.id);
    if (sv === '' && newS.has(s.id)) return -1;
    return STATUS_ORDER[sv] ?? 5;
  }
  if (_sortPrice.se !== 'none') {
    list.sort((a,b)=>{ const d=parsePrice(a.price)-parsePrice(b.price); return _sortPrice.se==='asc'?d:-d; });
  } else {
    list.sort((a,b)=>{ const d=seStatusVal(a)-seStatusVal(b); return _sortStatus.se==='asc'?d:-d; });
  }

  const tb=document.getElementById('se-body');
  // Remove rows that have been expired for 2+ days (stats still count them)
  const visibleList = list.filter(s => !isHiddenExpired(s));
  if(!visibleList.length){ tb.innerHTML=`<tr><td colspan="7"><div class="empty">No studios match this filter.</div></td></tr>`; return; }
  tb.innerHTML=visibleList.map(s=>{
    const iN=newS.has(s.id), iG=goneS.has(s.id)||s.expired, sv=getStatus('se',s.id);
    return `<tr class="${iN?'r-new':''}${iG?' r-gone':''}">
      <td class="col-name"><a href="${esc(s.href)}" target="_blank">${esc(s.name)}</a>${iN?'<span class="b b-new">New</span>':''}${iG?'<span class="b b-gone">Gone</span>':''}</td>
      <td class="col-muted">${s.size||'—'}</td>
      <td class="col-muted">${(s.stayType||'').replace(/ Not furnished| Furnished/g,'').trim()||'—'}</td>
      <td class="col-muted">${s.furnished||'—'}</td>
      <td class="col-price">${s.price||'—'}</td>
      <td class="col-date">${s.expiry?fmtD(s.expiry):'—'}</td>
      <td><select class="sel ${sv}" onchange="setStatus('se','${s.id}',this)">
        <option value="" ${sv===''?'selected':''}>—</option>
        <option value="starred" ${sv==='starred'?'selected':''}>Starred</option>
        <option value="queued" ${sv==='queued'?'selected':''}>Queued</option>
        <option value="referenced" ${sv==='referenced'?'selected':''}>Referenced</option>
        <option value="sent" ${sv==='sent'?'selected':''}>Sent</option>
        <option value="pass" ${sv==='pass'?'selected':''}>Pass</option>
      </select></td></tr>`;
  }).join('');

  const hb=document.getElementById('se-hb');
  hb.innerHTML=(seD.checks?.length?[...seD.checks].reverse():[]).map(c=>
    `<div class="hist-row"><span class="hist-d">${fmtD(c.date)}</span><span class="hist-ct">${c.studio_ids?.length||0} available</span>${c.new_ids?.length?`<span class="hist-new">+${c.new_ids.length} new</span>`:''}${c.gone_ids?.length?`<span class="hist-gone">−${c.gone_ids.length} gone</span>`:''}</div>`
  ).join('')||`<div class="empty" style="padding:12px">No history yet.</div>`;
}

// ── Hausing ────────────────────────────────────────
function drawH(){
  const items=Object.values(hD.listings);
  const lc=hD.checks?.at(-1);
  const newS=new Set(lc?.new_ids||[]);

  // ── 4 analytics ──────────────────────────────────
  // 1. New: listings in the latest logged check's new_ids (same source as the New badge)
  const cntNew = items.filter(l=>newS.has(l.id)).length;
  // 2. Sent: status = 'sent' (all time, all listings)
  const cntApp = items.filter(l=>getStatus('h',l.id)==='sent').length;
  // 3. Pending: starred or queued AND available AND studentsAllowed='yes'
  const cntPnd = items.filter(l=>l.available_listing && l.studentsAllowed==='yes' && ['starred','queued'].includes(getStatus('h',l.id))).length;
  // 4. Expired: cumulative count of listings ever marked expired:true (matches global)
  const cntExp = items.filter(l=>l.expired===true).length;

  document.getElementById('h-lc').textContent=fmtTS(hD.last_checked);

  const nc=items.filter(l=>newS.has(l.id) && l.studentsAllowed==='yes').length;
  if(nc){
    const a=document.getElementById('h-alert');
    a.classList.add('on');
    a.innerHTML=`${nc} new student-friendly listing${nc>1?'s':''} on Hausing Amsterdam today<span class="alert-sep">·</span><span class="alert-dot"></span>${cntApp} applied`;
  }

  const prevS=new Set(hD.checks?.at(-2)?.listing_ids||[]), currS=new Set(lc?.listing_ids||[]);
  const goneS=new Set([...prevS].filter(x=>!currS.has(x)));

  const f=getF('h');

  // The student-friendly and non-student groups are ALWAYS kept separate in code.
  // Filtering and sorting happens independently within each group.
  // The orange divider always marks the boundary between them.
  function filterGroup(group) {
    if(f==='available')    return group.filter(l=>l.available_listing);
    if(f==='students-ok')  return group.filter(l=>l.available_listing); // non-student group hidden below
    if(f==='new')          return group.filter(l=>newS.has(l.id));
    return group; // 'all'
  }

  // Unassigned+new items always float to top within their group
  function hStatusVal(l) {
    const sv = getStatus('h', l.id);
    if (sv === '' && newS.has(l.id)) return -1;
    return STATUS_ORDER[sv] ?? 5;
  }
  const priceCmp  = (a,b) => { const d=parsePrice(a.price)-parsePrice(b.price); return _sortPrice.h==='asc'?d:-d; };
  const statusCmp = (a,b) => { const d=hStatusVal(a)-hStatusVal(b); return _sortStatus.h==='asc'?d:-d; };
  const cmp = _sortPrice.h !== 'none' ? priceCmp : statusCmp;

  // Remove rows that have been expired for 2+ days (stats still count them)
  const notHidden = items.filter(l => !isHiddenExpired(l));
  let studentGroup = filterGroup(notHidden.filter(l=>l.studentsAllowed==='yes')).sort(cmp);
  // Non-student group is hidden when filtering to students-ok view
  let nonStudentGroup = f==='students-ok' ? [] : filterGroup(notHidden.filter(l=>l.studentsAllowed!=='yes')).sort(cmp);

  const dividerIdx = studentGroup.length > 0 && nonStudentGroup.length > 0 ? studentGroup.length : -1;
  const list = [...studentGroup, ...nonStudentGroup];

  const tb=document.getElementById('h-body');
  if(!list.length){ tb.innerHTML=`<tr><td colspan="10"><div class="empty">No listings match this filter.</div></td></tr>`; return; }

  tb.innerHTML=list.map((l,i)=>{
    const divider = i===dividerIdx
      ? `<tr class="no-student-divider"><td colspan="10"><div></div></td></tr>`
      : '';
    const iN=newS.has(l.id), iG=goneS.has(l.id)||!l.available_listing||l.expired, sv=getStatus('h',l.id);
    const sl=l.studentsAllowed==='yes'?'<span class="b b-yes">Yes</span>':l.studentsAllowed==='no'?'<span class="b b-no">No</span>':'<span class="b b-unk">?</span>';
    return divider + `<tr class="${iN?'r-new':''}${iG?' r-gone':''}">
      <td class="col-name"><a href="${esc(l.href)}" target="_blank">${esc(l.address)}</a>${iN?'<span class="b b-new">New</span>':''}${iG?'<span class="b b-gone">Gone</span>':''}</td>
      <td class="col-muted">${esc(l.neighborhood)||'—'}</td>
      <td class="col-muted">${l.bedrooms||'—'}</td>
      <td class="col-muted">${l.size||'—'}</td>
      <td class="col-price">${l.price||'—'}</td>
      <td class="col-date">${l.available||'—'}</td>
      <td>${sl}</td>
      <td class="col-muted">${l.incomeReq||'—'}</td>
      <td class="col-date">${fmtD(l.first_seen)}</td>
      <td><select class="sel ${sv}" onchange="setStatus('h','${l.id}',this)">
        <option value="" ${sv===''?'selected':''}>—</option>
        <option value="starred" ${sv==='starred'?'selected':''}>Starred</option>
        <option value="queued" ${sv==='queued'?'selected':''}>Queued</option>
        <option value="referenced" ${sv==='referenced'?'selected':''}>Referenced</option>
        <option value="sent" ${sv==='sent'?'selected':''}>Sent</option>
        <option value="pass" ${sv==='pass'?'selected':''}>Pass</option>
      </select></td></tr>`;
  }).join('');

  const hb=document.getElementById('h-hb');
  hb.innerHTML=(hD.checks?.length?[...hD.checks].reverse():[]).map(c=>
    `<div class="hist-row"><span class="hist-d">${fmtD(c.date)}</span><span class="hist-ct">${c.listing_ids?.length||0} available</span>${c.new_ids?.length?`<span class="hist-new">+${c.new_ids.length} new</span>`:''}${c.gone_ids?.length?`<span class="hist-gone">−${c.gone_ids.length} gone</span>`:''}</div>`
  ).join('')||`<div class="empty" style="padding:12px">No history yet.</div>`;
}

// ── Pararius ──────────────────────────────────────────────
// INPUT FLOW STUB — connect here when email flow is ready:
//   1. Gmail MCP reads daily Pararius notification email
//   2. Extract listing URLs from email body
//   3. Navigate to each URL (may require login to pararius.com)
//   4. Scrape: address, neighborhood, size, bedrooms, price, available date
//   5. Diff against pD.listings{} — compute NEW_IDS and GONE_IDS
//   6. Set expired_since on newly gone listings (same rule as hausing/se)
//   7. Write updated pararius-data JSON back to tracker.html via Edit tool
//   8. Set pD.last_checked = NOW
function drawP() {
  const items = Object.values(pD.listings);
  const lc    = pD.checks?.at(-1);
  const newS  = new Set(lc?.new_ids || []);

  document.getElementById('p-lc').textContent = pD.last_checked ? fmtTS(pD.last_checked) : 'not connected';

  if (items.filter(l=>newS.has(l.id)).length > 0) {
    const cntNew = items.filter(l=>newS.has(l.id)).length;
    const cntApp = items.filter(l=>getStatus('p',l.id)==='sent').length;
    const a = document.getElementById('p-alert');
    a.classList.add('on');
    a.innerHTML = `${cntNew} new listing${cntNew>1?'s':''} on Pararius Amsterdam today<span class="alert-sep">·</span><span class="alert-dot"></span>${cntApp} applied`;
  }

  const prevS = new Set(pD.checks?.at(-2)?.listing_ids||[]);
  const currS = new Set(lc?.listing_ids||[]);
  const goneS = new Set([...prevS].filter(x=>!currS.has(x)));

  const f = getF('p');
  const notHidden = items.filter(l => !isHiddenExpired(l));
  let list = notHidden;
  if (f==='available') list = notHidden.filter(l=>l.available_listing);
  else if (f==='new')  list = notHidden.filter(l=>newS.has(l.id));

  function pStatusVal(l) {
    const sv = getStatus('p', l.id);
    if (sv === '' && newS.has(l.id)) return -1;
    return STATUS_ORDER[sv] ?? 5;
  }
  const priceCmp  = (a,b) => { const d=parsePrice(a.price)-parsePrice(b.price); return _sortPrice.p==='asc'?d:-d; };
  const statusCmp = (a,b) => { const d=pStatusVal(a)-pStatusVal(b); return _sortStatus.p==='asc'?d:-d; };
  list.sort(_sortPrice.p !== 'none' ? priceCmp : statusCmp);

  const tb = document.getElementById('p-body');
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="8"><div class="empty">${items.length===0?'Not connected... Waiting for Pararius input flow.':'No listings match this filter.'}</div></td></tr>`;
  } else {
    tb.innerHTML = list.map(l => {
      const iN=newS.has(l.id), iG=goneS.has(l.id)||!l.available_listing||l.expired, sv=getStatus('p',l.id);
      return `<tr class="${iN?'r-new':''}${iG?' r-gone':''}">
        <td class="col-name"><a href="${esc(l.href)}" target="_blank">${esc(l.address)}</a>${iN?'<span class="b b-new">New</span>':''}${iG?'<span class="b b-gone">Gone</span>':''}</td>
        <td class="col-muted">${esc(l.neighborhood)||'—'}</td>
        <td class="col-muted">${l.bedrooms||'—'}</td>
        <td class="col-muted">${l.size||'—'}</td>
        <td class="col-price">${l.price||'—'}</td>
        <td class="col-date">${l.available||'—'}</td>
        <td class="col-date">${fmtD(l.first_seen)}</td>
        <td><select class="sel ${sv}" onchange="setStatus('p','${l.id}',this)">
          <option value="" ${sv===''?'selected':''}>—</option>
          <option value="starred" ${sv==='starred'?'selected':''}>Starred</option>
          <option value="queued" ${sv==='queued'?'selected':''}>Queued</option>
          <option value="referenced" ${sv==='referenced'?'selected':''}>Referenced</option>
          <option value="sent" ${sv==='sent'?'selected':''}>Sent</option>
          <option value="pass" ${sv==='pass'?'selected':''}>Pass</option>
        </select></td></tr>`;
    }).join('');
  }

  const hb = document.getElementById('p-hb');
  hb.innerHTML = (pD.checks?.length ? [...pD.checks].reverse() : []).map(c=>
    `<div class="hist-row"><span class="hist-d">${fmtD(c.date)}</span><span class="hist-ct">${c.listing_ids?.length||0} available</span>${c.new_ids?.length?`<span class="hist-new">+${c.new_ids.length} new</span>`:''}${c.gone_ids?.length?`<span class="hist-gone">-${c.gone_ids.length} gone</span>`:''}</div>`
  ).join('') || `<div class="empty" style="padding:12px">No history yet.</div>`;
}

// ── Global combined analytics ─────────────────────────────
// Returns {new, app, pnd, exp} for a given provider's data and source key.
// To add a new provider: call computeStats(srcKey, dataObj) and include it
// in the providers[] array inside drawGlobal().
function computeStats(src, data, isHausing) {
  const newS = new Set(data.checks?.at(-1)?.new_ids || []);
  const allItems = isHausing ? Object.values(data.listings) : Object.values(data.studios);
  return {
    new: allItems.filter(x => newS.has(x.id)).length,
    app: allItems.filter(x => getStatus(src, x.id) === 'sent').length,
    // Active = active listings with status 'starred' or 'queued'.
    // NOTE: if statuses are renamed or new ones added in the future,
    // update the array below so the Active counter stays accurate.
    pnd: allItems.filter(x =>
      (isHausing ? (x.available_listing && x.studentsAllowed === 'yes') : x.available) &&
      ['starred', 'queued'].includes(getStatus(src, x.id))
    ).length,
    exp: allItems.filter(x => x.expired === true).length // all ever-expired listings, cumulative
  };
}

function drawGlobal() {
  // COMBINED ANALYTICS — add new providers here.
  // Each entry: computeStats(sourceKey, dataObject, isHausing)
  // The reduce sums all providers into one total automatically.
  const providers = [
    computeStats('se', seD, false),
    computeStats('h',  hD,  true),
    computeStats('p',  pD,  true),   // Pararius — active once input flow is connected
    // Future provider: computeStats('provider4', p4D, true/false),
  ];
  const t = providers.reduce((a,s) => ({new:a.new+s.new, app:a.app+s.app, pnd:a.pnd+s.pnd, exp:a.exp+s.exp}), {new:0,app:0,pnd:0,exp:0});
  document.getElementById('g-new').textContent = t.new;
  document.getElementById('g-app').textContent = t.app;
  document.getElementById('g-pnd').textContent = t.pnd;
  document.getElementById('g-exp').textContent = t.exp;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { esc, _sortPrice, togglePriceSort, _sortStatus, toggleStatusSort, drawSE, drawH, drawP, computeStats, drawGlobal };
}
