// ─── Resources: files + links in folders. Admins manage; crew views. ─────────
import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, PANEL, DANGER } from "../../theme.js"
import { Icon, Modal } from "../../ui.jsx"

const SUGGESTED = ["Safety", "Forms & SOPs", "Spec Sheets & Manuals", "Code & Reference", "Vendors & Suppliers", "Training", "Company & HR"]
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const ext = (name) => (name.split(".").pop() || "").toUpperCase().slice(0, 4)

export default function Resources({ user }) {
  const [items, setItems] = useState([]); const [q, setQ] = useState(""); const [edit, setEdit] = useState(null); const [loading, setLoading] = useState(true)
  const load = async () => { const { data } = await supabase.from("resources").select("*").order("category").order("sort").order("title"); setItems(data || []); setLoading(false) }
  useEffect(() => { load() }, [])

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const hit = items.filter((r) => !term || [r.title, r.description, r.category, r.file_name].some((v) => (v || "").toLowerCase().includes(term)))
    const map = {}; hit.forEach((r) => (map[r.category] ||= []).push(r))
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [items, q])
  const categories = [...new Set([...SUGGESTED, ...items.map((r) => r.category)])]

  const open = async (r) => {
    if (r.kind === "link") return window.open(r.url, "_blank", "noopener")
    const w = window.open("", "_blank")   // open first so phones don't block the popup
    const { data, error } = await supabase.storage.from("resources").createSignedUrl(r.file_path, 3600)
    if (error || !data) { w?.close(); return alert("Couldn't open that file. Try again.") }
    if (w) w.location = data.signedUrl; else window.location.href = data.signedUrl
  }
  const remove = async (r) => {
    if (!window.confirm(`Remove "${r.title}" from Resources?`)) return
    if (r.kind === "file" && r.file_path) await supabase.storage.from("resources").remove([r.file_path])
    await supabase.from("resources").delete().eq("id", r.id); load()
  }

  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>Resources</div><div style={s.pageSub}>Forms, safety docs, spec sheets, and links in one place.</div></div>
        {user.is_admin && <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setEdit({ kind: "file", category: "" })}><Icon name="plus" size={15} color="#fff" /> Add</button>}
      </div>
      <div style={{ position: "relative", maxWidth: 380, marginBottom: 20 }}>
        <span style={{ position: "absolute", left: 12, top: 12 }}><Icon name="search" size={16} color={FAINT} /></span>
        <input style={{ ...s.input, paddingLeft: 36 }} placeholder="Search resources…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!loading && groups.length === 0 && (
        <div style={{ ...s.card, textAlign: "center", padding: 40, color: MUTED }}>
          <Icon name="folder" size={30} color={BORDER} />
          <div style={{ marginTop: 10 }}>{q ? "Nothing matches that search." : "Nothing here yet."}</div>
          {user.is_admin && !q && <div style={{ fontSize: 13, marginTop: 6 }}>Ideas: {SUGGESTED.join(" · ")}</div>}
        </div>
      )}

      {groups.map(([cat, list]) => (
        <div key={cat} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Icon name="folder" size={16} color={GD} /><span style={{ fontWeight: 800, color: INK, fontSize: 15 }}>{cat}</span><span style={{ fontSize: 12, color: FAINT }}>{list.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 10 }}>
            {list.map((r) => (
              <div key={r.id} className="lift" style={{ ...s.card, marginBottom: 0, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => open(r)}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: r.kind === "link" ? GSOFT : PANEL, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, fontWeight: 800, color: GD }}>
                  {r.kind === "link" ? <Icon name="link" size={17} color={GD} /> : ext(r.file_name) || <Icon name="file" size={17} color={GD} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: INK, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{r.description || (r.kind === "file" ? `${r.file_name} · ${kb(r.file_size)}` : r.url)}</div>
                </div>
                {user.is_admin ? (
                  <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                    <button title="Edit" style={{ ...s.btnGhost, padding: 6 }} onClick={() => setEdit(r)}><Icon name="edit" size={14} /></button>
                    <button title="Remove" style={{ ...s.btnGhost, padding: 6 }} onClick={() => remove(r)}><Icon name="trash" size={14} color={DANGER} /></button>
                  </div>
                ) : <Icon name="external" size={15} color={FAINT} />}
              </div>
            ))}
          </div>
        </div>
      ))}

      {edit && <ResourceModal r={edit} user={user} categories={categories} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function ResourceModal({ r, user, categories, onClose, onSaved }) {
  const [f, setF] = useState({ kind: r.kind || "file", title: r.title || "", category: r.category || "", description: r.description || "", url: r.url || "" })
  const [file, setFile] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false)
  const isNew = !r.id
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    setErr("")
    if (!f.title.trim()) return setErr("Add a title.")
    if (!f.category.trim()) return setErr("Pick or type a folder.")
    if (f.kind === "link" && !/^(https?:\/\/|\/)/i.test(f.url.trim())) return setErr("Links need to start with https://")
    if (f.kind === "file" && isNew && !file) return setErr("Choose a file to upload.")
    if (file && file.size > 50 * 1048576) return setErr("Files must be under 50 MB.")
    setBusy(true)
    const rec = { kind: f.kind, title: f.title.trim(), category: f.category.trim(), description: f.description.trim(), url: f.kind === "link" ? f.url.trim() : "" }
    if (file) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_")
      const path = `${rec.category.replace(/[^\w]+/g, "-").toLowerCase()}/${Date.now()}-${safe}`
      const { error } = await supabase.storage.from("resources").upload(path, file, { contentType: file.type || "application/octet-stream" })
      if (error) { setBusy(false); return setErr("Upload failed. Check the file and try again.") }
      if (r.file_path) await supabase.storage.from("resources").remove([r.file_path])
      Object.assign(rec, { file_path: path, file_name: file.name, file_size: file.size })
    }
    const { error } = isNew
      ? await supabase.from("resources").insert({ ...rec, created_by: user.id, created_by_name: user.name })
      : await supabase.from("resources").update(rec).eq("id", r.id)
    setBusy(false)
    if (error) return setErr("Couldn't save. Try again.")
    onSaved()
  }

  return (
    <Modal title={isNew ? "Add resource" : "Edit resource"} onClose={onClose} width={560}>
      {err && <div style={s.alert("error")}>{err}</div>}
      {isNew && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["file", "Upload a file", "upload"], ["link", "Add a link", "link"]].map(([k, l, ic]) => (
            <button key={k} onClick={() => set("kind", k)} style={{ ...s.btnSecondary, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...(f.kind === k ? { background: GSOFT, color: GD, borderColor: "#cde6cd" } : {}) }}><Icon name={ic} size={14} /> {l}</button>
          ))}
        </div>
      )}
      <div style={s.field}><label style={s.label}>Title</label><input style={s.input} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={f.kind === "link" ? "e.g. Crescent Electric online ordering" : "e.g. Ladder safety checklist"} /></div>
      <div style={s.field}><label style={s.label}>Folder</label><input style={s.input} list="res-cats" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Pick one or type a new folder" /><datalist id="res-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></div>
      {f.kind === "link"
        ? <div style={s.field}><label style={s.label}>Link</label><input style={s.input} value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" inputMode="url" /></div>
        : <div style={s.field}><label style={s.label}>{isNew ? "File" : "Replace file (optional)"}</label>
            <label style={{ ...s.btnSecondary, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><Icon name="upload" size={14} /> {file ? file.name : r.file_name || "Choose file (PDF, image, doc…)"}<input type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          </div>}
      <div style={s.field}><label style={s.label}>Description (optional)</label><textarea style={{ ...s.textarea, minHeight: 64 }} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="When to use it, who it's for…" /></div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={s.btnSecondary} onClick={onClose}>Cancel</button>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  )
}
