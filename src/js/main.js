/* ════════ INIT / BOOTSTRAP ════════
 * Runs LAST. Wires the filter buttons and initialises the status-sort arrows.
 * The table draws + intro motion are booted by hero.js; this file only attaches
 * the load-time listeners that lived at the top and bottom of the original
 * first <script> block, preserving their behaviour. */

// Filter buttons: activate the clicked one within its source group, then redraw.
document.querySelectorAll('.fb').forEach(b=>b.addEventListener('click',()=>{
  const s=b.dataset.src;
  document.querySelectorAll(`.fb[data-src="${s}"]`).forEach(x=>x.classList.remove('on'));
  b.classList.add('on');
  s==='se'?drawSE():s==='h'?drawH():drawP();
}));

// Initialise status sort arrows to show active ascending state on load
['se','h','p'].forEach(src => {
  const th    = document.getElementById(src + '-status-th');
  const arrow = document.getElementById(src + '-status-arrow');
  if (th && arrow) { th.className = 'th-sort sort-asc'; arrow.textContent = '↓'; }
});

if (typeof module !== 'undefined' && module.exports) { module.exports = {}; }
