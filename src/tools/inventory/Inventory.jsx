// ─── Inventory: stock, tools, and materials issued to jobs ───────────────────
// Stock on hand is the running sum of a transaction ledger (inv_transactions).
// Admins receive, adjust, manage the catalog, and import the spreadsheet.
// Field crew can only issue to a job, return, transfer, and count.
import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, PANEL, SURFACE, WARN, WSOFT, DANGER } from "../../theme.js"
import { Icon, Modal } from "../../ui.jsx"
import { money } from "../../util.js"
import { timeAgo } from "../../photos.js"
import { go } from "../../router.js"
import Labels from "./Labels.jsx"
import Manage from "./Manage.jsx"
import useNarrow from "./useNarrow.js"
import { describe, needsSize } from "./describe.js"

const TYPE_LABEL = { material: "Material", tool: "Tool", equipment: "Equipment", consumable: "Consumable", asset: "Asset" }
const TYPE_COLOR = { material: G, tool: "#2f6fb0", equipment: "#8a5a1a", consumable: "#6a7a2a", asset: MUTED }
const MOVE_LABEL = { receive: "Received", issue: "Issued to job", transfer: "Transferred", return: "Returned", adjust: "Adjusted", count: "Counted" }

// SheetJS loaded from CDN at runtime so it isn't bundled (no package.json change).
async function loadXLSX() {
  return await import(/* @vite-ignore */ "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs")
}

export default function Inventory({ user, route }) {
  const tab = route[1] || "stock"
  const narrow = useNarrow()
  const [items, setItems] = useState([])
  const [stock, setStock] = useState([])        // rows from inv_stock view: {item_id, location_id, qty}
  const [locations, setLocations] = useState([])
  const [jobs, setJobs] = useState([])
  const [cats, setCats] = useState([])            // categories in display order (DigiKey names + trade names)
  const [subs, setSubs] = useState({})            // category → its subcategories, in order
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)       // {kind, item?}

  const load = async () => {
    const [{ data: it }, { data: st }, { data: loc }, { data: jb }, { data: ct }] = await Promise.all([
      supabase.from("inv_items").select("*").eq("active", true).order("category").order("name"),
      supabase.from("inv_stock").select("*"),
      supabase.from("inv_locations").select("*").eq("active", true).order("kind").order("name"),
      supabase.from("jobs").select("id,name,status,is_service").order("name"),
      supabase.from("inv_categories").select("*").order("sort"),
    ])
    const order = Object.fromEntries((ct || []).map((c) => [c.name, c.sort]))
    const sorted = (it || []).slice().sort((a, b) => (order[a.category] ?? 999) - (order[b.category] ?? 999) || (a.family || "").localeCompare(b.family || "") || a.name.localeCompare(b.name))
    setItems(sorted); setStock(st || []); setLocations(loc || []); setJobs(jb || []); setCats((ct || []).map((c) => c.name)); setSubs(Object.fromEntries((ct || []).map((c) => [c.name, c.subcategories || []])))
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  // A scanned label lands on #/inventory/item/<SKU>: open that item.
  useEffect(() => {
    if (loading || route[1] !== "item") return
    const it = items.find((i) => i.sku === route[2])
    setModal(it ? { kind: "item", item: it } : { kind: "missing", sku: route[2] })
  }, [loading, route[1], route[2]])
  const closeModal = () => { setModal(null); if (route[1] === "item") go("inventory") }

  // on-hand helpers
  const onHandByItem = useMemo(() => {
    const m = {}
    for (const r of stock) m[r.item_id] = (m[r.item_id] || 0) + Number(r.qty || 0)
    return m
  }, [stock])
  const locName = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations])

  const stocked = items.filter((i) => i.stocked)
  const reorder = stocked.filter((i) => i.min_qty != null && (onHandByItem[i.id] || 0) < Number(i.min_qty))
  const totalValue = stocked.reduce((sum, i) => sum + (onHandByItem[i.id] || 0) * Number(i.unit_cost || 0), 0)

  const tabs = [
    { id: "stock", label: "Stock", icon: "box" },
    { id: "reorder", label: `Reorder${reorder.length ? ` ${narrow ? "" : "· "}${reorder.length}` : ""}`, icon: "bell" },
    { id: "catalog", label: "Catalog", icon: "list" },
    ...(user.is_admin ? [{ id: "manage", label: narrow ? "Manage" : "Manage & export", icon: "edit" }] : []),
  ]

  const adminActions = [
    { label: "Receive", icon: "download", run: () => setModal({ kind: "receive" }) },
    { label: "Locations", icon: "pin", run: () => setModal({ kind: "locations" }) },
    { label: "QR labels", icon: "scan", run: () => go("inventory/labels") },
    { label: "Google Sheet", icon: "grid", run: () => setModal({ kind: "sheet" }) },
    { label: "Import sheet", icon: "upload", run: () => setModal({ kind: "import" }) },
  ]

  if (loading) return <div style={{ color: MUTED, padding: 20 }}>Loading inventory…</div>
  if (tab === "labels" && user.is_admin) return <Labels key={route[2] || ""} items={stocked} cats={cats} preselect={decodeURIComponent(route[2] || "").split(",").filter(Boolean)} />

  return (
    <div>
      {/* actions: phones get one main button + a "More" menu so items aren't pushed below the fold */}
      {narrow ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button style={{ ...s.btnPrimary, flex: 1, padding: "12px 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }} onClick={() => setModal({ kind: "issue" })}>
            <Icon name="truck" size={17} color="#fff" /> Check out to job
          </button>
          {user.is_admin && <button aria-label="More inventory actions" style={{ ...s.btnSecondary, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700 }} onClick={() => setModal({ kind: "more" })}>More <Icon name="chevron" size={14} /></button>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginBottom: 14 }}>
          <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 16px", display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => setModal({ kind: "issue" })}>
            <Icon name="truck" size={16} color="#fff" /> Check out to job
          </button>
          {user.is_admin && adminActions.map((a) => (
            <button key={a.label} style={{ ...s.btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={a.run}><Icon name={a.icon} size={15} /> {a.label}</button>
          ))}
        </div>
      )}

      {/* stats */}
      {narrow ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, marginBottom: 12, overflow: "hidden" }}>
          {[["Items", stocked.length], ["Value", "$" + Math.round(totalValue).toLocaleString()], ["Low", reorder.length, reorder.length > 0], ["Places", locations.length]].map(([l, v, warn], i) => (
            <div key={l} style={{ padding: "9px 4px", textAlign: "center", borderLeft: i ? `1px solid ${BG}` : "none" }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: warn ? WARN : GD, whiteSpace: "nowrap" }}>{v}</div>
              <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px" }}>{l}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...s.grid4, marginBottom: 16 }}>
          <Stat label="Stocked items" value={stocked.length} />
          <Stat label="Inventory value" value={"$" + totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
          <Stat label="Below reorder" value={reorder.length} warn={reorder.length > 0} />
          <Stat label="Locations" value={locations.length} />
        </div>
      )}

      {/* tabs: one scrollable row on phones */}
      <div className="eh-noscrollbar" style={{ display: "flex", gap: 6, marginBottom: 12, ...(narrow ? {} : { flexWrap: "wrap", marginBottom: 14 }) }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => (location.hash = `/inventory/${t.id}`)}
            style={{ ...(tab === t.id ? s.btnPrimary : s.btnSecondary), width: "auto", padding: narrow ? "9px 4px" : "8px 14px", flex: narrow ? "1 1 0" : "0 0 auto", minWidth: 0, boxShadow: "none", fontSize: narrow ? 13.5 : undefined, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
            {!narrow && <Icon name={t.icon} size={15} color={tab === t.id ? "#fff" : MUTED} />} {t.label}
          </button>
        ))}
      </div>

      {tab === "manage" && user.is_admin
        ? <Manage user={user} onChanged={load} />
        : tab === "reorder"
        ? <ItemTable narrow={narrow} rows={reorder} onHand={onHandByItem} onOpen={(it) => setModal({ kind: "item", item: it })} empty="Nothing is below its reorder point. Nice." showMin />
        : tab === "catalog"
        ? <Catalog narrow={narrow} items={items} cats={cats} subs={subs} onHand={onHandByItem} isAdmin={user.is_admin} onOpen={(it) => setModal({ kind: "item", item: it })} />
        : <StockTab narrow={narrow} items={stocked} cats={cats} subs={subs} onHand={onHandByItem} onOpen={(it) => setModal({ kind: "item", item: it })} onImport={() => setModal({ kind: "import" })} isAdmin={user.is_admin} />}

      {modal?.kind === "more" && (
        <Modal title="Inventory" onClose={() => setModal(null)} width={420}>
          <div style={{ display: "grid", gap: 8 }}>
            {adminActions.map((a) => (
              <button key={a.label} style={{ ...s.btnSecondary, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", fontSize: 15, textAlign: "left" }} onClick={() => { setModal(null); a.run() }}>
                <Icon name={a.icon} size={18} color={GD} /> {a.label}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal?.kind === "missing" && <Modal title="Label not found" onClose={closeModal} width={420}><div style={{ fontSize: 14, color: TEXT, lineHeight: 1.6 }}>No active item has SKU <strong>{modal.sku}</strong>. It may have been retired or renumbered. Ask the office for a new label.</div></Modal>}
      {modal?.kind === "item" && <ItemModal item={modal.item} cats={cats} subs={subs} user={user} stock={stock} locName={locName} locations={locations} jobs={jobs} onClose={closeModal} onChanged={() => { closeModal(); load() }} onAction={(kind) => setModal({ kind, item: modal.item })} />}
      {modal?.kind === "issue" && <MoveModal mode="issue" user={user} items={stocked} locations={locations} jobs={jobs} onHand={onHandByItem} stock={stock} preItem={modal.item} onClose={closeModal} onDone={() => { closeModal(); load() }} />}
      {modal?.kind === "receive" && <MoveModal mode="receive" user={user} items={items} locations={locations} jobs={jobs} onHand={onHandByItem} stock={stock} preItem={modal.item} onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />}
      {modal?.kind === "count" && <CountModal user={user} item={modal.item} locations={locations} stock={stock} onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />}
      {modal?.kind === "locations" && <LocationsModal locations={locations} jobs={jobs} onClose={() => setModal(null)} onChanged={load} />}
      {modal?.kind === "sheet" && <SheetSyncModal onClose={() => setModal(null)} />}
      {modal?.kind === "import" && <ImportModal onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />}
    </div>
  )
}

function Stat({ label, value, warn }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statVal, color: warn ? WARN : GD }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  )
}

// ─── Stock tab ────────────────────────────────────────────────────────────────
function StockTab({ narrow, items, cats: allCats, subs, onHand, onOpen, onImport, isAdmin }) {
  const [q, setQ] = useState(""); const [cat, setCat] = useState(""); const [sub, setSub] = useState("")
  const cats = useMemo(() => allCats.filter((c) => items.some((i) => i.category === c)), [items, allCats])
  const subOpts = cat ? (subs[cat] || []).filter((x) => items.some((i) => i.category === cat && i.family === x)) : []
  const rows = items.filter((i) =>
    (!cat || i.category === cat) && (!sub || i.family === sub) &&
    (!q || `${i.sku} ${describe(i)} ${i.size_rating || ""} ${i.category} ${i.family || ""} ${i.mfr_part_number || ""}`.toLowerCase().includes(q.toLowerCase())))

  if (items.length === 0) return (
    <div style={{ ...s.card, textAlign: "center", padding: 44, color: MUTED }}>
      <Icon name="box" size={30} color={BORDER} />
      <div style={{ marginTop: 10, fontWeight: 700, color: INK }}>No stock yet</div>
      <div style={{ marginTop: 4, fontSize: 13 }}>{isAdmin ? "Import your inventory spreadsheet to get started." : "Ask an admin to import the inventory sheet."}</div>
      {isAdmin && <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", marginTop: 16, display: "inline-flex", alignItems: "center", gap: 7 }} onClick={onImport}><Icon name="upload" size={16} color="#fff" /> Import sheet</button>}
    </div>
  )

  return (
    <>
      <Filters q={q} setQ={setQ} cat={cat} setCat={(c) => { setCat(c); setSub("") }} cats={cats} sub={sub} setSub={setSub} subOpts={subOpts} />
      <ItemTable narrow={narrow} rows={rows} onHand={onHand} onOpen={onOpen} empty="No items match that search." />
    </>
  )
}

function Filters({ q, setQ, cat, setCat, cats, sub, setSub, subOpts = [] }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
        <span style={{ position: "absolute", left: 11, top: 11, pointerEvents: "none" }}><Icon name="search" size={16} color={FAINT} /></span>
        <input style={{ ...s.input, paddingLeft: 34 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU, name, part #…" />
      </div>
      <select style={{ ...s.input, flex: "1 1 140px", width: "auto", minWidth: 0 }} value={cat} onChange={(e) => setCat(e.target.value)}>
        <option value="">All categories</option>
        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {cat && subOpts.length > 1 && (
        <select style={{ ...s.input, flex: "1 1 140px", width: "auto", minWidth: 0 }} value={sub} onChange={(e) => setSub(e.target.value)}>
          <option value="">All subcategories</option>
          {subOpts.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
    </div>
  )
}

function ItemTable({ narrow, rows, onHand, onOpen, empty, showMin }) {
  if (rows.length === 0) return <div style={{ ...s.card, textAlign: "center", color: MUTED, padding: 30 }}>{empty}</div>
  if (narrow) return (
    <PhoneList rows={rows} onOpen={onOpen} right={(i) => {
      const oh = onHand[i.id] || 0, low = i.min_qty != null && oh < Number(i.min_qty)
      return <>
        <div style={{ fontWeight: 800, fontSize: 16, color: low ? WARN : INK }}>{fmtQty(oh)}</div>
        <div style={{ fontSize: 11, color: low ? WARN : FAINT, fontWeight: low ? 700 : 500 }}>{low ? (showMin ? `LOW · min ${i.min_qty}` : "LOW") : i.unit}</div>
      </>
    }} />
  )
  return (
    <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead><tr>
            <th style={s.th}>Item</th>
            <th style={s.th}>Type</th>
            <th style={{ ...s.th, textAlign: "right" }}>On hand</th>
            {showMin && <th style={{ ...s.th, textAlign: "right" }}>Min</th>}
            <th style={{ ...s.th, textAlign: "right" }}>Unit cost</th>
            <th style={{ ...s.th, textAlign: "right" }}>Value</th>
          </tr></thead>
          <tbody>
            {rows.map((i) => {
              const oh = onHand[i.id] || 0
              const low = i.min_qty != null && oh < Number(i.min_qty)
              return (
                <tr key={i.id} className="lift" style={{ cursor: "pointer" }} onClick={() => onOpen(i)}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 700, color: INK }}>{describe(i)}</div>
                    <div style={{ fontSize: 11, color: FAINT }}>{i.sku}{needsSize(i) && <span style={{ color: WARN, fontWeight: 700 }}> · size?</span>}{i.family ? ` · ${i.family}` : ""}{i.category ? ` · ${i.category}` : ""}</div>
                  </td>
                  <td style={s.td}><span style={s.badge(TYPE_COLOR[i.type] || MUTED)}>{TYPE_LABEL[i.type] || i.type}</span></td>
                  <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: low ? WARN : TEXT }}>{fmtQty(oh)} {i.unit}{low && <div style={{ fontSize: 10, color: WARN, fontWeight: 700 }}>LOW</div>}</td>
                  {showMin && <td style={{ ...s.td, textAlign: "right", color: MUTED }}>{i.min_qty ?? "—"}</td>}
                  <td style={{ ...s.td, textAlign: "right", color: MUTED }}>{i.unit_cost != null ? money(i.unit_cost) : "—"}</td>
                  <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>{i.unit_cost != null ? money(oh * Number(i.unit_cost)) : "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Phone layout for item lists: name wraps to two lines, details underneath, quantity on the right.
function PhoneList({ rows, onOpen, right }) {
  const [limit, setLimit] = useState(120)
  return (
    <>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        {rows.slice(0, limit).map((i, n) => (
          <button key={i.id} onClick={() => onOpen(i)}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "11px 14px", background: "none", border: "none", borderTop: n ? `1px solid ${BG}` : "none", textAlign: "left", cursor: "pointer", color: TEXT }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: INK, fontSize: 14.5, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{describe(i)}</div>
              <div style={{ fontSize: 12, color: FAINT, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.sku}{needsSize(i) && <span style={{ color: WARN, fontWeight: 700 }}> · size?</span>}{i.family ? ` · ${i.family}` : ""}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, minWidth: 48 }}>{right(i)}</div>
          </button>
        ))}
      </div>
      {rows.length > limit && <button style={{ ...s.btnSecondary, width: "100%", marginTop: 10 }} onClick={() => setLimit((l) => l + 120)}>Show more ({rows.length - limit} left)</button>}
    </>
  )
}

// ─── Catalog (stocked + candidate SKUs) ──────────────────────────────────────
function Catalog({ narrow, items, cats: allCats, subs, onHand, isAdmin, onOpen }) {
  const [q, setQ] = useState(""); const [cat, setCat] = useState(""); const [sub, setSub] = useState(""); const [onlyStocked, setOnlyStocked] = useState(false)
  const cats = useMemo(() => allCats.filter((c) => items.some((i) => i.category === c)), [items, allCats])
  const rows = items.filter((i) =>
    (!cat || i.category === cat) && (!sub || i.family === sub) && (!onlyStocked || i.stocked) &&
    (!q || `${i.sku} ${describe(i)} ${i.family || ""} ${i.size_rating || ""} ${i.configuration || ""}`.toLowerCase().includes(q.toLowerCase())))
    .slice(0, 400)
  return (
    <>
      <Filters q={q} setQ={setQ} cat={cat} setCat={(c) => { setCat(c); setSub("") }} cats={cats} sub={sub} setSub={setSub}
        subOpts={cat ? (subs[cat] || []).filter((x) => items.some((i) => i.category === cat && i.family === x)) : []} />
      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: MUTED, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={onlyStocked} onChange={(e) => setOnlyStocked(e.target.checked)} /> Only items we stock
      </label>
      {narrow ? <PhoneList rows={rows} onOpen={onOpen} right={(i) => i.stocked
        ? <><div style={{ fontWeight: 800, fontSize: 16, color: INK }}>{fmtQty(onHand[i.id] || 0)}</div><div style={{ fontSize: 11, color: FAINT }}>{i.unit}</div></>
        : <div style={{ fontSize: 11, color: FAINT }}>Catalog</div>} /> :
      <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>Item</th><th style={s.th}>Subcategory</th><th style={s.th}>Size / config</th>
              <th style={{ ...s.th, textAlign: "right" }}>Cost</th><th style={{ ...s.th, textAlign: "center" }}>Stocked</th>
            </tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="lift" style={{ cursor: "pointer" }} onClick={() => onOpen(i)}>
                  <td style={s.td}><div style={{ fontWeight: 700, color: INK }}>{describe(i)}</div><div style={{ fontSize: 11, color: FAINT }}>{i.category}</div></td>
                  <td style={{ ...s.td, color: MUTED }}>{i.family || "—"}</td>
                  <td style={{ ...s.td, color: MUTED }}>{[i.size_rating, i.configuration].filter(Boolean).join(" · ") || "—"}</td>
                  <td style={{ ...s.td, textAlign: "right", color: MUTED }}>{i.unit_cost != null ? money(i.unit_cost) : "—"}</td>
                  <td style={{ ...s.td, textAlign: "center" }}>{i.stocked ? <span style={s.badge(G)}>{fmtQty(onHand[i.id] || 0)}</span> : <span style={{ color: FAINT }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
      {items.filter((i) => (!cat || i.category === cat)).length > 400 && <div style={{ fontSize: 12, color: FAINT, marginTop: 8, textAlign: "center" }}>Showing first 400. Narrow the search to see more.</div>}
    </>
  )
}

// ─── Item detail modal ───────────────────────────────────────────────────────
function ItemModal({ item, cats, subs, user, stock, locName, locations, jobs, onClose, onChanged, onAction }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState(item)
  const [history, setHistory] = useState(null)
  const perLoc = stock.filter((r) => r.item_id === item.id && Number(r.qty) !== 0)
  const total = perLoc.reduce((n, r) => n + Number(r.qty || 0), 0)

  useEffect(() => {
    supabase.from("inv_transactions").select("*").eq("item_id", item.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setHistory(data || []))
  }, [item.id])

  const save = async () => {
    const patch = { name: f.name, category: f.category, family: f.family, size_rating: f.size_rating, configuration: f.configuration,
      unit: f.unit, type: f.type, billable: f.billable, unit_cost: numOrNull(f.unit_cost), min_qty: numOrNull(f.min_qty),
      mfr_part_number: f.mfr_part_number, barcode: f.barcode, notes: f.notes, stocked: f.stocked }
    const { error } = await supabase.from("inv_items").update(patch).eq("id", item.id)
    if (error) return alert(error.message)
    onChanged()
  }

  return (
    <Modal title={describe(item)} onClose={onClose} width={620}>
      {!edit ? (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={s.badge(TYPE_COLOR[item.type] || MUTED)}>{TYPE_LABEL[item.type] || item.type}</span>
            {item.billable && <span style={s.badge(G)}>Billable</span>}
            {!item.stocked && <span style={s.badge(MUTED)}>Catalog only</span>}
            {item.sku && <span style={s.badge(MUTED)}>{item.sku}</span>}
          </div>
          <div style={{ ...s.grid2, marginBottom: 14 }}>
            <KV k="Category" v={item.category} /><KV k="Subcategory" v={item.family} />
            <KV k="Size / rating" v={item.size_rating} /><KV k="Configuration" v={item.configuration} />
            <KV k="Unit" v={item.unit} /><KV k="Mfr part #" v={item.mfr_part_number} />
            <KV k="Unit cost" v={item.unit_cost != null ? money(item.unit_cost) : null} /><KV k="Reorder at" v={item.min_qty} />
          </div>
          {item.notes && <div style={{ fontSize: 13, color: TEXT, background: PANEL, padding: "8px 12px", borderRadius: 8, marginBottom: 14 }}>{item.notes}</div>}

          <SectionLabel>On hand · {fmtQty(total)} {item.unit}</SectionLabel>
          {perLoc.length === 0 ? <div style={{ color: FAINT, fontSize: 13, marginBottom: 12 }}>None in stock.</div> : (
            <div style={{ marginBottom: 14 }}>
              {perLoc.map((r) => (
                <div key={r.location_id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BG}`, fontSize: 13 }}>
                  <span>{locName[r.location_id]?.name || "Unknown"}{locName[r.location_id]?.kind === "vehicle" ? " 🚚" : ""}</span>
                  <strong>{fmtQty(r.qty)} {item.unit}</strong>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button style={{ ...s.btnPrimary, width: "auto", padding: "9px 14px", display: "inline-flex", gap: 6, alignItems: "center" }} onClick={() => onAction("issue")}><Icon name="truck" size={15} color="#fff" /> Check out to job</button>
            {user.is_admin && <>
              <button style={s.btnSecondary} onClick={() => onAction("receive")}>Receive</button>
              <button style={s.btnSecondary} onClick={() => onAction("count")}>Count</button>
              <button style={{ ...s.btnSecondary, display: "inline-flex", gap: 6, alignItems: "center" }} onClick={() => go(`inventory/labels/${encodeURIComponent(item.sku)}`)}><Icon name="scan" size={15} /> Print label</button>
              <button style={s.btnSecondary} onClick={() => setEdit(true)}>Edit</button>
            </>}
          </div>

          <SectionLabel>Recent activity</SectionLabel>
          {history == null ? <div style={{ color: FAINT, fontSize: 13 }}>Loading…</div>
            : history.length === 0 ? <div style={{ color: FAINT, fontSize: 13 }}>No movements yet.</div>
            : history.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BG}`, fontSize: 12.5 }}>
                <span style={{ color: TEXT }}>{MOVE_LABEL[h.type] || h.type}{h.note ? ` · ${h.note}` : ""}</span>
                <span style={{ color: MUTED, whiteSpace: "nowrap" }}>{fmtQty(h.qty)} · {new Date(h.created_at).toLocaleDateString()}</span>
              </div>
            ))}
        </>
      ) : (
        <>
          <Field label="Name"><input style={s.input} value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div style={s.grid2}>
            <Field label="Category">
              <select style={s.input} value={f.category || ""} onChange={(e) => setF({ ...f, category: e.target.value, family: (subs[e.target.value] || []).includes(f.family) ? f.family : "" })}>
                {!cats.includes(f.category) && <option value={f.category || ""}>{f.category || "Pick a category…"}</option>}
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Subcategory">
              <select style={s.input} value={f.family || ""} onChange={(e) => setF({ ...f, family: e.target.value })}>
                <option value="">Pick a subcategory…</option>
                {f.family && !(subs[f.category] || []).includes(f.family) && <option value={f.family}>{f.family}</option>}
                {(subs[f.category] || []).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Size / rating"><input style={s.input} value={f.size_rating || ""} onChange={(e) => setF({ ...f, size_rating: e.target.value })} /></Field>
            <Field label="Configuration"><input style={s.input} value={f.configuration || ""} onChange={(e) => setF({ ...f, configuration: e.target.value })} /></Field>
            <Field label="Unit"><input style={s.input} value={f.unit || ""} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
            <Field label="Type">
              <select style={s.input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                {Object.keys(TYPE_LABEL).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field label="Unit cost"><input style={s.input} type="number" step="0.01" value={f.unit_cost ?? ""} onChange={(e) => setF({ ...f, unit_cost: e.target.value })} /></Field>
            <Field label="Reorder at (min qty)"><input style={s.input} type="number" step="any" value={f.min_qty ?? ""} onChange={(e) => setF({ ...f, min_qty: e.target.value })} /></Field>
            <Field label="Mfr part #"><input style={s.input} value={f.mfr_part_number || ""} onChange={(e) => setF({ ...f, mfr_part_number: e.target.value })} /></Field>
            <Field label="Barcode"><input style={s.input} value={f.barcode || ""} onChange={(e) => setF({ ...f, barcode: e.target.value })} /></Field>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "4px 0 12px" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}><input type="checkbox" checked={!!f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} /> Billable to customer</label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}><input type="checkbox" checked={!!f.stocked} onChange={(e) => setF({ ...f, stocked: e.target.checked })} /> We stock this</label>
          </div>
          <Field label="Notes"><textarea style={s.textarea} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={s.btnGhost} onClick={() => { setF(item); setEdit(false) }}>Cancel</button>
            <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 20px" }} onClick={save}>Save</button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Move modal: Issue (field + admin) / Receive (admin) ─────────────────────
function MoveModal({ mode, user, items, locations, jobs, onHand, stock, preItem, onClose, onDone }) {
  const issue = mode === "issue"
  const [itemId, setItemId] = useState(preItem?.id || "")
  const [q, setQ] = useState("")
  const [qty, setQty] = useState("")
  const [fromLoc, setFromLoc] = useState("")
  const [toLoc, setToLoc] = useState("")
  const [jobId, setJobId] = useState("")
  const [cost, setCost] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("")

  const shops = locations.filter((l) => l.kind === "shop" || l.kind === "vehicle")
  const item = items.find((i) => i.id === itemId)
  const activeJobs = jobs.filter((j) => (j.status || "Active") !== "Closed")

  useEffect(() => { if (shops.length && !fromLoc) setFromLoc(shops[0].id); if (shops.length && !toLoc) setToLoc(shops.find((l) => l.kind === "shop")?.id || shops[0].id) }, [locations])
  useEffect(() => { if (item && cost === "" && item.unit_cost != null) setCost(String(item.unit_cost)) }, [itemId])

  const matches = q ? items.filter((i) => `${i.sku} ${describe(i)} ${i.size_rating || ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []
  const avail = issue && item ? (stock.find((r) => r.item_id === item.id && r.location_id === fromLoc)?.qty || 0) : null

  const submit = async () => {
    setErr("")
    const n = Number(qty)
    if (!itemId) return setErr("Pick an item.")
    if (!n || n <= 0) return setErr("Enter a quantity.")
    if (issue && !jobId) return setErr("Pick the job this is going to.")
    setBusy(true)
    const row = issue
      ? { item_id: itemId, type: "issue", qty: n, from_location_id: fromLoc || null, job_id: jobId, employee_id: user.id, unit_cost: numOrNull(cost), note: note || null }
      : { item_id: itemId, type: "receive", qty: n, to_location_id: toLoc || null, employee_id: user.id, unit_cost: numOrNull(cost), note: note || null }
    const { error } = await supabase.from("inv_transactions").insert(row)
    setBusy(false)
    if (error) return setErr(error.message)
    onDone()
  }

  return (
    <Modal title={issue ? "Check out to a job" : "Receive stock"} onClose={onClose} width={520}>
      {err && <div style={s.alert("error")}>{err}</div>}
      {!preItem && (
        <Field label="Item">
          {item ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...s.input }}>
              <span><strong>{describe(item)}</strong> <span style={{ color: FAINT, fontSize: 12 }}>{item.sku}</span></span>
              <button style={s.btnGhost} onClick={() => { setItemId(""); setQ("") }}><Icon name="x" size={14} /></button>
            </div>
          ) : (
            <>
              <input style={s.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item name or SKU…" autoFocus />
              {matches.length > 0 && (
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, marginTop: 4, overflow: "hidden" }}>
                  {matches.map((m) => (
                    <div key={m.id} className="lift" onClick={() => { setItemId(m.id); setQ("") }} style={{ padding: "8px 11px", cursor: "pointer", borderBottom: `1px solid ${BG}`, fontSize: 13 }}>
                      <strong>{describe(m)}</strong> <span style={{ color: FAINT }}>· {m.sku} · {fmtQty(onHand[m.id] || 0)} {m.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Field>
      )}

      {issue ? (
        <>
          <Field label="From"><select style={s.input} value={fromLoc} onChange={(e) => setFromLoc(e.target.value)}>{shops.map((l) => <option key={l.id} value={l.id}>{l.name}{l.kind === "vehicle" ? " (truck)" : ""}</option>)}</select></Field>
          <Field label="To job"><select style={s.input} value={jobId} onChange={(e) => setJobId(e.target.value)}><option value="">Select a job…</option>{activeJobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select></Field>
          {avail != null && <div style={{ fontSize: 12, color: Number(avail) < Number(qty || 0) ? WARN : MUTED, marginTop: -8, marginBottom: 10 }}>{fmtQty(avail)} {item?.unit} available at that location</div>}
        </>
      ) : (
        <Field label="Into"><select style={s.input} value={toLoc} onChange={(e) => setToLoc(e.target.value)}>{shops.map((l) => <option key={l.id} value={l.id}>{l.name}{l.kind === "vehicle" ? " (truck)" : ""}</option>)}</select></Field>
      )}

      <div style={s.grid2}>
        <Field label={`Quantity${item ? ` (${item.unit})` : ""}`}><input style={s.input} type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /></Field>
        <Field label="Unit cost"><input style={s.input} type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="optional" /></Field>
      </div>
      <Field label="Note"><input style={s.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></Field>
      {issue && item?.billable && <div style={{ fontSize: 12, color: GD, background: GSOFT, padding: "8px 11px", borderRadius: 8, marginBottom: 12 }}>Billable material. It's logged against the job for the T&M sheet.</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={s.btnGhost} onClick={onClose}>Cancel</button>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 20px" }} onClick={submit} disabled={busy}>{busy ? "Saving…" : issue ? "Check out" : "Receive"}</button>
      </div>
    </Modal>
  )
}

// ─── Count modal (admin): set on-hand at a location ──────────────────────────
function CountModal({ user, item, locations, stock, onClose, onDone }) {
  const shops = locations.filter((l) => l.kind === "shop" || l.kind === "vehicle")
  const [loc, setLoc] = useState(shops[0]?.id || "")
  const [counted, setCounted] = useState("")
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("")
  const current = Number(stock.find((r) => r.item_id === item.id && r.location_id === loc)?.qty || 0)

  const submit = async () => {
    setErr("")
    const target = Number(counted)
    if (counted === "" || isNaN(target)) return setErr("Enter the counted quantity.")
    const delta = target - current
    if (delta === 0) return onDone()
    setBusy(true)
    const row = delta > 0
      ? { item_id: item.id, type: "count", qty: delta, to_location_id: loc, employee_id: user.id, note: "Physical count" }
      : { item_id: item.id, type: "count", qty: -delta, from_location_id: loc, employee_id: user.id, note: "Physical count" }
    const { error } = await supabase.from("inv_transactions").insert(row)
    setBusy(false)
    if (error) return setErr(error.message)
    onDone()
  }
  return (
    <Modal title={`Count · ${describe(item)}`} onClose={onClose} width={440}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <Field label="Location"><select style={s.input} value={loc} onChange={(e) => setLoc(e.target.value)}>{shops.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>System shows <strong>{fmtQty(current)} {item.unit}</strong> here.</div>
      <Field label={`Counted quantity (${item.unit})`}><input style={s.input} type="number" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={s.btnGhost} onClick={onClose}>Cancel</button>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 20px" }} onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save count"}</button>
      </div>
    </Modal>
  )
}

// ─── Locations modal (admin) ─────────────────────────────────────────────────
function LocationsModal({ locations, jobs, onClose, onChanged }) {
  const [name, setName] = useState(""); const [kind, setKind] = useState("vehicle"); const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!name.trim()) return
    setBusy(true)
    await supabase.from("inv_locations").insert({ name: name.trim(), kind })
    setName(""); setBusy(false); onChanged()
  }
  const remove = async (l) => { if (!window.confirm(`Remove ${l.name}?`)) return; await supabase.from("inv_locations").update({ active: false }).eq("id", l.id); onChanged() }
  return (
    <Modal title="Stock locations" onClose={onClose} width={480}>
      <div style={{ marginBottom: 14 }}>
        {locations.map((l) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BG}` }}>
            <span><strong>{l.name}</strong> <span style={s.badge(l.kind === "vehicle" ? "#2f6fb0" : l.kind === "shop" ? G : MUTED)}>{l.kind}</span></span>
            {l.kind !== "job" && <button style={{ ...s.btnGhost, padding: 5 }} onClick={() => remove(l)}><Icon name="trash" size={14} color={FAINT} /></button>}
          </div>
        ))}
      </div>
      <SectionLabel>Add a location</SectionLabel>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...s.input, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Oscar's van, Shop bin A" />
        <select style={{ ...s.input, width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value)}><option value="vehicle">Vehicle</option><option value="shop">Shop</option></select>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "0 16px" }} onClick={add} disabled={busy}>Add</button>
      </div>
    </Modal>
  )
}

// ─── Google Sheet sync (admin): sync keys + setup steps ──────────────────────
// The Sheet runs public/empire-hub-sheet-sync.gs, which talks to the sheets-sync edge function.
function SheetSyncModal({ onClose }) {
  const [keys, setKeys] = useState(null); const [fresh, setFresh] = useState(""); const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(""); const [err, setErr] = useState("")
  const load = async () => { const { data } = await supabase.from("inv_sync_keys").select("*").is("revoked_at", null).order("created_at", { ascending: false }); setKeys(data || []) }
  useEffect(() => { load() }, [])
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 2500) }
    catch { setErr("Couldn't copy automatically. Select the text and copy it.") }
  }
  const create = async () => {
    setBusy(true); setErr("")
    const { data, error } = await supabase.rpc("inv_create_sync_key", { p_label: "Google Sheet" })
    setBusy(false)
    if (error || !data) return setErr("Couldn't create a key. Try again.")
    setFresh(data); load()
  }
  const revoke = async (k) => {
    if (!window.confirm("Revoke this key? Any Google Sheet using it stops syncing until it's set up with a new key.")) return
    await supabase.from("inv_sync_keys").update({ revoked_at: new Date().toISOString() }).eq("id", k.id); load()
  }
  const copyScript = async () => {
    const res = await fetch("/empire-hub-sheet-sync.gs", { cache: "no-store" })
    if (!res.ok) return setErr("Couldn't load the script. Try again.")
    copy(await res.text(), "script")
  }
  const step = (n, title, body) => (
    <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
      <div style={{ width: 26, height: 26, borderRadius: 13, background: GSOFT, color: GD, fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
      <div style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.55 }}><strong style={{ color: INK }}>{title}</strong><div>{body}</div></div>
    </div>
  )
  return (
    <Modal title="Sync with Google Sheets" onClose={onClose} width={600}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6, marginBottom: 16 }}>
        A Google Sheet tab that stays in step with this inventory. Edits in the sheet save here within seconds; issues, receiving, and edits here show up in the sheet every 5 minutes. A changed on-hand number in the sheet is recorded as a count at Main Shop with the editor's name.
      </div>

      {step(1, "Open the sheet in Google Sheets", "Upload the inventory workbook to Google Drive and open it with Google Sheets (or start a blank Google Sheet). The sync adds its own \"Hub Inventory\" tab.")}
      {step(2, "Add the sync script", <>In the sheet: Extensions → Apps Script. Delete what's there, paste the script, and click Save.
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...s.btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={copyScript}><Icon name="file" size={14} /> {copied === "script" ? "Copied ✓" : "Copy script"}</button>
          <a style={{ ...s.btnGhost, display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }} href="/empire-hub-sheet-sync.gs" target="_blank" rel="noreferrer"><Icon name="external" size={14} /> View</a>
        </div></>)}
      {step(3, "Connect it", <>Reload the sheet. Use the new <strong>Empire Hub → Set up sync…</strong> menu and paste a sync key from below. Google asks you to allow the script once.</>)}

      <SectionLabel>Sync key</SectionLabel>
      {fresh ? (
        <div style={{ background: WSOFT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: WARN, fontWeight: 700, marginBottom: 6 }}>Copy this now. It's only shown once.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ flex: 1, fontSize: 12.5, wordBreak: "break-all", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px" }}>{fresh}</code>
            <button style={{ ...s.btnPrimary, width: "auto", padding: "9px 14px" }} onClick={() => copy(fresh, "key")}>{copied === "key" ? "Copied ✓" : "Copy"}</button>
          </div>
        </div>
      ) : (
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 7 }} onClick={create} disabled={busy}>
          <Icon name="plus" size={15} color="#fff" /> {busy ? "Creating…" : "Create sync key"}
        </button>
      )}
      {keys == null ? <div style={{ color: FAINT, fontSize: 13 }}>Loading…</div>
        : keys.length === 0 ? <div style={{ color: FAINT, fontSize: 13 }}>No keys yet.</div>
        : keys.map((k) => (
          <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BG}`, fontSize: 13 }}>
            <span><strong>{k.label}</strong> <span style={{ color: FAINT }}>…{k.key_hint}</span>
              <div style={{ fontSize: 12, color: MUTED }}>Created {timeAgo(k.created_at)} · {k.last_used_at ? `last synced ${timeAgo(k.last_used_at)}` : "not used yet"}</div></span>
            <button style={{ ...s.btnGhost, color: DANGER }} onClick={() => revoke(k)}>Revoke</button>
          </div>
        ))}
      <div style={{ fontSize: 12, color: FAINT, marginTop: 12, lineHeight: 1.5 }}>Share the Google Sheet with office admins only. Anyone who can edit it can see the key inside its script.</div>
    </Modal>
  )
}

// ─── Import modal (admin): load the Empire inventory spreadsheet ─────────────
const CAT_TABS = { Tools: ["tool", false], Materials: ["material", true], Lighting: ["material", true], "Safety & Rigging": ["equipment", false], "Office Supplies": ["asset", false], "IT & AV": ["asset", false], "Shop Supplies": ["consumable", false] }
const CATALOG_MATERIAL_CATS = ["Wire & Cable", "Conduit & Raceway", "Devices & Plates", "Breakers & Distribution", "Boxes & Covers", "Data & Comms", "Lighting", "Fasteners & Supports"]

function ImportModal({ onClose, onDone }) {
  const [busy, setBusy] = useState(false); const [log, setLog] = useState([]); const [err, setErr] = useState("")
  const [includeCatalog, setIncludeCatalog] = useState(false)
  const add = (m) => setLog((l) => [...l, m])

  const run = async (file) => {
    setErr(""); setLog([]); setBusy(true)
    try {
      add("Reading workbook…")
      const XLSX = await loadXLSX()
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" })

      // Ensure Main Shop location
      let { data: shop } = await supabase.from("inv_locations").select("id").eq("name", "Main Shop").maybeSingle()
      if (!shop) { const { data } = await supabase.from("inv_locations").insert({ name: "Main Shop", kind: "shop" }).select("id").single(); shop = data }
      const shopId = shop.id

      // Stocked category tabs
      const stockedRows = []; const onHandTargets = []   // {sku, qty}
      for (const [tab, [type, billable]] of Object.entries(CAT_TABS)) {
        const ws = wb.Sheets[tab]; if (!ws) continue
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
        for (const r of rows) {
          const sku = r[0]
          if (!sku || !/^[A-Z]{2,3}-\d+/.test(String(sku))) continue
          stockedRows.push({ sku: String(sku), category: tab, name: r[1] || String(sku), unit: r[3] || "each", type, billable,
            unit_cost: numOrNull(r[9]), pricing_basis: r[10] || null, min_qty: numOrNull(r[6]), photo_location: r[2] || null,
            notes: [r[7], r[8]].filter(Boolean).join(" / ") || null, stocked: true, active: true })
          const target = r[5] != null && r[5] !== "" ? Number(r[5]) : (r[4] != null && r[4] !== "" ? Number(r[4]) : null)
          if (target != null && !isNaN(target)) onHandTargets.push({ sku: String(sku), qty: target })
        }
      }
      add(`Found ${stockedRows.length} stocked items.`)
      await upsertBatch(stockedRows)

      // Candidate catalog
      if (includeCatalog && wb.Sheets["Electrical Stock Catalog"]) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets["Electrical Stock Catalog"], { header: 1, blankrows: false })
        const cat = []
        let n = 0
        for (const r of rows) {
          if (!r[0] || !r[2] || r[0] === "Category") continue
          n++
          cat.push({ sku: `CAT-${String(n).padStart(5, "0")}`, category: r[0], family: r[1], name: r[2], size_rating: r[3], configuration: r[4],
            unit: r[5] || "each", type: CATALOG_MATERIAL_CATS.includes(r[0]) ? "material" : "material", billable: true,
            min_qty: numOrNull(r[7]), mfr_part_number: r[8] || null, unit_cost: numOrNull(r[11]), pricing_basis: r[12] || null,
            notes: r[10] || null, stocked: false, active: true })
        }
        add(`Found ${cat.length} catalog candidates.`)
        await upsertBatch(cat)
      }

      // Reconcile on-hand to the sheet's counts at Main Shop
      if (onHandTargets.length) {
        add("Setting on-hand counts…")
        const skus = onHandTargets.map((t) => t.sku)
        const idBySku = {}
        for (let i = 0; i < skus.length; i += 500) {
          const { data } = await supabase.from("inv_items").select("id,sku").in("sku", skus.slice(i, i + 500))
          ;(data || []).forEach((it) => (idBySku[it.sku] = it.id))
        }
        const itemIds = Object.values(idBySku)
        const current = {}
        for (let i = 0; i < itemIds.length; i += 500) {
          const { data } = await supabase.from("inv_stock").select("item_id,qty").eq("location_id", shopId).in("item_id", itemIds.slice(i, i + 500))
          ;(data || []).forEach((r) => (current[r.item_id] = Number(r.qty || 0)))
        }
        const tx = []
        for (const t of onHandTargets) {
          const id = idBySku[t.sku]; if (!id) continue
          const delta = t.qty - (current[id] || 0)
          if (delta === 0) continue
          tx.push(delta > 0
            ? { item_id: id, type: "count", qty: delta, to_location_id: shopId, note: "Sheet import" }
            : { item_id: id, type: "count", qty: -delta, from_location_id: shopId, note: "Sheet import" })
        }
        for (let i = 0; i < tx.length; i += 500) { const { error } = await supabase.from("inv_transactions").insert(tx.slice(i, i + 500)); if (error) throw error }
        add(`Reconciled ${tx.length} on-hand counts.`)
      }

      add("Done.")
      setBusy(false)
      setTimeout(onDone, 900)
    } catch (e) {
      setErr(e.message || String(e)); setBusy(false)
    }
  }

  return (
    <Modal title="Import inventory spreadsheet" onClose={onClose} width={520}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.6, marginBottom: 14 }}>
        Upload the <strong>Empire Electric Inventory</strong> workbook (.xlsx). It loads the 7 stock tabs (Tools, Materials, Lighting, Safety &amp; Rigging, Office Supplies, IT &amp; AV, Shop Supplies) and sets on-hand to your verified counts. You can re-run this any time you update the sheet; items update in place by SKU.
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: MUTED, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={includeCatalog} onChange={(e) => setIncludeCatalog(e.target.checked)} /> Also load the Electrical Stock Catalog as pick-list candidates
      </label>

      {!busy && log.length === 0 && (
        <label style={{ ...s.btnPrimary, width: "auto", padding: "11px 18px", display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
          <Icon name="upload" size={16} color="#fff" /> Choose .xlsx file
          <input type="file" accept=".xlsx" style={{ display: "none" }} onChange={(e) => e.target.files[0] && run(e.target.files[0])} />
        </label>
      )}
      {log.length > 0 && (
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, fontFamily: "ui-monospace, monospace" }}>
          {log.map((l, i) => <div key={i} style={{ color: i === log.length - 1 && !busy ? GD : TEXT, padding: "2px 0" }}>{l}</div>)}
          {busy && <div style={{ color: MUTED }}>…</div>}
        </div>
      )}
    </Modal>
  )
}

// Items that already exist keep their category, family, type, and active flag: those are managed in the
// hub (or the Google Sheet) now, so a re-import only refreshes counts, costs, and notes.
async function upsertBatch(rows) {
  const existing = new Set()
  for (let i = 0; i < rows.length; i += 500) {
    const { data } = await supabase.from("inv_items").select("sku").in("sku", rows.slice(i, i + 500).map((r) => r.sku))
    ;(data || []).forEach((r) => existing.add(r.sku))
  }
  // Two batches so every row in a batch has the same columns (mixed shapes would blank the missing ones).
  const fresh = rows.filter((r) => !existing.has(r.sku))
  const known = rows.filter((r) => existing.has(r.sku)).map(({ category, family, type, active, stocked, ...keep }) => keep)
  for (const batch of [fresh, known])
    for (let i = 0; i < batch.length; i += 400) {
      const { error } = await supabase.from("inv_items").upsert(batch.slice(i, i + 400), { onConflict: "sku" })
      if (error) throw error
    }
}

// ─── little bits ─────────────────────────────────────────────────────────────
const fmtQty = (n) => { const x = Number(n || 0); return Number.isInteger(x) ? String(x) : x.toFixed(1) }
const numOrNull = (v) => { if (v == null || v === "") return null; const n = Number(v); return isNaN(n) ? null : n }
function KV({ k, v }) { if (v == null || v === "") return null; return <div><div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: ".4px" }}>{k}</div><div style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{v}</div></div> }
function Field({ label, children }) { return <div style={s.field}><label style={s.label}>{label}</label>{children}</div> }
function SectionLabel({ children }) { return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: MUTED, margin: "6px 0 8px" }}>{children}</div> }
