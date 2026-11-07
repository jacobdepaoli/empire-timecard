/**
 * Empire Hub ⇄ Google Sheet: two-way inventory sync
 *
 * Setup (one time, about 5 minutes):
 *   1. In the Google Sheet: Extensions → Apps Script. Delete what's there, paste this whole file, click Save.
 *   2. Reload the Google Sheet. A new "Empire Hub" menu appears.
 *   3. Empire Hub → Set up sync… → paste the sync key from Empire Hub → Inventory → Google Sheet.
 *      Google asks you to allow the script once. Choose your account → Advanced → Go to (project) → Allow.
 *
 * How it works:
 *   - The "Hub Inventory" tab mirrors the hub. Every item is one row, keyed by SKU.
 *   - Edit a white cell and it's saved to the hub within a few seconds. Gray columns come from the hub.
 *   - Changing "On hand · Main Shop" records a count at Main Shop in the hub, with your name on it.
 *   - Hub changes (issues to jobs, receiving, edits) come back every 5 minutes, or use Empire Hub → Sync now.
 *   - New item: type it on an empty row (Item + Category). The hub assigns the SKU.
 *   - Retire an item: untick Active. Deleting a row doesn't delete anything in the hub.
 *   - If a row can't be saved, the Item cell turns red and its note says why.
 *
 * Keep this sheet shared with office admins only: anyone who can edit it can open this script.
 */
const HUB_URL = 'https://rtwcsballappgddiklsh.supabase.co/functions/v1/sheets-sync';
const TAB = 'Hub Inventory';
const TZ = 'America/Los_Angeles';

// [key, header, mode, width]   mode: edit = synced both ways, ro = from the hub, hidden = sync bookkeeping
const COLS = [
  ['sku', 'SKU', 'ro', 80],
  ['category', 'Category', 'edit', 200],
  ['family', 'Subcategory', 'edit', 220],
  ['name', 'Item', 'edit', 280],
  ['size_rating', 'Size / rating', 'edit', 110],
  ['configuration', 'Configuration', 'edit', 120],
  ['unit', 'Unit', 'edit', 60],
  ['type', 'Type', 'edit', 100],
  ['on_hand', 'On hand · Main Shop', 'edit', 110],
  ['on_hand_total', 'On hand · All', 'ro', 90],
  ['min_qty', 'Reorder at', 'edit', 80],
  ['unit_cost', 'Unit cost', 'edit', 90],
  ['value', 'Value', 'ro', 90],
  ['other_locations', 'Trucks & other locations', 'ro', 180],
  ['mfr_part_number', 'Mfr part #', 'edit', 120],
  ['photo_location', 'Shop location / bin', 'edit', 160],
  ['billable', 'Billable', 'edit', 70],
  ['active', 'Active', 'edit', 60],
  ['notes', 'Notes', 'edit', 240],
  ['updated_at', 'Last edited', 'ro', 120],
  ['_sync', '_sync', 'hidden', 50],
];
const IDX = {};
COLS.forEach(function (c, i) { IDX[c[0]] = i; });
const EDIT = COLS.filter(function (c) { return c[2] === 'edit'; }).map(function (c) { return c[0]; });
const RO = ['on_hand_total', 'value', 'other_locations', 'updated_at'];
const NCOL = COLS.length;
const GREEN = '#2E7D32', GRAY = '#F1F3EF', ERR = '#FDECEA';

// ─── Menu ────────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Empire Hub')
    .addItem('Sync now', 'syncNow')
    .addItem('Set up sync…', 'setup')
    .addSeparator()
    .addItem('Stop syncing', 'stopSync')
    .addToUi();
}

function setup() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Connect to Empire Hub',
    'Paste the sync key from Empire Hub → Inventory → Google Sheet (it starts with ehsync_).', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const key = resp.getResponseText().trim();
  if (!/^ehsync_[0-9a-f]{48}$/.test(key)) { ui.alert('That doesn\'t look like a sync key. Copy it again from Empire Hub; it starts with ehsync_.'); return; }
  PropertiesService.getScriptProperties().setProperty('HUB_SYNC_KEY', key);

  let snap;
  try { snap = call_({ action: 'snapshot', skus: currentSkus_() }); }
  catch (err) { ui.alert('Couldn\'t connect: ' + err.message); return; }

  removeTriggers_();
  ScriptApp.newTrigger('onHubEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger('pull').timeBased().everyMinutes(5).create();

  const lock = LockService.getDocumentLock();
  lock.waitLock(60000);
  try { buildTab_(snap); pull_(snap); } finally { lock.releaseLock(); }
  SpreadsheetApp.getActive().setActiveSheet(tab_());
  ui.alert('Connected to Empire Hub. ' + snap.items.length + ' items are on the "' + TAB + '" tab.\n\n' +
    'Edits in white cells save to the hub right away. Hub changes come back every 5 minutes, or use Empire Hub → Sync now.');
}

function stopSync() {
  removeTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('HUB_SYNC_KEY');
  SpreadsheetApp.getUi().alert('Sync stopped. The tab stays as it is. Use Set up sync… to reconnect.');
}

function syncNow() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) { SpreadsheetApp.getActive().toast('A sync is already running. Try again in a moment.', 'Empire Hub'); return; }
  try { const n = pull_(); SpreadsheetApp.getActive().toast(n, 'Empire Hub', 5); }
  catch (err) { SpreadsheetApp.getUi().alert('Sync failed: ' + err.message); }
  finally { lock.releaseLock(); }
}

// Time trigger (every 5 minutes).
function pull() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(60000)) return;
  try { pull_(); } catch (err) { console.error(err); } finally { lock.releaseLock(); }
}

// ─── Sheet → hub, the moment a cell changes ──────────────────────────────────
function onHubEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== TAB) return;
  const r0 = Math.max(2, e.range.getRow()), r1 = e.range.getLastRow();
  if (r1 < 2) return;
  const c0 = e.range.getColumn(), c1 = e.range.getLastColumn();
  const touched = EDIT.some(function (k) { const c = IDX[k] + 1; return c >= c0 && c <= c1; });
  if (!touched) return;                               // gray columns get put back on the next sync

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return;                   // the 5-minute sync will catch it
  try {
    const vals = sh.getRange(r0, 1, r1 - r0 + 1, NCOL).getValues();
    const rows = [];
    vals.forEach(function (v, i) { const p = rowPayload_(v, r0 + i); if (p) rows.push(p); });
    if (!rows.length) return;
    const res = call_({ action: 'push', rows: rows, editor: editor_(e) });
    applyResults_(sh, rows, res.results);
  } catch (err) {
    const cell = sh.getRange(r0, IDX.name + 1);
    cell.setNote('Not saved to the hub yet: ' + err.message + '\nIt will retry on the next sync.');
    cell.setBackground(ERR);
  } finally {
    lock.releaseLock();
  }
}

// ─── Hub → sheet (and anything the sheet missed sending) ─────────────────────
function pull_(snap) {
  const sh = tab_();
  const last = sh.getLastRow();
  const vals = last >= 2 ? sh.getRange(2, 1, last - 1, NCOL).getValues() : [];
  snap = snap || call_({ action: 'snapshot', skus: vals.map(function (v) { return String(v[IDX.sku] || '').trim(); }).filter(String) });
  ensureValidation_(sh, snap);

  const hub = {};
  snap.items.forEach(function (it) { hub[it.sku] = it; });
  const seen = {}, toPush = [];
  let changed = 0;

  vals.forEach(function (v, i) {
    const row = i + 2;
    const sku = String(v[IDX.sku] || '').trim();
    const nameCell = sh.getRange(row, IDX.name + 1);
    if (!sku) { const p = rowPayload_(v, row); if (p) toPush.push(p); return; }
    if (seen[sku]) { nameCell.setNote('Duplicate row: SKU ' + sku + ' is already listed above. Delete this row.'); nameCell.setBackground(ERR); return; }
    seen[sku] = true;
    const it = hub[sku];
    if (!it) { nameCell.setNote('SKU ' + sku + ' isn\'t in the hub. Clear the SKU cell to add this row as a new item.'); nameCell.setBackground(ERR); return; }

    const base = parseBase_(v[IDX._sync]);
    const next = Object.assign({}, base);
    const push = { row: row, sku: sku };
    let pushN = 0;
    EDIT.forEach(function (k) {
      const hv = display_(k, it[k]), hN = norm_(hv), sN = norm_(v[IDX[k]]);
      if (sN === hN) { next[k] = hN; return; }
      const bN = Object.prototype.hasOwnProperty.call(base, k) ? base[k] : null;
      if (bN !== null && sN !== bN && hN === bN) { push[k] = v[IDX[k]]; pushN++; return; } // sheet edit that didn't reach the hub
      sh.getRange(row, IDX[k] + 1).setValue(hv); next[k] = hN; changed++;                  // hub changed (or both did: hub wins)
    });
    RO.forEach(function (k) {
      const hv = display_(k, it[k]);
      if (norm_(v[IDX[k]]) !== norm_(hv)) sh.getRange(row, IDX[k] + 1).setValue(hv);
    });
    if (JSON.stringify(next) !== JSON.stringify(base)) sh.getRange(row, IDX._sync + 1).setValue(JSON.stringify(next));
    if (pushN) toPush.push(push);
  });

  // Items in the hub that aren't on the sheet yet.
  const add = snap.items.filter(function (it) { return !seen[it.sku] && it.active; });
  if (add.length) {
    const start = Math.max(sh.getLastRow(), 1) + 1;
    if (start + add.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), start + add.length - 1 - sh.getMaxRows() + 50);
    sh.getRange(start, 1, add.length, NCOL).setValues(add.map(rowValues_));
    formatRows_(sh, start, add.length);
  }

  if (toPush.length) {
    const res = call_({ action: 'push', rows: toPush, editor: 'Sheet sync' });
    applyResults_(sh, toPush, res.results);
  }

  const msg = 'Synced ' + Utilities.formatDate(new Date(), TZ, 'M/d h:mm a') + ' · ' + snap.items.length + ' items' +
    (changed ? ' · ' + changed + ' cells updated from the hub' : '') + (add.length ? ' · ' + add.length + ' new rows' : '') +
    (toPush.length ? ' · ' + toPush.length + ' rows sent' : '');
  sh.getRange(1, IDX.sku + 1).setNote(msg);
  return msg;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function call_(payload) {
  const key = PropertiesService.getScriptProperties().getProperty('HUB_SYNC_KEY');
  if (!key) throw new Error('Not connected. Use Empire Hub → Set up sync… first.');
  const res = UrlFetchApp.fetch(HUB_URL, {
    method: 'post', contentType: 'application/json', headers: { 'x-sync-key': key },
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  let body = {};
  try { body = JSON.parse(res.getContentText()); } catch (err) { /* keep {} */ }
  if (res.getResponseCode() !== 200) throw new Error(body.error || ('Empire Hub answered ' + res.getResponseCode()));
  return body;
}

// Only cells that differ from what both sides last agreed on are sent, so a stale
// "On hand" is never pushed just because someone edited a different cell in the row.
function rowPayload_(v, row) {
  const sku = String(v[IDX.sku] || '').trim();
  const p = { row: row };
  if (sku) {
    const base = parseBase_(v[IDX._sync]);
    let n = 0;
    p.sku = sku;
    EDIT.forEach(function (k) {
      const b = Object.prototype.hasOwnProperty.call(base, k) ? base[k] : null;
      if (norm_(v[IDX[k]]) !== b) { p[k] = v[IDX[k]]; n++; }
    });
    return n ? p : null;
  }
  if (!String(v[IDX.name] || '').trim()) return null;   // a new row needs at least an Item name
  EDIT.forEach(function (k) { if (v[IDX[k]] !== '') p[k] = v[IDX[k]]; });
  return p;
}

// Write the hub's answer back. A cell the user changed again while the save was in flight is left
// alone (its base is updated, so the next edit trigger or sync sends it).
function applyResults_(sh, sent, results) {
  const byRow = {};
  sent.forEach(function (p) { byRow[p.row] = p; });
  (results || []).forEach(function (res) {
    const p = byRow[res.row];
    if (!p) return;
    const rng = sh.getRange(res.row, 1, 1, NCOL);
    const cur = rng.getValues()[0];
    const curSku = String(cur[IDX.sku] || '').trim();
    if (p.sku ? curSku !== p.sku : (curSku !== '' || norm_(cur[IDX.name]) !== norm_(p.name))) return; // row moved (sorted) mid-save
    const nameCell = sh.getRange(res.row, IDX.name + 1);
    if (!res.ok) { nameCell.setNote('Not saved to the hub: ' + res.error); nameCell.setBackground(ERR); return; }
    if (nameCell.getNote() && /hub/i.test(nameCell.getNote())) nameCell.clearNote();
    nameCell.setBackground(null);

    const it = res.item, base = parseBase_(cur[IDX._sync]), out = cur.slice(), isNew = !p.sku;
    EDIT.forEach(function (k) {
      const hv = display_(k, it[k]);
      if (Object.prototype.hasOwnProperty.call(p, k)) {
        if (norm_(cur[IDX[k]]) === norm_(p[k])) out[IDX[k]] = hv;
        base[k] = norm_(hv);
      } else if (isNew) {
        if (norm_(cur[IDX[k]]) === '') out[IDX[k]] = hv;
        base[k] = norm_(hv);
      }
    });
    RO.forEach(function (k) { out[IDX[k]] = display_(k, it[k]); });
    out[IDX.sku] = it.sku;
    out[IDX._sync] = JSON.stringify(base);
    rng.setValues([out]);
    if (isNew) formatRows_(sh, res.row, 1);
  });
}

function rowValues_(it) {
  const base = {};
  EDIT.forEach(function (k) { base[k] = norm_(display_(k, it[k])); });
  return COLS.map(function (c) { return c[0] === '_sync' ? JSON.stringify(base) : display_(c[0], it[c[0]]); });
}

function display_(k, v) {
  if (v === null || v === undefined) return '';
  if (k === 'updated_at') return v ? Utilities.formatDate(new Date(v), TZ, 'M/d/yy h:mm a') : '';
  return v;
}

function norm_(x) {
  if (x === null || x === undefined || x === '') return '';
  if (typeof x === 'boolean') return x ? 'TRUE' : 'FALSE';
  if (typeof x === 'number') return String(Math.round(x * 10000) / 10000);
  if (x instanceof Date) return x.toISOString();
  const s = String(x).trim();
  if (/^(true|false)$/i.test(s)) return s.toUpperCase();
  return s;
}

function parseBase_(s) {
  if (!s) return {};
  try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : {}; } catch (err) { return {}; }
}

function editor_(e) {
  try { const u = e && e.user && e.user.getEmail && e.user.getEmail(); if (u) return u; } catch (err) { /* ignore */ }
  try { return Session.getActiveUser().getEmail() || ''; } catch (err) { return ''; }
}

function currentSkus_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, IDX.sku + 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0] || '').trim(); }).filter(String);
}

function tab_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(TAB) || ss.insertSheet(TAB, 0);
}

function buildTab_(snap) {
  const sh = tab_();
  if (sh.getMaxColumns() < NCOL) sh.insertColumnsAfter(sh.getMaxColumns(), NCOL - sh.getMaxColumns());
  sh.getRange(1, 1, 1, NCOL).setValues([COLS.map(function (c) { return c[1]; })])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground(GREEN).setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(IDX.name + 1);
  sh.setRowHeight(1, 36);
  COLS.forEach(function (c, i) { sh.setColumnWidth(i + 1, c[3]); });
  sh.hideColumns(IDX._sync + 1);
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (pr) {
    if (pr.getDescription() === 'Comes from Empire Hub') pr.remove();
  });
  ['sku', 'on_hand_total', 'value', 'other_locations', 'updated_at'].forEach(function (k) {
    const r = sh.getRange(1, IDX[k] + 1, sh.getMaxRows(), 1);
    r.protect().setDescription('Comes from Empire Hub').setWarningOnly(true);
  });
  sh.getRange(1, IDX.sku + 1).setNote('Edit white columns. Gray columns come from Empire Hub. Use Empire Hub → Sync now to refresh.');
  ensureValidation_(sh, snap);
}

function ensureValidation_(sh, snap) {
  if (sh.getRange(1, IDX.family + 1).getValue() !== COLS[IDX.family][1]) sh.getRange(1, IDX.family + 1).setValue(COLS[IDX.family][1]);
  const n = Math.max(sh.getMaxRows() - 1, 1);
  const cats = (snap && snap.categories) || [];
  if (cats.length) sh.getRange(2, IDX.category + 1, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(cats, true).setAllowInvalid(false).setHelpText('Pick an Empire Hub category.').build());
  const subs = (snap && snap.subcategories) || [];
  if (subs.length) sh.getRange(2, IDX.family + 1, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(subs, true).setAllowInvalid(false)
      .setHelpText('Pick a subcategory that belongs to this row\'s Category. The hub rejects one from a different category.').build());
  const types = (snap && snap.types) || ['Material', 'Tool', 'Equipment', 'Consumable', 'Asset'];
  sh.getRange(2, IDX.type + 1, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(types, true).setAllowInvalid(false).build());
  ['on_hand', 'min_qty'].forEach(function (k) { sh.getRange(2, IDX[k] + 1, n, 1).setNumberFormat('#,##0.##'); });
  sh.getRange(2, IDX.on_hand_total + 1, n, 1).setNumberFormat('#,##0.##');
  ['unit_cost', 'value'].forEach(function (k) { sh.getRange(2, IDX[k] + 1, n, 1).setNumberFormat('$#,##0.00'); });
  RO.concat(['sku']).forEach(function (k) { sh.getRange(2, IDX[k] + 1, n, 1).setBackground(GRAY).setFontColor('#55524A'); });
}

function formatRows_(sh, start, count) {
  ['billable', 'active'].forEach(function (k) { sh.getRange(start, IDX[k] + 1, count, 1).insertCheckboxes(); });
}

function removeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['onHubEdit', 'pull'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
}
