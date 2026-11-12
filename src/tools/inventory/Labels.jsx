// ─── QR labels: 1" × 1" squares, 80 per 8.5 × 11 sheet (printable magnet paper) ──
// Each label's QR opens  https://www.empireelectricnv.app/#/i/<SKU>  → the item in the hub,
// ready to check out to a job. Print at 100% ("Actual size"), no margins scaling.
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import qrcode from "qrcode-generator"
import { s, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, PANEL } from "../../theme.js"
import { Icon } from "../../ui.jsx"
import { go } from "../../router.js"

const COLS = 8, ROWS = 10, PER_SHEET = COLS * ROWS   // 8 × 10 one-inch cells, 0.25" side / 0.5" top margins
// Bare domain (redirects to www) keeps the link short enough for a coarser 29×29 code that scans easier at 1".
const ORIGIN = "https://empireelectricnv.app"
export const itemLink = (sku) => `${ORIGIN}/#/i/${encodeURIComponent(sku)}`

// QR as one SVG path (crisp at any print resolution).
function QR({ text, size }) {
  const { n, d } = useMemo(() => {
    const q = qrcode(0, "M"); q.addData(text); q.make()
    const n = q.getModuleCount(); let d = ""
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { n, d }
  }, [text])
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} shapeRendering="crispEdges" style={{ display: "block" }}>
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" /><path d={d} fill="#000" />
    </svg>
  )
}

function Label({ it }) {
  if (!it) return <div className="lbl" />
  return (
    <div className="lbl">
      <QR text={itemLink(it.sku)} size="0.74in" />
      <div className="sku">{it.sku}</div>
      <div className="nm">{it.name}</div>
    </div>
  )
}

const PRINT_CSS = `
.eh-labels { display: none; }
.lbl-sheet { width: 8.5in; height: 11in; box-sizing: border-box; padding: 0.5in 0.25in; display: grid;
  grid-template-columns: repeat(${COLS}, 1in); grid-template-rows: repeat(${ROWS}, 1in); background: #fff; }
.lbl { width: 1in; height: 1in; box-sizing: border-box; border: 0.5pt dashed #c9c9c9; display: flex; flex-direction: column;
  align-items: center; justify-content: flex-start; padding-top: 0.01in; overflow: hidden; font-family: Inter, Arial, sans-serif; color: #000; }
.lbl .sku { font-size: 6.5pt; font-weight: 800; line-height: 1; margin-top: 0; letter-spacing: .2px; }
.lbl .nm { font-size: 4.6pt; line-height: 1.1; max-width: 0.92in; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media print {
  @page { size: letter; margin: 0 !important; }
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  #root { display: none !important; }
  /* The app's T&M print rule hides everything (body * { visibility: hidden }); the label sheet opts back in. */
  .eh-labels, .eh-labels * { visibility: visible !important; }
  .eh-labels { display: block !important; position: static !important; }
  .lbl-sheet { break-after: page; page-break-after: always; }
  .lbl-sheet:last-child { break-after: auto; page-break-after: auto; }
}`

export default function Labels({ items, cats, preselect = [] }) {
  const [q, setQ] = useState(""); const [cat, setCat] = useState("")
  const [picked, setPicked] = useState(() => Object.fromEntries(preselect.map((k) => [k, 1])))   // sku → copies (preselected from #/inventory/labels/<SKU,SKU>)
  const [start, setStart] = useState(1)           // first free label on a partly used sheet
  useEffect(() => { const el = document.createElement("style"); el.textContent = PRINT_CSS; document.head.appendChild(el); return () => el.remove() }, [])

  const rows = items.filter((i) => (!cat || i.category === cat) &&
    (!q || `${i.sku} ${i.name} ${i.family || ""}`.toLowerCase().includes(q.toLowerCase())))
  const bySku = Object.fromEntries(items.map((i) => [i.sku, i]))
  const labels = [...Array(Math.max(0, Math.min(PER_SHEET, Number(start) || 1) - 1)).fill(null)]
  for (const [sku, n] of Object.entries(picked)) if (bySku[sku]) for (let k = 0; k < n; k++) labels.push(bySku[sku])
  const count = labels.filter(Boolean).length
  const sheets = []; for (let i = 0; i < labels.length; i += PER_SHEET) sheets.push(labels.slice(i, i + PER_SHEET))
  while (sheets.length && sheets[sheets.length - 1].length < PER_SHEET) sheets[sheets.length - 1].push(null)

  const toggle = (sku) => setPicked((p) => { const n = { ...p }; if (n[sku]) delete n[sku]; else n[sku] = 1; return n })
  const setCopies = (sku, v) => setPicked((p) => ({ ...p, [sku]: Math.max(1, Math.min(80, Number(v) || 1)) }))
  const allShown = rows.length > 0 && rows.every((r) => picked[r.sku])
  const toggleAll = () => setPicked((p) => { const n = { ...p }; rows.forEach((r) => (allShown ? delete n[r.sku] : (n[r.sku] ||= 1))); return n })

  return (
    <div>
      <button style={{ ...s.btnGhost, paddingLeft: 0, display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }} onClick={() => go("inventory")}><Icon name="back" size={15} /> Inventory</button>
      <div style={{ ...s.card, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, color: INK, fontSize: 17 }}>QR labels</div>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>1" × 1" labels, 80 per letter sheet. Print at <strong>100% / Actual size</strong> with margins set to <strong>None</strong>. Scanning a label opens the item, ready to check out to a job.</div>
        </div>
        <label style={{ fontSize: 13, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>Start at label #
          <input style={{ ...s.input, width: 70 }} type="number" min="1" max={PER_SHEET} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "11px 20px", display: "inline-flex", alignItems: "center", gap: 7 }} disabled={!count} onClick={() => window.print()}>
          <Icon name="file" size={16} color="#fff" /> Print {count || ""} label{count === 1 ? "" : "s"}{sheets.length > 1 ? ` · ${sheets.length} sheets` : ""}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <input style={{ ...s.input, flex: "1 1 220px", minWidth: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU or name…" />
        <select style={{ ...s.input, flex: "1 1 150px", width: "auto", minWidth: 0 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {cats.filter((c) => items.some((i) => i.category === c)).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button style={{ ...s.btnSecondary, whiteSpace: "nowrap" }} onClick={toggleAll}>{allShown ? "Clear these" : `Select all ${rows.length}`}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, alignItems: "start" }}>
        <div style={{ ...s.card, padding: 0, overflow: "hidden", maxHeight: 560, overflowY: "auto" }}>
          {rows.map((i) => (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: `1px solid ${BG}`, background: picked[i.sku] ? GSOFT : "#fff" }}>
              <input type="checkbox" checked={!!picked[i.sku]} onChange={() => toggle(i.sku)} />
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => toggle(i.sku)}>
                <div style={{ fontWeight: 700, color: INK, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
                <div style={{ fontSize: 11, color: FAINT }}>{i.sku}{i.family ? ` · ${i.family}` : ""}</div>
              </div>
              {picked[i.sku] && <input title="Copies" style={{ ...s.input, width: 56, padding: "6px 8px" }} type="number" min="1" max="80" value={picked[i.sku]} onChange={(e) => setCopies(i.sku, e.target.value)} />}
            </div>
          ))}
          {rows.length === 0 && <div style={{ padding: 24, textAlign: "center", color: MUTED }}>No items match.</div>}
        </div>

        <div style={{ ...s.card, background: PANEL }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>Preview · sheet 1</div>
          {count === 0 ? <div style={{ color: FAINT, fontSize: 13, padding: "30px 0", textAlign: "center" }}>Pick items to print.</div> : (
            <div style={{ overflow: "hidden", borderRadius: 6, border: `1px solid ${BORDER}`, width: "100%", aspectRatio: "8.5 / 11", position: "relative", background: "#fff" }}>
              <div style={{ transform: "scale(var(--k))", transformOrigin: "top left", position: "absolute", inset: 0 }} ref={(el) => { if (el) el.style.setProperty("--k", String(el.parentElement.clientWidth / 816)) }}>
                <div className="lbl-sheet">{sheets[0].map((it, k) => <Label key={k} it={it} />)}</div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>Tip: print one sheet on plain paper first and hold it against a magnet sheet to check alignment.</div>
        </div>
      </div>

      {createPortal(<div className="eh-labels">{sheets.map((sh, i) => <div key={i} className="lbl-sheet">{sh.map((it, k) => <Label key={k} it={it} />)}</div>)}</div>, document.body)}
    </div>
  )
}
