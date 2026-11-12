// ─── Announcements: admins post; everyone confirms ("Got it") and comments ───
import { useEffect, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, PANEL, WARN, WSOFT, DANGER } from "../../theme.js"
import { Icon, Modal, Avatar, pushNotification } from "../../ui.jsx"
import { timeAgo } from "../../photos.js"
import { fmtDateTime } from "../../util.js"

// Attachments share the private "resources" bucket (admins upload, crew can open).
const BUCKET = "resources"
const MAX_MB = 50
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`)
const ext = (name) => (name.includes(".") ? name.split(".").pop().toUpperCase().slice(0, 4) : "FILE")

async function openFile(f) {
  const w = window.open("", "_blank")   // open first so phones don't block the popup
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 3600)
  if (error || !data) { w?.close(); return alert("Couldn't open that file. Try again.") }
  if (w) w.location = data.signedUrl; else window.location.href = data.signedUrl
}

function FileChip({ f, onClick, onRemove }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: 12, background: "#fff", cursor: onClick ? "pointer" : "default", minWidth: 0 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: GSOFT, color: GD, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ext(f.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
        <div style={{ fontSize: 12, color: MUTED }}>{kb(f.size)}{onClick ? " · Tap to open" : ""}</div>
      </div>
      {onClick && <Icon name="external" size={15} color={FAINT} />}
      {onRemove && <button title="Remove file" type="button" style={{ ...s.btnGhost, padding: 6 }} onClick={(e) => { e.stopPropagation(); onRemove() }}><Icon name="x" size={14} color={FAINT} /></button>}
    </div>
  )
}

export default function Announcements({ user }) {
  const [items, setItems] = useState([])
  const [reads, setReads] = useState([])          // admins: everyone's; crew: their own
  const [counts, setCounts] = useState({})        // comment counts
  const [crew, setCrew] = useState([])            // admins: who should confirm
  const [edit, setEdit] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [{ data: a }, { data: r }, { data: c }] = await Promise.all([
      supabase.from("announcements").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("announcement_reads").select("*"),
      supabase.from("announcement_comments").select("announcement_id"),
    ])
    setItems(a || []); setReads(r || [])
    const cc = {}; (c || []).forEach((x) => { cc[x.announcement_id] = (cc[x.announcement_id] || 0) + 1 }); setCounts(cc)
    setLoading(false)
  }
  useEffect(() => {
    load()
    if (user.is_admin) supabase.from("employees").select("id,name,photo_url").eq("active", true).eq("is_owner", false).order("name").then(({ data }) => setCrew(data || []))
    const ch = supabase.channel("ann-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_comments" }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const confirm = async (a) => {
    setReads((r) => [...r, { announcement_id: a.id, employee_id: user.id, read_at: new Date().toISOString() }])
    await supabase.from("announcement_reads").insert({ announcement_id: a.id, employee_id: user.id })
  }
  const togglePin = async (a) => { await supabase.from("announcements").update({ pinned: !a.pinned }).eq("id", a.id); load() }
  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.title}"? Comments, confirmations, and attached files go with it.`)) return
    await supabase.from("announcements").delete().eq("id", a.id)
    const paths = (a.attachments || []).map((f) => f.path)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    load()
  }

  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>Announcements</div><div style={s.pageSub}>{user.is_admin ? "Post news to the crew and see who's confirmed." : "Company news. Tap “Got it” so the office knows you saw it."}</div></div>
        {user.is_admin && <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setEdit({ title: "", body: "", pinned: false })}><Icon name="plus" size={15} color="#fff" /> New Announcement</button>}
      </div>

      {!loading && items.length === 0 && (
        <div style={{ ...s.card, textAlign: "center", padding: 48, color: MUTED }}>
          <Icon name="megaphone" size={30} color={BORDER} />
          <div style={{ marginTop: 12 }}>{user.is_admin ? "No announcements yet. Post the first one: schedule changes, safety reminders, shout-outs." : "Nothing posted yet."}</div>
        </div>
      )}

      {items.map((a) => (
        <AnnouncementCard key={a.id} a={a} user={user} crew={crew} reads={reads.filter((r) => r.announcement_id === a.id)}
          commentCount={counts[a.id] || 0} onConfirm={() => confirm(a)} onEdit={() => setEdit(a)} onPin={() => togglePin(a)} onDelete={() => remove(a)} onComment={load} />
      ))}

      {edit && <Composer a={edit} user={user} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function AnnouncementCard({ a, user, crew, reads, commentCount, onConfirm, onEdit, onPin, onDelete, onComment }) {
  const [showReads, setShowReads] = useState(false)
  const [showComments, setShowComments] = useState(a.kind === "celebration")
  const mine = reads.find((r) => r.employee_id === user.id)
  const isAuthor = a.author_id === user.id
  const expected = crew.filter((c) => c.id !== a.author_id)
  const seenIds = new Set(reads.map((r) => r.employee_id))
  const seen = expected.filter((c) => seenIds.has(c.id)), notYet = expected.filter((c) => !seenIds.has(c.id))
  const party = a.kind === "celebration"
  const needsAck = !party && !isAuthor && !mine

  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${a.pinned ? WARN : needsAck || party ? G : BORDER}`, padding: 0, overflow: "hidden", ...(party ? { background: "linear-gradient(135deg, #F1F9F1, #FFFFFF 60%)" } : {}) }}>
      <div style={{ padding: "18px 20px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              {a.pinned && <span style={s.badge(WARN, WSOFT)}><Icon name="pinned" size={10} color={WARN} /> Pinned</span>}
              {needsAck && <span style={s.badge(GD, GSOFT)}>New</span>}
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, color: INK, lineHeight: 1.25 }}>{a.title}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{a.author_name} · {timeAgo(a.created_at)}{a.updated_at && new Date(a.updated_at) - new Date(a.created_at) > 60000 ? " · edited" : ""}</div>
          </div>
          {user.is_admin && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button title={a.pinned ? "Unpin" : "Pin to top"} style={{ ...s.btnGhost, padding: 7 }} onClick={onPin}><Icon name="pinned" size={15} color={a.pinned ? WARN : MUTED} /></button>
              <button title="Edit" style={{ ...s.btnGhost, padding: 7 }} onClick={onEdit}><Icon name="edit" size={15} /></button>
              {user.is_super && <button title="Delete" style={{ ...s.btnGhost, padding: 7 }} onClick={onDelete}><Icon name="trash" size={15} color={DANGER} /></button>}
            </div>
          )}
        </div>
        {a.body && <div style={{ fontSize: 15, lineHeight: 1.6, color: TEXT, whiteSpace: "pre-wrap", marginTop: 12 }}>{a.body}</div>}
        {(a.attachments || []).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 8, marginTop: 14 }}>
            {a.attachments.map((f) => <FileChip key={f.path} f={f} onClick={() => openFile(f)} />)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 16px", borderTop: `1px solid ${BG}`, background: "#FBFBFA" }}>
        {needsAck && <button style={{ ...s.btnPrimary, width: "auto", padding: "9px 18px", display: "flex", alignItems: "center", gap: 6 }} onClick={onConfirm}><Icon name="check" size={15} color="#fff" /> Got it</button>}
        {mine && <span style={{ fontSize: 12, color: GD, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}><Icon name="check" size={13} color={GD} /> You confirmed {timeAgo(mine.read_at)}</span>}
        <button style={{ ...s.btnGhost, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowComments((v) => !v)}><Icon name="message" size={14} /> {commentCount ? `${commentCount} comment${commentCount > 1 ? "s" : ""}` : party ? "Send a note" : "Comment"}</button>
        {user.is_admin && !party && expected.length > 0 && (
          <button style={{ ...s.btnGhost, marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: notYet.length ? WARN : GD }} onClick={() => setShowReads((v) => !v)}>
            <Icon name="eye" size={14} color={notYet.length ? WARN : GD} /> Seen by {seen.length} of {expected.length}
          </button>
        )}
      </div>

      {showReads && (
        <div style={{ padding: "12px 20px 16px", borderTop: `1px solid ${BG}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 14 }}>
          <div>
            <div style={{ ...s.label, color: GD }}>Confirmed ({seen.length})</div>
            {seen.map((c) => { const r = reads.find((x) => x.employee_id === c.id); return <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}><Avatar name={c.name} src={c.photo_url} size={24} /><span style={{ flex: 1 }}>{c.name}</span><span style={{ fontSize: 11, color: FAINT }}>{fmtDateTime(r.read_at)}</span></div> })}
            {seen.length === 0 && <div style={{ fontSize: 13, color: FAINT }}>Nobody yet.</div>}
          </div>
          <div>
            <div style={{ ...s.label, color: WARN }}>Not yet ({notYet.length})</div>
            {notYet.map((c) => <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}><Avatar name={c.name} src={c.photo_url} size={24} />{c.name}</div>)}
            {notYet.length === 0 && <div style={{ fontSize: 13, color: GD, fontWeight: 600 }}>Everyone's seen it.</div>}
          </div>
        </div>
      )}

      {showComments && <Comments a={a} user={user} onChange={onComment} />}
    </div>
  )
}

function Comments({ a, user, onChange }) {
  const [list, setList] = useState([]); const [body, setBody] = useState(""); const [busy, setBusy] = useState(false)
  const load = async () => { const { data } = await supabase.from("announcement_comments").select("*").eq("announcement_id", a.id).order("created_at"); setList(data || []) }
  useEffect(() => { load() }, [a.id])
  const send = async () => {
    if (!body.trim()) return
    setBusy(true)
    await supabase.from("announcement_comments").insert({ announcement_id: a.id, author_id: user.id, author_name: user.name, body: body.trim() })
    setBody(""); setBusy(false); load(); onChange?.()
  }
  const del = async (c) => { await supabase.from("announcement_comments").delete().eq("id", c.id); load(); onChange?.() }
  return (
    <div style={{ padding: "12px 20px 16px", borderTop: `1px solid ${BG}`, background: PANEL }}>
      {list.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <Avatar name={c.author_name} size={28} />
          <div style={{ flex: 1, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "8px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}><strong style={{ color: INK }}>{c.author_name}</strong><span style={{ color: FAINT }}>{timeAgo(c.created_at)}</span></div>
            <div style={{ fontSize: 14, color: TEXT, whiteSpace: "pre-wrap", marginTop: 2 }}>{c.body}</div>
          </div>
          {(c.author_id === user.id || user.is_super) && <button title="Delete comment" style={{ ...s.btnGhost, padding: 4, alignSelf: "flex-start" }} onClick={() => del(c)}><Icon name="x" size={13} color={FAINT} /></button>}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <input style={s.input} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Write a comment…" />
        <button style={{ ...s.btnPrimary, width: "auto", padding: "0 18px" }} onClick={send} disabled={busy || !body.trim()}>Post</button>
      </div>
    </div>
  )
}

function Composer({ a, user, onClose, onSaved }) {
  const [f, setF] = useState({ title: a.title || "", body: a.body || "", pinned: !!a.pinned })
  const [kept, setKept] = useState(a.attachments || [])   // files already on the post
  const [files, setFiles] = useState([])                  // new files picked this time
  const [err, setErr] = useState(""); const [busy, setBusy] = useState("")
  const addFiles = (list) => {
    const picked = Array.from(list || []), big = picked.filter((x) => x.size > MAX_MB * 1048576)
    if (big.length) setErr(`${big.map((x) => x.name).join(", ")} ${big.length > 1 ? "are" : "is"} over ${MAX_MB} MB.`)
    setFiles((cur) => [...cur, ...picked.filter((x) => x.size <= MAX_MB * 1048576)])
  }
  const save = async () => {
    if (!f.title.trim()) return setErr("Give it a title.")
    setErr("")
    const uploaded = []
    for (const [i, file] of files.entries()) {
      setBusy(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…")
      const path = `announcements/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${file.name.replace(/[^\w.\-]+/g, "_")}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" })
      if (error) {
        if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.path))
        setBusy(""); return setErr(`Couldn't upload ${file.name}. Check your connection and try again.`)
      }
      uploaded.push({ path, name: file.name, size: file.size, type: file.type || "" })
    }
    setBusy("Saving…")
    const rec = { title: f.title.trim(), body: f.body.trim(), pinned: f.pinned, attachments: [...kept, ...uploaded], updated_at: new Date().toISOString() }
    const { error } = a.id
      ? await supabase.from("announcements").update(rec).eq("id", a.id)
      : await supabase.from("announcements").insert({ ...rec, author_id: user.id, author_name: user.name })
    setBusy("")
    if (error) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.path))
      return setErr("Couldn't save. Try again.")
    }
    const dropped = (a.attachments || []).filter((x) => !kept.some((k) => k.path === x.path)).map((x) => x.path)
    if (dropped.length) await supabase.storage.from(BUCKET).remove(dropped)
    if (!a.id) pushNotification("New announcement", rec.title)
    onSaved()
  }
  return (
    <Modal title={a.id ? "Edit announcement" : "New announcement"} onClose={onClose} width={620}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={s.field}><label style={s.label}>Title</label><input style={s.input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Safety meeting Monday 7:00 AM at the shop" /></div>
      <div style={s.field}><label style={s.label}>Details</label><textarea style={{ ...s.textarea, minHeight: 150 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="What the crew needs to know…" /></div>
      <div style={s.field}>
        <label style={s.label}>Attachments</label>
        <div style={{ display: "grid", gap: 8 }}>
          {kept.map((x) => <FileChip key={x.path} f={x} onRemove={() => setKept((k) => k.filter((y) => y.path !== x.path))} />)}
          {files.map((x, i) => <FileChip key={i + x.name} f={{ name: x.name, size: x.size }} onRemove={() => setFiles((cur) => cur.filter((_, j) => j !== i))} />)}
          <label style={{ ...s.btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
            <Icon name="upload" size={14} /> {kept.length + files.length ? "Add another file" : "Attach a file (handbook, PDF, image, doc…)"}
            <input type="file" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = "" }} />
          </label>
        </div>
        <div style={{ fontSize: 12, color: FAINT, marginTop: 6 }}>Up to {MAX_MB} MB each. Only signed-in Empire crew can open them.</div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 18 }}><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin to the top</label>
      {a.id && <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>Editing keeps existing confirmations. For a change the crew must re-confirm, post a new announcement.</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={s.btnSecondary} onClick={onClose}>Cancel</button>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={save} disabled={!!busy}>{busy || (a.id ? "Save" : "Post")}</button>
      </div>
    </Modal>
  )
}
