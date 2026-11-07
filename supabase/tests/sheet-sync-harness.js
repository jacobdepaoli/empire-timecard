// Simulates the Google Sheet + hub to test public/empire-hub-sheet-sync.gs.  Run: node supabase/tests/sheet-sync-harness.js public/empire-hub-sheet-sync.gs
const fs = require('fs'), vm = require('vm'), assert = require('assert')
const SRC = fs.readFileSync(process.argv[2], 'utf8')

function makeSheet(name) {
  let rows = 50, cols = 25
  const grid = () => Array.from({ length: rows }, () => Array(cols).fill(''))
  let g = grid(), notes = {}, bg = {}
  const sh = {
    getName: () => name,
    getMaxRows: () => rows, getMaxColumns: () => cols,
    insertColumnsAfter: (a, n) => { cols += n; g.forEach(r => r.push(...Array(n).fill(''))) },
    insertRowsAfter: (a, n) => { for (let i = 0; i < n; i++) g.push(Array(cols).fill('')); rows += n },
    getLastRow: () => { for (let r = rows - 1; r >= 0; r--) if (g[r].some(v => v !== '' && v !== false)) return r + 1; return 0 },
    setFrozenRows() {}, setFrozenColumns() {}, setRowHeight() {}, setColumnWidth() {}, hideColumns() {},
    getProtections: () => [],
    getRange(r, c, nr = 1, nc = 1) {
      const rg = {
        getSheet: () => sh, getRow: () => r, getLastRow: () => r + nr - 1, getColumn: () => c, getLastColumn: () => c + nc - 1,
        getValues: () => g.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)),
        setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { g[r - 1 + i][c - 1 + j] = x })); return rg },
        setValue(x) { g[r - 1][c - 1] = x; return rg },
        setNote(t) { notes[r + ',' + c] = t; return rg }, getNote: () => notes[r + ',' + c] || '', clearNote() { delete notes[r + ',' + c]; return rg },
        setBackground(b) { bg[r + ',' + c] = b; return rg },
        insertCheckboxes() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (g[r - 1 + i][c - 1 + j] === '') g[r - 1 + i][c - 1 + j] = false; return rg },
        protect: () => ({ setDescription() { return this }, setWarningOnly() { return this } }),
      }
      for (const m of ['setFontWeight', 'setFontColor', 'setVerticalAlignment', 'setWrap', 'setDataValidation', 'setNumberFormat']) rg[m] = () => rg
      return rg
    },
    _g: () => g, _notes: () => notes, _bg: () => bg,
  }
  return sh
}

// ── fake hub with the same rules as the edge function ──
const TYPES = { material: 'Material', tool: 'Tool', equipment: 'Equipment', consumable: 'Consumable', asset: 'Asset' }
const CATS = { 'Wire & Cable': ['WIR', 'material'], 'Tools & Test Equipment': ['TLS', 'tool'] }
let clock = 0
const hub = {
  items: {}, calls: [],
  add(it) { this.items[it.sku] = { family: '', size_rating: '', configuration: '', unit: 'each', type: 'material', min_qty: null, unit_cost: null, mfr_part_number: '', photo_location: '', billable: true, active: true, notes: '', main: 0, other: 0, ...it, updated_at: new Date(1e12 + ++clock * 1000).toISOString() } },
  row(it) { const t = it.main + it.other; return { sku: it.sku, category: it.category, family: it.family, name: it.name, size_rating: it.size_rating, configuration: it.configuration, unit: it.unit, type: TYPES[it.type], on_hand: it.main, on_hand_total: t, min_qty: it.min_qty ?? '', unit_cost: it.unit_cost ?? '', value: it.unit_cost == null ? '' : Math.round(t * it.unit_cost * 100) / 100, other_locations: it.other ? 'Truck 1: ' + it.other : '', mfr_part_number: it.mfr_part_number, photo_location: it.photo_location, billable: it.billable, active: it.active, notes: it.notes, updated_at: it.updated_at } },
  handle(p) {
    this.calls.push(JSON.parse(JSON.stringify(p)))
    if (p.action === 'snapshot') return { items: Object.values(this.items).filter(i => i.active || (p.skus || []).includes(i.sku)).map(i => this.row(i)), categories: Object.keys(CATS), types: Object.values(TYPES) }
    return { results: p.rows.map(r => {
      const num = v => v === '' || v == null ? null : Number(String(v).replace(/[$,]/g, ''))
      let it
      if (r.sku) { it = this.items[r.sku]; if (!it) return { row: r.row, ok: false, error: 'not in hub' } }
      else { if (!r.name) return { row: r.row, ok: false, error: 'name' }; if (!CATS[r.category]) return { row: r.row, ok: false, error: 'Pick a category' }
        const pre = CATS[r.category][0], n = Object.keys(this.items).filter(s => s.startsWith(pre)).length + 1
        it = { sku: pre + '-' + String(n).padStart(3, '0'), category: r.category, name: r.name, type: CATS[r.category][1] }; this.add(it); it = this.items[it.sku] }
      for (const k of ['category', 'family', 'name', 'size_rating', 'configuration', 'unit', 'mfr_part_number', 'photo_location', 'notes']) if (k in r) it[k] = String(r[k]).trim()
      for (const k of ['min_qty', 'unit_cost']) if (k in r) it[k] = num(r[k])
      if (r.sku) for (const k of ['billable', 'active']) if (k in r) it[k] = r[k] === true || r[k] === 'TRUE'
      if ('type' in r && r.type) it.type = Object.keys(TYPES).find(k => TYPES[k] === r.type) || it.type
      if ('on_hand' in r) it.main = num(r.on_hand)
      it.updated_at = new Date(1e12 + ++clock * 1000).toISOString()
      return { row: r.row, ok: true, sku: it.sku, item: this.row(it) }
    }) }
  },
}

// ── load the script with Google services mocked ──
const sheets = {}
const ctx = {
  console,
  SpreadsheetApp: {
    getActive: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)), toast() {}, setActiveSheet() {} }),
    newDataValidation: () => { const b = { requireValueInList: () => b, setAllowInvalid: () => b, setHelpText: () => b, build: () => ({}) }; return b },
    ProtectionType: { RANGE: 'RANGE' },
  },
  Utilities: { formatDate: (d) => d.toISOString().slice(0, 16).replace('T', ' ') },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'ehsync_test' }) },
  LockService: { getDocumentLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'candace@empireelectricnv.com' }) },
}
vm.createContext(ctx)
vm.runInContext(SRC, ctx)
ctx.call_ = (p) => hub.handle(p)         // swap the network call for the fake hub
const run = (code) => vm.runInContext(code, ctx)
const IDX = run('IDX'), sh = () => sheets['Hub Inventory']
const cell = (row, k) => sh()._g()[row - 1][IDX[k]]
const setCell = (row, k, v) => { sh()._g()[row - 1][IDX[k]] = v }
const edit = (row, k) => run(`onHubEdit({ range: tab_().getRange(${row}, ${IDX[k] + 1}) })`)
const lastPush = () => hub.calls.filter(c => c.action === 'push').slice(-1)[0]
const rowOf = (sku) => sh()._g().findIndex(r => r[IDX.sku] === sku) + 1

// 1. initial setup: 3 hub items appear with bases
hub.add({ sku: 'MAT-001', category: 'Wire & Cable', name: 'Insulated wire, red', unit: 'reel', unit_cost: 115, main: 4 })
hub.add({ sku: 'MAT-002', category: 'Wire & Cable', name: 'Insulated wire, green', unit: 'reel', unit_cost: 115, main: 2 })
hub.add({ sku: 'TLS-001', category: 'Tools & Test Equipment', name: 'Cordless drill', type: 'tool', billable: false, unit_cost: 125, main: 1 })
run('buildTab_(call_({action:"snapshot",skus:[]})); pull_()')
assert.equal(sh().getLastRow(), 4); assert.equal(cell(2, 'sku'), 'MAT-001'); assert.equal(cell(2, 'on_hand'), 4); assert.ok(cell(2, '_sync').includes('"on_hand":"4"'))
console.log('1 ok  initial pull wrote 3 rows with sync bases')

// 2. editing notes sends ONLY notes (no stale on_hand)
const r1 = rowOf('MAT-001'); hub.items['MAT-001'].main = 1      // hub issued 3 to a job; sheet still says 4
setCell(r1, 'notes', 'Top shelf'); edit(r1, 'notes')
assert.deepEqual(Object.keys(lastPush().rows[0]).sort(), ['notes', 'row', 'sku'])
assert.equal(hub.items['MAT-001'].main, 1, 'stale on-hand must not be pushed')
console.log('2 ok  note edit pushed alone; hub count untouched')

// 3. next pull brings the hub count into the sheet
run('pull_()'); assert.equal(cell(r1, 'on_hand'), 1); assert.equal(cell(r1, 'notes'), 'Top shelf')
console.log('3 ok  pull updated On hand from the hub, kept the note')

// 4. count edit in the sheet becomes the hub count
setCell(r1, 'on_hand', 10); edit(r1, 'on_hand')
assert.equal(hub.items['MAT-001'].main, 10); assert.deepEqual(Object.keys(lastPush().rows[0]).sort(), ['on_hand', 'row', 'sku'])
console.log('4 ok  sheet count of 10 recorded in the hub')

// 5. an edit that never reached the hub (trigger failed) is sent by the next pull
const r2 = rowOf('MAT-002'); setCell(r2, 'unit_cost', 99)
run('pull_()'); assert.equal(hub.items['MAT-002'].unit_cost, 99); assert.equal(cell(r2, 'unit_cost'), 99)
console.log('5 ok  missed sheet edit was pushed by the 5-minute sync')

// 6. both sides changed the same cell: hub wins
setCell(r2, 'name', 'Green wire (sheet)'); hub.items['MAT-002'].name = 'Green wire (hub)'
run('pull_()'); assert.equal(cell(r2, 'name'), 'Green wire (hub)')
console.log('6 ok  conflict on one cell resolved to the hub value')

// 7. new item typed on an empty row gets a SKU, defaults, and checkboxes
const nr = sh().getLastRow() + 1
setCell(nr, 'name', '12/2 MC cable'); edit(nr, 'name')
assert.ok(cell(nr, 'note') === undefined); assert.equal(cell(nr, 'sku'), '', 'no category yet: not created')
assert.ok(String(sh()._notes()[nr + ',' + (IDX.name + 1)]).includes('category'))
setCell(nr, 'category', 'Wire & Cable'); setCell(nr, 'on_hand', 250); edit(nr, 'category')
assert.equal(cell(nr, 'sku'), 'WIR-001'); assert.equal(cell(nr, 'unit'), 'each'); assert.equal(cell(nr, 'active'), true)
assert.equal(hub.items['WIR-001'].main, 250); assert.equal(sh()._bg()[nr + ',' + (IDX.name + 1)], null)
console.log('7 ok  new row got SKU WIR-001, unit default, Active ticked, count 250; error cleared')

// 8. a re-edit typed while the save was in flight is kept and sent next
const r3 = rowOf('TLS-001')
setCell(r3, 'notes', 'A')
const origHandle = hub.handle.bind(hub)
hub.handle = (p) => { const res = origHandle(p); if (p.action === 'push') setCell(r3, 'notes', 'AB'); return res }   // user types again mid-save
edit(r3, 'notes'); hub.handle = origHandle
assert.equal(cell(r3, 'notes'), 'AB', 'in-flight retype kept'); assert.equal(hub.items['TLS-001'].notes, 'A')
edit(r3, 'notes'); assert.equal(hub.items['TLS-001'].notes, 'AB')
console.log('8 ok  retype during a save was kept and sent on the next edit')

// 9. retiring an item: untick Active → hub inactive, row stays and shows unticked
setCell(r3, 'active', false); edit(r3, 'active'); run('pull_()')
assert.equal(hub.items['TLS-001'].active, false); assert.equal(cell(r3, 'active'), false); assert.equal(rowOf('TLS-001'), r3)
console.log('9 ok  unticking Active retired the item and the row stayed')

// 10. hub-only new item is appended; deleting a row in the sheet re-adds it on next pull (nothing deleted in hub)
hub.add({ sku: 'TLS-002', category: 'Tools & Test Equipment', name: 'Impact driver', type: 'tool', main: 2 })
run('pull_()'); assert.ok(rowOf('TLS-002') > 0)
console.log('10 ok new hub item appeared in the sheet')
console.log('\nALL PASS')
