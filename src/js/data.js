/* ════════ DATA LOADING ════════
 * Parses the three inline <script type="application/json"> data blocks that stay
 * embedded in tracker.html (a daily automation edits between their markers).
 * Loaded FIRST so seD/hD/pD exist before status/render/hero/main run. */
const seD = JSON.parse(document.getElementById('se-data').textContent);
const hD  = JSON.parse(document.getElementById('hausing-data').textContent);
const pD  = JSON.parse(document.getElementById('pararius-data').textContent);

if (typeof module !== 'undefined' && module.exports) { module.exports = { seD, hD, pD }; }
