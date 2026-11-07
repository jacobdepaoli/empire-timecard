// ─── Inventory › Manage (admins): edit like a spreadsheet, add items, manage categories, export ───
// Everything saves straight to the hub; a count typed in the grid is recorded as a count at the chosen location.
import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, PANEL, WARN, WSOFT, DANGER } from "../../theme.js"
import { Icon, Modal } from "../../ui.jsx"
import { money } from "../../util.js"

const TYPES = [["material", "Material"], ["tool", "Tool"], ["equipment", "Equipment"], ["consumable", "Consumable"], ["asset", "Asset"]]
const PAGE = 150
const CHANGED = "#FFF4CC"

// SheetJS from its official CDN at runtime (same as the workbook importer), so it isn't bundled.
const loadXLSX = () => import(/* @vite-ignore */ "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs")

async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) return out
  }
}
const num = (v) => { if (v === "" || v == null) return null; const n = Number(String(v).replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : NaN }
const fmtQty = (n) => { const x = Number(n || 0); return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100) }

export default function Manage({ user, onChanged }) {
  const [cats, setCats] = useState([])          // [{ name, sort, prefix, kind, source, subcategories }]
  const [items, setItems] = useState([])
  const [stock, setStock] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true); const [err, setErr] = useState("")
  const [edits, setEdits] = useState({})        // item id → { field: value }   (field "_count" = on hand at countAt)
  const [countAt, setCountAt] = useState("")
  const [q, setQ] = useState(""); const [cat, setCat] = useState(""); const [sub, setSub] = useState("")
  const [showRetired, setShowRetired] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [saving, setSaving] = useState(""); const [rowErr, setRowErr] = useState({})
  const [modal, setModal] = useState(null); const [exporting, setExporting] = useState(false)

  const load = async () => {
    try {
      const [ct, it, st, loc] = await Promise.all([
        supabase.from("inv_categories").select("*").order("sort").then((r) => r.data || []),
        fetchAll(() => supabase.from("inv_items").select("*").order("sku")),
        fetchAll(() => supabase.from("inv_stock").select("*")),
        supabase.from("inv_locations").select("*").eq("active", true).order("kind").order("name").then((r) => r.data || []),
      ])
      setCats(ct); setItems(it); setStock(st); setLocations(loc)
      setCountAt((cur) => cur || loc.find((l) => l.name === "Main Shop")?.id || loc[0]?.id || "")
      setLoading(false)
    } catch (e) { setErr("Couldn't load inventory. Refresh to try again."); setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Warn before leaving with unsaved edits.
  const dirty = Object.keys(edits).length
  useEffect(() => {
    if (!dirty) return
    const h = (e) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h)
  }, [dirty])

  const catOrder = useMemo(() => Object.fromEntries(cats.map((c) => [c.name, c.sort])), [cats])
  const subsOf = useMemo(() => Object.fromEntries(cats.map((c) => [c.name, c.subcategories || []])), [cats])
  const qtyAt = useMemo(() => { const m = {}; stock.forEach((r) => { m[r.item_id + "|" + r.location_id] = Number(r.qty || 0) }); return m }, [stock])
  const qtyTotal = useMemo(() => { const m = {}; stock.forEach((r) => { m[r.item_id] = (m[r.item_id] || 0) + Number(r.qty || 0) }); return m }, [stock])

  const val = (it, f) => (edits[it.id] && f in edits[it.id] ? edits[it.id][f] : f === "_count" ? fmtQty(qtyAt[it.id + "|" + countAt] || 0) : it[f] ?? "")
  const isChanged = (it, f) => !!(edits[it.id] && f in edits[it.id])
  const setVal = (it, f, v) => setEdits((all) => {
    const cur = { ...(all[it.id] || {}) }
    const orig = f === "_count" ? fmtQty(qtyAt[it.id + "|" + countAt] || 0) : it[f] ?? ""
    if (String(v ?? "") === String(orig ?? "")) delete cur[f]; else cur[f] = v
    // A new category clears a subcategory that doesn't belong to it.
    if (f === "category") {
      const fam = "family" in cur ? cur.family : it.family
      if (fam && !(subsOf[v] || []).includes(fam)) cur.family = ""
      if (cur.family === (it.family ?? "")) delete cur.family
    }
    const next = { ...all }
    if (Object.keys(cur).length) next[it.id] = cur; else delete next[it.id]
    return next
  })
  // Counts are per location: switching location with unsaved counts would mix them up.
  const changeCountAt = (id) => {
    const pending = Object.values(edits).some((e) => "_count" in e)
    if (pending && !window.confirm("You have unsaved counts for this location. Switching discards them. Continue?")) return
    if (pending) setEdits((all) => Object.fromEntries(Object.entries(all).map(([k, e]) => { const { _count, ...rest } = e; return [k, rest] }).filter(([, e]) => Object.keys(e).length)))
    setCountAt(id)
  }

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items
      .filter((i) => (showRetired || i.active) && (!cat || i.category === cat) && (!sub || i.family === sub) &&
        (!term || `${i.sku} ${i.name} ${i.family || ""} ${i.size_rating || ""} ${i.mfr_part_number || ""} ${i.photo_location || ""}`.toLowerCase().includes(term)))
      .sort((a, b) => (catOrder[a.category] ?? 999) - (catOrder[b.category] ?? 999) || (a.family || "").localeCompare(b.family || "") || a.name.localeCompare(b.name))
  }, [items, q, cat, sub, showRetired, catOrder])

  const save = async () => {
    const ids = Object.keys(edits); if (!ids.length) return
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    const errors = {}; let done = 0
    for (const id of ids) {
      setSaving(`Saving ${++done} of ${ids.length}…`)
      const it = byId[id], e = edits[id], patch = {}
      try {
        for (const [f, v] of Object.entries(e)) {
          if (f === "_count") continue
          if (f === "unit_cost" || f === "min_qty") { const n = num(v); if (Number.isNaN(n)) throw new Error(`${f === "unit_cost" ? "Unit cost" : "Reorder at"} must be a number`); patch[f] = n }
          else if (f === "active") patch[f] = !!v
          else patch[f] = typeof v === "string" ? (v.trim() || null) : v
        }
        if ("name" in patch && !patch.name) throw new Error("Item name can't be blank")
        if ("category" in patch && !subsOf[patch.category]) throw new Error("Pick a category")
        const fam = "family" in patch ? patch.family : it.family, c = patch.category || it.category
        if (fam && !(subsOf[c] || []).includes(fam)) throw new Error(`"${fam}" isn't a subcategory of ${c}`)
        let count = null
        if ("_count" in e) { count = num(e._count); if (count == null || Number.isNaN(count) || count < 0) throw new Error("Count must be 0 or more") }
        if (Object.keys(patch).length) {
          const { error } = await supabase.from("inv_items").update(patch).eq("id", id)
          if (error) throw error
        }
        if (count != null) {
          const delta = Math.round((count - (qtyAt[id + "|" + countAt] || 0)) * 10000) / 10000
          if (delta) {
            const tx = { item_id: id, type: "count", qty: Math.abs(delta), employee_id: user.id, note: "Count (Manage)", ...(delta > 0 ? { to_location_id: countAt } : { from_location_id: countAt }) }
            const { error } = await supabase.from("inv_transactions").insert(tx)
            if (error) throw error
          }
        }
      } catch (ex) { errors[id] = ex.message || "Couldn't save" }
    }
    setRowErr(errors)
    setEdits((all) => Object.fromEntries(Object.entries(all).filter(([id]) => errors[id])))
    setSaving("")
    await load(); onChanged?.()
  }

  // Enter moves to the same column on the next row, like a spreadsheet.
  const gridRef = useRef(null)
  const onKey = (e, col, idx) => {
    if (e.key !== "Enter") return
    e.preventDefault()
    gridRef.current?.querySelector(`[data-cell="${col}:${idx + (e.shiftKey ? -1 : 1)}"]`)?.focus()
  }

  const doExport = async () => {
    setExporting(true)
    try { await exportWorkbook({ items: showRetired ? items : items.filter((i) => i.active), everything: items, cats, stock, locations, catOrder }) }
    catch (e) { alert("Export failed: " + (e.message || e)) }
    setExporting(false)
  }

  if (loading) return <div style={{ color: MUTED, padding: 20 }}>Loading…</div>
  if (err) return <div style={s.alert("error")}>{err}</div>

  const subOpts = cat ? (subsOf[cat] || []) : []
  const shown = rows.slice(0, limit)
  const locName = locations.find((l) => l.id === countAt)?.name || "location"
  const cell = { ...s.input, padding: "6px 8px", fontSize: 13, borderRadius: 7, minWidth: 0 }
  const th = { ...s.th, whiteSpace: "nowrap", position: "sticky", top: 0, background: "#fff", zIndex: 1 }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 16px", display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setModal({ kind: "add" })}><Icon name="plus" size={15} color="#fff" /> Add item</button>
        <button style={{ ...s.btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setModal({ kind: "cats" })}><Icon name="list" size={15} /> Categories</button>
        <button style={{ ...s.btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={doExport} disabled={exporting}><Icon name="download" size={15} /> {exporting ? "Exporting…" : "Export .xlsx"}</button>
        <div style={{ flex: 1 }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: MUTED }}>
          Counts at
          <select style={{ ...s.input, width: "auto", padding: "8px 10px" }} value={countAt} onChange={(e) => changeCountAt(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.kind === "vehicle" ? " (truck)" : ""}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 11, top: 11, pointerEvents: "none" }}><Icon name="search" size={16} color={FAINT} /></span>
          <input style={{ ...s.input, paddingLeft: 34 }} value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} placeholder="Search SKU, name, part #, bin…" />
        </div>
        <select style={{ ...s.input, width: "auto", minWidth: 150 }} value={cat} onChange={(e) => { setCat(e.target.value); setSub(""); setLimit(PAGE) }}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        {cat && subOpts.length > 0 && (
          <select style={{ ...s.input, width: "auto", minWidth: 150 }} value={sub} onChange={(e) => { setSub(e.target.value); setLimit(PAGE) }}>
            <option value="">All subcategories</option>
            {subOpts.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: MUTED, cursor: "pointer" }}>
          <input type="checkbox" checked={showRetired} onChange={(e) => { setShowRetired(e.target.checked); setLimit(PAGE) }} /> Show retired &amp; catalog
        </label>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
        {rows.length} item{rows.length === 1 ? "" : "s"}. Edit any cell, then <strong>Save changes</strong>. Typing in "On hand" records a count at <strong>{locName}</strong>. Press Enter to move down a row.
      </div>

      <div ref={gridRef} style={{ ...s.card, padding: 0, overflow: "auto", maxHeight: "70vh" }}>
        <table style={{ ...s.table, minWidth: 1450 }}>
          <thead><tr>
            <th style={th}>SKU</th><th style={{ ...th, minWidth: 240 }}>Item</th><th style={{ ...th, minWidth: 190 }}>Category</th><th style={{ ...th, minWidth: 190 }}>Subcategory</th>
            <th style={th}>Size / rating</th><th style={th}>Unit</th><th style={th}>Type</th>
            <th style={{ ...th, textAlign: "right" }}>On hand · {locName}</th><th style={{ ...th, textAlign: "right" }}>Total</th>
            <th style={{ ...th, textAlign: "right" }}>Reorder at</th><th style={{ ...th, textAlign: "right" }}>Unit cost</th>
            <th style={th}>Bin / location</th><th style={th}>Active</th>
          </tr></thead>
          <tbody>
            {shown.map((it, idx) => {
              const c = val(it, "category")
              const bg = (f) => (isChanged(it, f) ? { background: CHANGED } : {})
              const inp = (f, extra = {}) => (
                <input data-cell={`${f}:${idx}`} onKeyDown={(e) => onKey(e, f, idx)} style={{ ...cell, ...bg(f), ...extra }} value={val(it, f)} onChange={(e) => setVal(it, f, e.target.value)} />
              )
              return (
                <tr key={it.id} style={{ opacity: val(it, "active") ? 1 : 0.55, background: rowErr[it.id] ? "#FDECEA" : undefined }} title={rowErr[it.id] || ""}>
                  <td style={{ ...s.td, fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>{it.sku}{rowErr[it.id] && <div style={{ color: DANGER, fontSize: 11, whiteSpace: "normal", maxWidth: 140 }}>{rowErr[it.id]}</div>}</td>
                  <td style={s.td}>{inp("name")}</td>
                  <td style={s.td}>
                    <select style={{ ...cell, ...bg("category") }} value={c} onChange={(e) => setVal(it, "category", e.target.value)}>
                      {!subsOf[c] && <option value={c}>{c || "Pick…"}</option>}
                      {cats.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                    </select>
                  </td>
                  <td style={s.td}>
                    <select style={{ ...cell, ...bg("family"), ...(val(it, "family") ? {} : { color: WARN }) }} value={val(it, "family")} onChange={(e) => setVal(it, "family", e.target.value)}>
                      <option value="">Pick…</option>
                      {(subsOf[c] || []).map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </td>
                  <td style={s.td}>{inp("size_rating", { width: 120, ...(val(it, "size_rating") === "Verify" ? { color: WARN } : {}) })}</td>
                  <td style={s.td}>{inp("unit", { width: 70 })}</td>
                  <td style={s.td}>
                    <select style={{ ...cell, ...bg("type"), width: 112 }} value={val(it, "type")} onChange={(e) => setVal(it, "type", e.target.value)}>
                      {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td style={s.td}>{inp("_count", { width: 90, textAlign: "right", fontWeight: 700 })}</td>
                  <td style={{ ...s.td, textAlign: "right", color: MUTED }}>{fmtQty(qtyTotal[it.id] || 0)}</td>
                  <td style={s.td}>{inp("min_qty", { width: 80, textAlign: "right" })}</td>
                  <td style={s.td}>{inp("unit_cost", { width: 90, textAlign: "right" })}</td>
                  <td style={s.td}>{inp("photo_location", { width: 170 })}</td>
                  <td style={{ ...s.td, textAlign: "center", ...bg("active") }}><input type="checkbox" checked={!!val(it, "active")} onChange={(e) => setVal(it, "active", e.target.checked)} /></td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={13} style={{ ...s.td, textAlign: "center", color: MUTED, padding: 30 }}>No items match.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <div style={{ textAlign: "center", marginTop: 10 }}><button style={s.btnSecondary} onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more ({rows.length - limit} left)</button></div>}

      {(dirty > 0 || saving) && (
        <div style={{ position: "sticky", bottom: 12, marginTop: 12, zIndex: 5, display: "flex", alignItems: "center", gap: 10, background: INK, color: "#fff", borderRadius: 14, padding: "12px 16px", boxShadow: "0 12px 30px rgba(0,0,0,.25)", flexWrap: "wrap" }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{saving || `${dirty} item${dirty === 1 ? "" : "s"} changed`}</span>
          {!saving && <button style={{ ...s.btnGhost, color: "#ddd" }} onClick={() => { setEdits({}); setRowErr({}) }}>Discard</button>}
          <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 20px" }} onClick={save} disabled={!!saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      )}

      {modal?.kind === "add" && <AddItemModal user={user} cats={cats} locations={locations} defaultLoc={countAt} onClose={() => setModal(null)} onDone={async () => { setModal(null); await load(); onChanged?.() }} />}
      {modal?.kind === "cats" && <CategoriesModal cats={cats} items={items} onClose={() => setModal(null)} onChanged={async () => { await load(); onChanged?.() }} />}
    </div>
  )
}

// ─── Add item ────────────────────────────────────────────────────────────────
function AddItemModal({ user, cats, locations, defaultLoc, onClose, onDone }) {
  const [f, setF] = useState({ category: "", family: "", name: "", size_rating: "", configuration: "", unit: "each", type: "", unit_cost: "", min_qty: "", mfr_part_number: "", photo_location: "", notes: "", billable: null, qty: "", loc: defaultLoc })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [added, setAdded] = useState([])
  const cat = cats.find((c) => c.name === f.category)
  const type = f.type || cat?.kind || "material"
  const billable = f.billable ?? ["material", "consumable"].includes(type)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v, ...(k === "category" ? { family: "", type: "" } : {}) }))

  const submit = async (again) => {
    setErr("")
    if (!f.category) return setErr("Pick a category.")
    if (!f.name.trim()) return setErr("Add an item name.")
    const cost = num(f.unit_cost), min = num(f.min_qty), qty = num(f.qty)
    if (Number.isNaN(cost)) return setErr("Unit cost must be a number.")
    if (Number.isNaN(min)) return setErr("Reorder at must be a number.")
    if (Number.isNaN(qty) || (qty != null && qty < 0)) return setErr("Starting quantity must be 0 or more.")
    setBusy(true)
    let made = null
    for (let tries = 0; tries < 3 && !made; tries++) {
      const { data: sku, error: sErr } = await supabase.rpc("inv_next_sku", { p_category: f.category })
      if (sErr || !sku) { setBusy(false); return setErr("Couldn't assign a SKU. Try again.") }
      const row = { sku, category: f.category, family: f.family || null, name: f.name.trim(), size_rating: f.size_rating.trim() || null,
        configuration: f.configuration.trim() || null, unit: f.unit.trim() || "each", type, billable, unit_cost: cost, min_qty: min,
        mfr_part_number: f.mfr_part_number.trim() || null, photo_location: f.photo_location.trim() || null, notes: f.notes.trim() || null, stocked: true, active: true }
      const { data, error } = await supabase.from("inv_items").insert(row).select("id,sku,name").single()
      if (!error) made = data
      else if (!/duplicate/i.test(error.message)) { setBusy(false); return setErr(error.message) }
    }
    if (!made) { setBusy(false); return setErr("Couldn't assign a SKU. Try again.") }
    if (qty) {
      const { error } = await supabase.from("inv_transactions").insert({ item_id: made.id, type: "count", qty, to_location_id: f.loc, employee_id: user.id, note: "Starting count (new item)" })
      if (error) { setBusy(false); return setErr(`Added ${made.sku}, but the starting count didn't save: ${error.message}`) }
    }
    setBusy(false)
    if (again) { setAdded((a) => [made, ...a]); setF((p) => ({ ...p, name: "", size_rating: "", configuration: "", unit_cost: "", min_qty: "", mfr_part_number: "", notes: "", qty: "" })) }
    else onDone()
  }

  const fld = (label, k, props = {}) => <div style={s.field}><label style={s.label}>{label}</label><input style={s.input} value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} /></div>
  return (
    <Modal title="Add item" onClose={added.length ? onDone : onClose} width={620}>
      {err && <div style={s.alert("error")}>{err}</div>}
      {added.length > 0 && <div style={{ background: GSOFT, color: GD, borderRadius: 10, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>Added {added.map((a) => `${a.sku} ${a.name}`).join(" · ")}</div>}
      <div style={s.grid2}>
        <div style={s.field}><label style={s.label}>Category</label>
          <select style={s.input} value={f.category} onChange={(e) => set("category", e.target.value)} autoFocus>
            <option value="">Pick a category…</option>
            {cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select></div>
        <div style={s.field}><label style={s.label}>Subcategory</label>
          <select style={s.input} value={f.family} onChange={(e) => set("family", e.target.value)} disabled={!cat}>
            <option value="">{cat ? "Pick a subcategory…" : "Pick a category first"}</option>
            {(cat?.subcategories || []).map((x) => <option key={x} value={x}>{x}</option>)}
          </select></div>
      </div>
      {fld("Item name (noun first, e.g. \"EMT Connector, Set-Screw\")", "name")}
      <div style={s.grid2}>
        {fld("Size / rating", "size_rating", { placeholder: "e.g. 3/4 in., 20 A, 12 AWG" })}
        {fld("Configuration", "configuration", { placeholder: "e.g. Solid / Black" })}
        {fld("Unit", "unit")}
        <div style={s.field}><label style={s.label}>Type</label>
          <select style={s.input} value={type} onChange={(e) => set("type", e.target.value)}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {fld("Unit cost", "unit_cost", { inputMode: "decimal", placeholder: "0.00" })}
        {fld("Reorder at (min qty)", "min_qty", { inputMode: "decimal" })}
        {fld("Mfr part #", "mfr_part_number")}
        {fld("Bin / location in shop", "photo_location")}
        {fld("Starting quantity", "qty", { inputMode: "decimal", placeholder: "0" })}
        <div style={s.field}><label style={s.label}>Counted at</label>
          <select style={s.input} value={f.loc} onChange={(e) => set("loc", e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, marginBottom: 12 }}><input type="checkbox" checked={billable} onChange={(e) => set("billable", e.target.checked)} /> Billable to customer</label>
      <div style={s.field}><label style={s.label}>Notes</label><textarea style={s.textarea} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button style={s.btnGhost} onClick={added.length ? onDone : onClose}>{added.length ? "Done" : "Cancel"}</button>
        <button style={s.btnSecondary} onClick={() => submit(true)} disabled={busy}>Add + another</button>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 20px" }} onClick={() => submit(false)} disabled={busy}>{busy ? "Adding…" : "Add item"}</button>
      </div>
    </Modal>
  )
}

// ─── Categories & subcategories ─────────────────────────────────────────────
function CategoriesModal({ cats, items, onClose, onChanged }) {
  const [open, setOpen] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(null)   // { cat, sub?, value }
  const [newSub, setNewSub] = useState("")
  const [nc, setNc] = useState({ name: "", prefix: "", kind: "material", subs: "" })
  const count = useMemo(() => { const m = {}; items.forEach((i) => { m[i.category] = (m[i.category] || 0) + 1; m[i.category + "|" + i.family] = (m[i.category + "|" + i.family] || 0) + 1 }); return m }, [items])

  const run = async (fn) => { setErr(""); setBusy(true); try { await fn(); await onChanged() } catch (e) { setErr(e.message || String(e)) } setBusy(false) }
  const must = ({ error }) => { if (error) throw new Error(error.message.replace(/^.*?: /, "")) }

  const saveRename = () => run(async () => {
    const r = renaming, v = r.value.trim()
    if (r.sub == null) must(await supabase.rpc("inv_rename_category", { p_old: r.cat, p_new: v }))
    else must(await supabase.rpc("inv_rename_subcategory", { p_category: r.cat, p_old: r.sub, p_new: v }))
    if (r.sub == null && open === r.cat) setOpen(v)
    setRenaming(null)
  })
  const addSub = (c) => run(async () => {
    const v = newSub.trim(); if (!v) return
    if ((c.subcategories || []).includes(v)) throw new Error(`"${v}" is already in ${c.name}.`)
    must(await supabase.from("inv_categories").update({ subcategories: [...(c.subcategories || []), v] }).eq("name", c.name))
    setNewSub("")
  })
  const removeSub = (c, x) => run(async () => {
    if (count[c.name + "|" + x]) throw new Error(`${count[c.name + "|" + x]} item(s) use "${x}". Move them to another subcategory first.`)
    must(await supabase.from("inv_categories").update({ subcategories: (c.subcategories || []).filter((y) => y !== x) }).eq("name", c.name))
  })
  const move = (c, x, dir) => run(async () => {
    const list = [...(c.subcategories || [])], i = list.indexOf(x), j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    must(await supabase.from("inv_categories").update({ subcategories: list }).eq("name", c.name))
  })
  const removeCat = (c) => run(async () => {
    if (count[c.name]) throw new Error(`${count[c.name]} item(s) are in ${c.name}. Move them to another category first.`)
    if (!window.confirm(`Delete the category "${c.name}"?`)) return
    must(await supabase.from("inv_categories").delete().eq("name", c.name))
  })
  const addCat = () => run(async () => {
    const name = nc.name.trim(), prefix = nc.prefix.trim().toUpperCase()
    if (!name) throw new Error("Name the category.")
    if (!/^[A-Z]{2,4}$/.test(prefix)) throw new Error("SKU prefix must be 2 to 4 letters, e.g. SOL.")
    if (cats.some((c) => c.prefix === prefix)) throw new Error(`Prefix ${prefix} is already used.`)
    const subcategories = [...new Set(nc.subs.split(",").map((x) => x.trim()).filter(Boolean))]
    must(await supabase.from("inv_categories").insert({ name, prefix, kind: nc.kind, source: "Trade", sort: Math.max(0, ...cats.map((c) => c.sort)) + 10, subcategories }))
    setNc({ name: "", prefix: "", kind: "material", subs: "" }); setOpen(name)
  })

  const renameBox = () => (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input autoFocus style={{ ...s.input, padding: "5px 8px", fontSize: 13, width: 260 }} value={renaming.value} onChange={(e) => setRenaming({ ...renaming, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(null) }} />
      <button style={{ ...s.btnPrimary, width: "auto", padding: "6px 12px", fontSize: 13 }} onClick={saveRename} disabled={busy}>Save</button>
      <button style={s.btnGhost} onClick={() => setRenaming(null)}>Cancel</button>
    </span>
  )

  return (
    <Modal title="Categories & subcategories" onClose={onClose} width={720}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>Renaming updates every item that uses the name. DigiKey-named categories are marked; keep their wording to stay on the DigiKey standard.</div>
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        {cats.map((c) => (
          <div key={c.name} style={{ borderBottom: `1px solid ${BG}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", background: open === c.name ? PANEL : "#fff" }} onClick={() => { setOpen(open === c.name ? "" : c.name); setRenaming(null); setNewSub("") }}>
              <span style={{ display: "inline-flex", transform: open === c.name ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Icon name="chevron" size={14} color={FAINT} /></span>
              {renaming && renaming.cat === c.name && renaming.sub == null
                ? <span onClick={(e) => e.stopPropagation()}>{renameBox()}</span>
                : <span style={{ flex: 1, fontWeight: 700, color: INK, fontSize: 14 }}>{c.name}</span>}
              <span style={s.badge(c.source === "DigiKey" ? "#2f6fb0" : MUTED)}>{c.source === "DigiKey" ? "DigiKey" : "Trade"}</span>
              <span style={{ fontSize: 12, color: FAINT, width: 90, textAlign: "right" }}>{c.prefix}- · {count[c.name] || 0} items</span>
            </div>
            {open === c.name && (
              <div style={{ padding: "6px 14px 14px 34px", background: PANEL }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  <button style={{ ...s.btnSecondary, padding: "6px 12px" }} onClick={() => setRenaming({ cat: c.name, value: c.name })}>Rename category</button>
                  <button style={{ ...s.btnDanger, padding: "6px 12px" }} onClick={() => removeCat(c)} disabled={busy}>Delete category</button>
                </div>
                {(c.subcategories || []).map((x, i) => (
                  <div key={x} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 13 }}>
                    {renaming && renaming.cat === c.name && renaming.sub === x ? renameBox() : <>
                      <span style={{ flex: 1 }}>{x} <span style={{ color: FAINT }}>· {count[c.name + "|" + x] || 0}</span></span>
                      <button title="Move up" style={{ ...s.btnGhost, padding: 4 }} disabled={busy || i === 0} onClick={() => move(c, x, -1)}>↑</button>
                      <button title="Move down" style={{ ...s.btnGhost, padding: 4 }} disabled={busy || i === c.subcategories.length - 1} onClick={() => move(c, x, 1)}>↓</button>
                      <button title="Rename" style={{ ...s.btnGhost, padding: 4 }} onClick={() => setRenaming({ cat: c.name, sub: x, value: x })}><Icon name="edit" size={13} /></button>
                      <button title="Remove" style={{ ...s.btnGhost, padding: 4 }} disabled={busy} onClick={() => removeSub(c, x)}><Icon name="x" size={13} color={FAINT} /></button>
                    </>}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input style={{ ...s.input, padding: "7px 10px", fontSize: 13 }} value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub(c)} placeholder="New subcategory" />
                  <button style={{ ...s.btnSecondary, whiteSpace: "nowrap" }} onClick={() => addSub(c)} disabled={busy || !newSub.trim()}>Add</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>New category</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 90px minmax(0,1fr)", gap: 8, marginBottom: 8 }}>
        <input style={s.input} value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Category name" />
        <input style={s.input} value={nc.prefix} maxLength={4} onChange={(e) => setNc({ ...nc, prefix: e.target.value.toUpperCase() })} placeholder="SKU prefix" />
        <select style={s.input} value={nc.kind} onChange={(e) => setNc({ ...nc, kind: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>Default type: {l}</option>)}</select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={s.input} value={nc.subs} onChange={(e) => setNc({ ...nc, subs: e.target.value })} placeholder="Subcategories, separated by commas" />
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", whiteSpace: "nowrap" }} onClick={addCat} disabled={busy}>Add category</button>
      </div>
    </Modal>
  )
}

// ─── Export: Inventory (with on hand per location), Categories, Movements ─────
async function exportWorkbook({ items, everything, cats, stock, locations, catOrder }) {
  const XLSX = await loadXLSX()
  const [{ data: allLocs }, { data: jobs }, { data: emps }] = await Promise.all([
    supabase.from("inv_locations").select("id,name"), supabase.from("jobs").select("id,name"), supabase.from("employees").select("id,name"),
  ])
  const tx = await fetchAll(() => supabase.from("inv_transactions").select("*").order("created_at", { ascending: false }))
  const locName = Object.fromEntries((allLocs || []).map((l) => [l.id, l.name]))
  const jobName = Object.fromEntries((jobs || []).map((j) => [j.id, j.name]))
  const empName = Object.fromEntries((emps || []).map((e) => [e.id, e.name]))
  const byItem = Object.fromEntries(items.map((i) => [i.id, i]))
  const allItems = new Map(everything.map((i) => [i.id, i]))
  const at = {}; stock.forEach((r) => { at[r.item_id + "|" + r.location_id] = Number(r.qty || 0) })
  const locCols = locations.map((l) => l.name)
  const sorted = items.slice().sort((a, b) => (catOrder[a.category] ?? 999) - (catOrder[b.category] ?? 999) || (a.family || "").localeCompare(b.family || "") || a.name.localeCompare(b.name))

  const invRows = sorted.map((i) => {
    const per = Object.fromEntries(locations.map((l) => [l.name, at[i.id + "|" + l.id] || 0]))
    const total = stock.filter((r) => r.item_id === i.id).reduce((n, r) => n + Number(r.qty || 0), 0)
    return {
      SKU: i.sku, Category: i.category, Subcategory: i.family || "", Item: i.name, "Size / rating": i.size_rating || "", Configuration: i.configuration || "",
      Unit: i.unit || "", Type: TYPES.find(([k]) => k === i.type)?.[1] || i.type, ...per, "On hand · Total": total,
      "Reorder at": i.min_qty ?? "", "Unit cost": i.unit_cost ?? "", Value: i.unit_cost != null ? Math.round(total * Number(i.unit_cost) * 100) / 100 : "",
      "Mfr part #": i.mfr_part_number || "", "Bin / location": i.photo_location || "", Billable: i.billable ? "Yes" : "No", Active: i.active ? "Yes" : "No",
      Notes: i.notes || "", "Last edited": i.updated_at ? new Date(i.updated_at) : "",
    }
  })
  const wsInv = XLSX.utils.json_to_sheet(invRows, { cellDates: true })
  const head = Object.keys(invRows[0] || { SKU: "" })
  wsInv["!cols"] = head.map((h) => ({ wch: { Item: 42, Category: 30, Subcategory: 30, Notes: 50, "Bin / location": 24 }[h] || (locCols.includes(h) ? 12 : 14) }))
  wsInv["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: invRows.length, c: head.length - 1 } }) }
  wsInv["!freeze"] = { xSplit: 0, ySplit: 1 }
  // money formats
  const costCol = head.indexOf("Unit cost"), valCol = head.indexOf("Value")
  for (let r = 1; r <= invRows.length; r++) for (const c of [costCol, valCol]) { const ref = XLSX.utils.encode_cell({ r, c }); if (wsInv[ref] && typeof wsInv[ref].v === "number") wsInv[ref].z = "$#,##0.00" }

  const catRows = cats.map((c) => ({ Category: c.name, Source: c.source, "SKU prefix": c.prefix, "Default type": TYPES.find(([k]) => k === c.kind)?.[1] || c.kind, Items: items.filter((i) => i.category === c.name).length, Subcategories: (c.subcategories || []).join("; ") }))
  const wsCat = XLSX.utils.json_to_sheet(catRows); wsCat["!cols"] = [{ wch: 40 }, { wch: 9 }, { wch: 10 }, { wch: 13 }, { wch: 7 }, { wch: 120 }]

  const LABEL = { receive: "Received", issue: "Checked out to job", transfer: "Transferred", return: "Returned", adjust: "Adjusted", count: "Count" }
  const txRows = tx.map((t) => {
    const it = allItems.get(t.item_id) || byItem[t.item_id]
    return { Date: new Date(t.created_at), SKU: it?.sku || "", Item: it?.name || "(deleted item)", Movement: LABEL[t.type] || t.type, Qty: Number(t.qty),
      From: locName[t.from_location_id] || "", To: locName[t.to_location_id] || "", Job: jobName[t.job_id] || "", By: empName[t.employee_id] || "", "Unit cost": t.unit_cost ?? "", Note: t.note || "" }
  })
  const wsTx = XLSX.utils.json_to_sheet(txRows.length ? txRows : [{ Date: "", SKU: "", Item: "No movements yet" }], { cellDates: true })
  wsTx["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 42 }, { wch: 18 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 40 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsInv, "Inventory")
  XLSX.utils.book_append_sheet(wb, wsCat, "Categories")
  XLSX.utils.book_append_sheet(wb, wsTx, "Movements")
  const d = new Date(), pad = (n) => String(n).padStart(2, "0")
  XLSX.writeFile(wb, `Empire-Inventory-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`)
}
