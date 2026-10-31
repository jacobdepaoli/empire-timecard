// ─── Messages: crew channels + private direct messages ──────────────────────
import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, PANEL, SURFACE, DANGER } from "../../theme.js"
import { Icon, Modal, Avatar } from "../../ui.jsx"
import { go } from "../../router.js"
import { uploadPhoto, signedUrls, timeAgo } from "../../photos.js"

const BUCKET = "message-photos"
const useWide = () => { const [w, setW] = useState(window.innerWidth); useEffect(() => { const r = () => setW(window.innerWidth); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r) }, []); return w >= 820 }
const convName = (c) => (c.kind === "channel" ? c.name : c.other_name || "Direct message")

export default function Messages({ user, route }) {
  const wide = useWide()
  const openId = route[1]
  const [convs, setConvs] = useState([]); const [picker, setPicker] = useState(false); const [newChannel, setNewChannel] = useState(false)
  const loadConvs = async () => { const { data } = await supabase.rpc("my_conversations"); setConvs(data || []) }
  useEffect(() => {
    loadConvs()
    const ch = supabase.channel("inbox-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, loadConvs)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, loadConvs)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])
  // On wide screens, show the first channel until something is picked.
  const current = convs.find((c) => c.id === openId) || (wide && !openId ? convs[0] : null)
  const height = "calc(100dvh - 60px - 22px - 48px - env(safe-area-inset-top))"

  const List = (
    <div style={{ ...s.card, padding: 0, marginBottom: 0, display: "flex", flexDirection: "column", height: wide ? height : "auto", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${BG}` }}>
        <div style={{ fontWeight: 800, color: INK, fontSize: 17 }}>Messages</div>
        <div style={{ display: "flex", gap: 6 }}>
          {user.is_admin && <button title="New channel" style={{ ...s.btnGhost, padding: 7 }} onClick={() => setNewChannel(true)}><span style={{ fontWeight: 800, fontSize: 15 }}>#</span></button>}
          <button style={{ ...s.btnPrimary, width: "auto", padding: "7px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 5 }} onClick={() => setPicker(true)}><Icon name="plus" size={14} color="#fff" /> New</button>
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {[["channel", "Channels"], ["dm", "Direct messages"]].map(([k, l]) => {
          const list = convs.filter((c) => c.kind === k)
          if (!list.length && k === "channel") return null
          return (
            <div key={k}>
              <div style={{ ...s.label, padding: "12px 16px 4px", marginBottom: 0 }}>{l}</div>
              {!list.length && <div style={{ padding: "4px 16px 12px", fontSize: 13, color: FAINT }}>Tap <strong>New</strong> to message someone.</div>}
              {list.map((c) => (
                <div key={c.id} onClick={() => go(`messages/${c.id}`)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer", background: c.id === current?.id ? GSOFT : "transparent" }}>
                  {c.kind === "channel"
                    ? <div style={{ width: 38, height: 38, borderRadius: 10, background: INK, color: "#6CC36C", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>#</div>
                    : <Avatar name={c.other_name} src={c.other_photo} size={38} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: c.unread ? 800 : 700, color: INK, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{convName(c)}</span>
                      {c.last_body !== null && <span style={{ fontSize: 11, color: FAINT, flexShrink: 0 }}>{timeAgo(c.last_message_at)}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: c.unread ? TEXT : MUTED, fontWeight: c.unread ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.last_author ? `${c.last_author.split(" ")[0]}: ${c.last_body || "📷 Photo"}` : c.topic || "No messages yet"}
                    </div>
                  </div>
                  {c.unread > 0 && <span style={{ background: G, color: "#fff", fontSize: 11, fontWeight: 800, minWidth: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{c.unread}</span>}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )

  const Thread = current
    ? <Conversation key={current.id} conv={current} user={user} height={height} wide={wide} onRead={loadConvs} />
    : openId ? <div style={{ ...s.card, color: MUTED, textAlign: "center", padding: 40 }}>Loading…</div>
    : <div style={{ ...s.card, color: MUTED, textAlign: "center", padding: 40, height }}>Pick a conversation.</div>

  return (
    <div>
      {wide
        ? <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>{List}{Thread}</div>
        : openId ? Thread : List}
      {picker && <PeoplePicker user={user} onClose={() => setPicker(false)} onPick={async (p) => { setPicker(false); const { data } = await supabase.rpc("start_dm", { p_other: p.id }); await loadConvs(); if (data) go(`messages/${data}`) }} />}
      {newChannel && <ChannelModal onClose={() => setNewChannel(false)} onSaved={async (id) => { setNewChannel(false); await loadConvs(); go(`messages/${id}`) }} user={user} />}
    </div>
  )
}

function Conversation({ conv, user, height, wide, onRead }) {
  const [msgs, setMsgs] = useState([]); const [urls, setUrls] = useState({})
  const [body, setBody] = useState(""); const [files, setFiles] = useState([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState("")
  const [viewer, setViewer] = useState(null)
  const bottom = useRef(null); const box = useRef(null)
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const load = async () => {
    const { data } = await supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(200)
    const list = (data || []).reverse()
    setMsgs(list)
    const paths = list.flatMap((m) => (m.photos || []).map((p) => p.path))
    if (paths.length) setUrls(await signedUrls(BUCKET, paths))
    await supabase.rpc("mark_read", { p_conv: conv.id }); onRead?.()
  }
  useEffect(() => {
    load()
    const ch = supabase.channel(`conv-${conv.id}`).on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [conv.id])
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }) }, [msgs.length])

  const send = async () => {
    if (!body.trim() && !files.length) return
    setBusy(true); setErr("")
    try {
      const photos = []
      for (const f of files) photos.push(await uploadPhoto(BUCKET, conv.id, f))
      const { error } = await supabase.from("messages").insert({ conversation_id: conv.id, author_id: user.id, author_name: user.name, body: body.trim(), photos })
      if (error) throw error
      setBody(""); setFiles([])
    } catch (_) { setErr("Didn't send. Check your signal and try again.") }
    setBusy(false)
  }
  const del = async (m) => { if (!window.confirm("Delete this message?")) return; await supabase.from("messages").delete().eq("id", m.id); load() }

  // Group: day dividers + consecutive messages from the same person within 5 min
  const rows = []
  msgs.forEach((m, i) => {
    const prev = msgs[i - 1], day = new Date(m.created_at).toDateString()
    if (!prev || new Date(prev.created_at).toDateString() !== day) rows.push({ divider: new Date(m.created_at).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }), key: "d" + m.id })
    const grouped = prev && prev.author_id === m.author_id && new Date(m.created_at) - new Date(prev.created_at) < 300000 && new Date(prev.created_at).toDateString() === day
    rows.push({ m, grouped })
  })

  return (
    <div style={{ ...s.card, padding: 0, marginBottom: 0, display: "flex", flexDirection: "column", height, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${BG}` }}>
        {!wide && <button style={{ ...s.btnGhost, padding: 6 }} onClick={() => go("messages")}><Icon name="back" size={18} /></button>}
        {conv.kind === "channel" ? <div style={{ width: 34, height: 34, borderRadius: 9, background: INK, color: "#6CC36C", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>#</div> : <Avatar name={conv.other_name} src={conv.other_photo} size={34} />}
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, color: INK }}>{convName(conv)}</div><div style={{ fontSize: 12, color: MUTED }}>{conv.kind === "channel" ? conv.topic || "Everyone can see this channel" : "Private: only the two of you"}</div></div>
      </div>

      <div ref={box} style={{ flex: 1, overflowY: "auto", padding: "12px 14px", background: "#FAFAF8" }}>
        {msgs.length === 0 && <div style={{ textAlign: "center", color: FAINT, fontSize: 13, marginTop: 30 }}>No messages yet. Say hey 👋</div>}
        {rows.map((r) => r.divider
          ? <div key={r.key} style={{ textAlign: "center", margin: "14px 0 8px" }}><span style={{ fontSize: 11, fontWeight: 700, color: FAINT, background: "#FAFAF8", padding: "0 8px", letterSpacing: ".5px", textTransform: "uppercase" }}>{r.divider}</span></div>
          : <Bubble key={r.m.id} m={r.m} grouped={r.grouped} mine={r.m.author_id === user.id} canDelete={r.m.author_id === user.id || user.is_admin} urls={urls} onDelete={() => del(r.m)} onPhoto={(i) => setViewer({ m: r.m, i })} />)}
        <div ref={bottom} />
      </div>

      <div style={{ borderTop: `1px solid ${BG}`, padding: 10 }}>
        {err && <div style={{ ...s.alert("error"), marginBottom: 8 }}>{err}</div>}
        {files.length > 0 && <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>{files.map((f, i) => <div key={i} style={{ position: "relative" }}><img src={previews[i]} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} /><button onClick={() => setFiles((x) => x.filter((_, k) => k !== i))} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: "none", background: INK, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={11} color="#fff" /></button></div>)}</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label title="Add photo" style={{ ...s.btnSecondary, padding: "10px 11px", cursor: "pointer", display: "flex" }}><Icon name="camera" size={17} /><input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { setFiles((x) => [...x, ...Array.from(e.target.files)].slice(0, 6)); e.target.value = "" }} /></label>
          <textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && wide) { e.preventDefault(); send() } }}
            placeholder={conv.kind === "channel" ? `Message #${conv.name}` : `Message ${conv.other_name?.split(" ")[0] || ""}`}
            style={{ ...s.textarea, minHeight: 42, maxHeight: 120, resize: "none", padding: "10px 12px" }} />
          <button style={{ ...s.btnPrimary, width: "auto", padding: "0 16px", height: 42 }} onClick={send} disabled={busy || (!body.trim() && !files.length)}>{busy ? "…" : "Send"}</button>
        </div>
      </div>
      {viewer && <Viewer m={viewer.m} i={viewer.i} urls={urls} onClose={() => setViewer(null)} />}
    </div>
  )
}

function Bubble({ m, grouped, mine, canDelete, urls, onDelete, onPhoto }) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: "flex", gap: 8, flexDirection: mine ? "row-reverse" : "row", marginTop: grouped ? 2 : 10, alignItems: "flex-end" }}>
      {!mine && <div style={{ width: 30, flexShrink: 0 }}>{!grouped && <Avatar name={m.author_name} size={30} />}</div>}
      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
        {!grouped && <div style={{ fontSize: 11.5, color: FAINT, margin: mine ? "0 4px 3px 0" : "0 0 3px 4px" }}>{mine ? "" : <strong style={{ color: MUTED }}>{m.author_name} </strong>}{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>}
        {(m.photos || []).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: m.photos.length > 1 ? "1fr 1fr" : "1fr", gap: 3, marginBottom: m.body ? 3 : 0, maxWidth: 280 }}>
            {m.photos.map((p, i) => <img key={p.path} src={urls[p.path]} alt="" onClick={() => onPhoto(i)} style={{ width: "100%", aspectRatio: m.photos.length > 1 ? "1 / 1" : `${p.w || 4} / ${p.h || 3}`, objectFit: "cover", borderRadius: 12, cursor: "zoom-in", background: PANEL }} />)}
          </div>
        )}
        {m.body && <div style={{ background: mine ? G : SURFACE, color: mine ? "#fff" : TEXT, border: mine ? "none" : `1px solid ${BORDER}`, borderRadius: 16, borderBottomRightRadius: mine ? 5 : 16, borderBottomLeftRadius: mine ? 16 : 5, padding: "8px 12px", fontSize: 14.5, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>}
      </div>
      {canDelete && hover && <button title="Delete" style={{ ...s.btnGhost, padding: 4 }} onClick={onDelete}><Icon name="trash" size={12} color={FAINT} /></button>}
    </div>
  )
}

function Viewer({ m, i, urls, onClose }) {
  const url = urls[m.photos[i]?.path]
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,8,.94)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {url && <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />}
      <button style={{ ...s.btnGhost, position: "absolute", top: "calc(12px + env(safe-area-inset-top))", right: 12 }} onClick={onClose}><Icon name="x" size={22} color="#fff" /></button>
    </div>
  )
}

function PeoplePicker({ user, onClose, onPick }) {
  const [people, setPeople] = useState([]); const [q, setQ] = useState("")
  useEffect(() => { supabase.rpc("crew_directory").then(({ data }) => setPeople((data || []).filter((p) => p.id !== user.id))) }, [])
  const list = people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Modal title="New message" onClose={onClose} width={420}>
      <input autoFocus style={{ ...s.input, marginBottom: 10 }} placeholder="Search the crew…" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((p) => (
        <div key={p.id} onClick={() => onPick(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 6px", cursor: "pointer", borderBottom: `1px solid ${BG}` }}>
          <Avatar name={p.name} src={p.photo_url} size={36} /><div><div style={{ fontWeight: 700, color: INK }}>{p.name}</div><div style={{ fontSize: 12, color: MUTED }}>{p.role}</div></div>
        </div>
      ))}
      {!list.length && <div style={{ color: FAINT, fontSize: 13, padding: 10 }}>Nobody matches.</div>}
    </Modal>
  )
}

function ChannelModal({ user, onClose, onSaved }) {
  const [name, setName] = useState(""); const [topic, setTopic] = useState(""); const [err, setErr] = useState("")
  const save = async () => {
    const n = name.trim().replace(/^#/, "")
    if (!n) return setErr("Name the channel.")
    const { data, error } = await supabase.from("conversations").insert({ kind: "channel", name: n, topic: topic.trim(), created_by: user.id }).select("id").single()
    if (error) return setErr("Couldn't create it. Try again.")
    onSaved(data.id)
  }
  return (
    <Modal title="New channel" onClose={onClose} width={440}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>Channels are visible to the whole crew. Good for a big job, the office, or tool talk.</div>
      <div style={s.field}><label style={s.label}>Name</label><input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greg St TI" /></div>
      <div style={s.field}><label style={s.label}>What it's for (optional)</label><input style={s.input} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Questions and updates for the Greg St job" /></div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button style={s.btnSecondary} onClick={onClose}>Cancel</button><button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={save}>Create</button></div>
    </Modal>
  )
}
