// ─── Jobs: job list + a page per job with a progress feed ────────────────────
// Anyone can post notes and photos; everyone can like and comment.
import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, PANEL, WARN, DANGER } from "../../theme.js"
import { Icon, Avatar } from "../../ui.jsx"
import { Jobs } from "../timecard/TimeCard.jsx"
import { go } from "../../router.js"
import { uploadPhoto, signedUrls, timeAgo, isLink } from "../../photos.js"

const BUCKET = "job-photos"
const MAX_PHOTOS = 10

export default function JobsTool({ user, route }) {
  const jobId = route[1]
  if (jobId) return <JobPage user={user} jobId={jobId} />
  return <Jobs user={user} onOpenJob={(j) => go(`jobs/${j.id}`)} />
}

function JobPage({ user, jobId }) {
  const [job, setJob] = useState(null); const [missing, setMissing] = useState(false)
  const [posts, setPosts] = useState([]); const [likes, setLikes] = useState([]); const [comments, setComments] = useState([])
  const [urls, setUrls] = useState({}); const [viewer, setViewer] = useState(null)

  const load = async () => {
    const { data: ups } = await supabase.from("job_updates").select("*").eq("job_id", jobId).order("created_at", { ascending: false }).limit(100)
    const ids = (ups || []).map((u) => u.id)
    const [{ data: lk }, { data: cm }] = ids.length
      ? await Promise.all([
          supabase.from("job_update_likes").select("update_id,employee_id").in("update_id", ids),
          supabase.from("job_update_comments").select("*").in("update_id", ids).order("created_at"),
        ])
      : [{ data: [] }, { data: [] }]
    setPosts(ups || []); setLikes(lk || []); setComments(cm || [])
    const paths = (ups || []).flatMap((u) => (u.photos || []).map((p) => p.path))
    if (paths.length) setUrls(await signedUrls(BUCKET, paths))
  }

  useEffect(() => {
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle().then(({ data }) => (data ? setJob(data) : setMissing(true)))
    load()
    const ch = supabase.channel(`job-${jobId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_updates", filter: `job_id=eq.${jobId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_update_comments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_update_likes" }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [jobId])

  if (missing) return <div style={{ ...s.card, textAlign: "center", padding: 40, color: MUTED }}>That job doesn't exist anymore. <button style={s.btnGhost} onClick={() => go("jobs")}>Back to jobs</button></div>
  if (!job) return <div style={{ color: MUTED, padding: 20 }}>Loading…</div>

  const sc = { Active: G, Paused: WARN, Closed: MUTED }
  const photoCount = posts.reduce((n, p) => n + (p.photos || []).length, 0)

  return (
    <div>
      <button style={{ ...s.btnGhost, paddingLeft: 0, display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }} onClick={() => go("jobs")}><Icon name="back" size={15} /> All jobs</button>
      <div style={{ ...s.card, borderLeft: `4px solid ${job.color || G}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ ...s.pageTitle, fontSize: "clamp(22px,4vw,28px)" }}>{job.name}</div>
          <span style={s.badge(sc[job.status] || MUTED)}>{job.status}</span>
          {job.is_service && <span style={s.badge(WARN)}>Service</span>}
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: MUTED, marginTop: 8 }}>
          {job.client && <span>Client: <strong style={{ color: TEXT }}>{job.client}</strong></span>}
          {job.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer" style={{ color: GD, display: "flex", alignItems: "center", gap: 4, textDecoration: "none", fontWeight: 600 }}><Icon name="pin" size={13} color={GD} />{job.address}</a>}
          <span>{posts.length} update{posts.length === 1 ? "" : "s"} · {photoCount} photo{photoCount === 1 ? "" : "s"}</span>
        </div>
        {job.notes && <div style={{ fontSize: 14, color: TEXT, marginTop: 12, background: PANEL, padding: "10px 14px", borderRadius: 10, whiteSpace: "pre-wrap" }}><strong style={{ fontSize: 11, letterSpacing: "1px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: 4 }}>Site instructions</strong>{job.notes}</div>}
      </div>

      <div style={{ maxWidth: 680 }}>
        <Composer user={user} jobId={jobId} onPosted={load} />
        {posts.length === 0 && <div style={{ ...s.card, textAlign: "center", color: MUTED, padding: 36 }}><Icon name="camera" size={28} color={BORDER} /><div style={{ marginTop: 10 }}>No updates yet. Post the first progress photo.</div></div>}
        {posts.map((p) => (
          <Post key={p.id} p={p} user={user} urls={urls} onOpenPhoto={(i) => setViewer({ post: p, i })}
            likes={likes.filter((l) => l.update_id === p.id)} comments={comments.filter((c) => c.update_id === p.id)} onChange={load} />
        ))}
      </div>
      {viewer && <PhotoViewer post={viewer.post} start={viewer.i} urls={urls} onClose={() => setViewer(null)} />}
    </div>
  )
}

function Composer({ user, jobId, onPosted }) {
  const [body, setBody] = useState(""); const [files, setFiles] = useState([]); const [busy, setBusy] = useState(""); const [err, setErr] = useState("")
  const add = (list) => {
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"))
    setFiles((cur) => [...cur, ...imgs].slice(0, MAX_PHOTOS))
  }
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])
  const post = async () => {
    if (!body.trim() && !files.length) return
    setErr("")
    try {
      const photos = []
      for (let i = 0; i < files.length; i++) { setBusy(`Uploading photo ${i + 1} of ${files.length}…`); photos.push(await uploadPhoto(BUCKET, jobId, files[i])) }
      setBusy("Posting…")
      const { error } = await supabase.from("job_updates").insert({ job_id: jobId, author_id: user.id, author_name: user.name, body: body.trim(), photos })
      if (error) throw error
      setBody(""); setFiles([]); onPosted()
    } catch (e) { setErr("Couldn't post that update. Check your signal and try again.") }
    setBusy("")
  }
  return (
    <div style={{ ...s.card, padding: 16 }}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <Avatar name={user.name} src={user.photo_url} size={36} />
        <textarea style={{ ...s.textarea, minHeight: 70 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Post a progress update: what got done, what's next, any issues…" />
      </div>
      {files.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 0 46px" }}>
          {files.map((f, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={previews[i]} alt="" style={{ width: 68, height: 68, objectFit: "cover", borderRadius: 10, border: `1px solid ${BORDER}` }} />
              <button onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: "none", background: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}><Icon name="x" size={12} color="#fff" /></button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, marginLeft: 46, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ ...s.btnSecondary, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}><Icon name="camera" size={15} /> Camera<input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { add(e.target.files); e.target.value = "" }} /></label>
          <label style={{ ...s.btnSecondary, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}><Icon name="upload" size={15} /> Photos<input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { add(e.target.files); e.target.value = "" }} /></label>
        </div>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={post} disabled={!!busy || (!body.trim() && !files.length)}>{busy || "Post update"}</button>
      </div>
    </div>
  )
}

function Post({ p, user, urls, likes, comments, onOpenPhoto, onChange }) {
  const [showComments, setShowComments] = useState(comments.length > 0 && comments.length <= 2)
  const liked = likes.some((l) => l.employee_id === user.id)
  const canDelete = p.author_id === user.id || user.is_super
  const toggleLike = async () => {
    if (liked) await supabase.from("job_update_likes").delete().eq("update_id", p.id).eq("employee_id", user.id)
    else await supabase.from("job_update_likes").insert({ update_id: p.id, employee_id: user.id })
    onChange()
  }
  const remove = async () => {
    if (!window.confirm("Delete this update and its photos?")) return
    const paths = (p.photos || []).map((x) => x.path).filter((x) => !isLink(x))
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    await supabase.from("job_updates").delete().eq("id", p.id); onChange()
  }
  const photos = p.photos || []
  return (
    <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 10px" }}>
        <Avatar name={p.author_name} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, color: INK, fontSize: 14 }}>{p.author_name}</div><div style={{ fontSize: 12, color: FAINT }}>{timeAgo(p.created_at)}</div></div>
        {canDelete && <button title="Delete update" style={{ ...s.btnGhost, padding: 6 }} onClick={remove}><Icon name="trash" size={14} color={FAINT} /></button>}
      </div>
      {p.body && <div style={{ padding: "0 16px 12px", fontSize: 15, lineHeight: 1.55, color: TEXT, whiteSpace: "pre-wrap" }}>{p.body}</div>}
      {photos.length > 0 && (
        <div style={{ display: "grid", gap: 3, gridTemplateColumns: photos.length === 1 ? "1fr" : "1fr 1fr" }}>
          {photos.slice(0, 4).map((ph, i) => (
            <div key={ph.path} onClick={() => onOpenPhoto(i)} style={{ position: "relative", cursor: "zoom-in", background: PANEL, aspectRatio: photos.length === 1 ? `${ph.w || 4} / ${ph.h || 3}` : "1 / 1", maxHeight: photos.length === 1 ? 520 : undefined }}>
              {urls[ph.path] && <img src={urls[ph.path]} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
              {i === 3 && photos.length > 4 && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", color: "#fff", fontWeight: 800, fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>+{photos.length - 4}</div>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", borderTop: `1px solid ${BG}` }}>
        <button onClick={toggleLike} style={{ ...s.btnGhost, display: "flex", alignItems: "center", gap: 6, color: liked ? GD : MUTED, fontWeight: liked ? 800 : 600 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? G : "none"} stroke={liked ? G : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
          {liked ? "Liked" : "Like"}{likes.length > 0 ? ` · ${likes.length}` : ""}
        </button>
        <button onClick={() => setShowComments((v) => !v)} style={{ ...s.btnGhost, display: "flex", alignItems: "center", gap: 6 }}><Icon name="message" size={15} /> Comment{comments.length > 0 ? ` · ${comments.length}` : ""}</button>
      </div>
      {showComments && <CommentThread updateId={p.id} comments={comments} user={user} onChange={onChange} />}
    </div>
  )
}

function CommentThread({ updateId, comments, user, onChange }) {
  const [body, setBody] = useState(""); const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!body.trim()) return
    setBusy(true)
    await supabase.from("job_update_comments").insert({ update_id: updateId, author_id: user.id, author_name: user.name, body: body.trim() })
    setBody(""); setBusy(false); onChange()
  }
  const del = async (c) => { await supabase.from("job_update_comments").delete().eq("id", c.id); onChange() }
  return (
    <div style={{ padding: "10px 16px 14px", background: PANEL, borderTop: `1px solid ${BG}` }}>
      {comments.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Avatar name={c.author_name} size={26} />
          <div style={{ flex: 1, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "7px 11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, gap: 8 }}><strong style={{ color: INK }}>{c.author_name}</strong><span style={{ color: FAINT }}>{timeAgo(c.created_at)}</span></div>
            <div style={{ fontSize: 14, color: TEXT, whiteSpace: "pre-wrap" }}>{c.body}</div>
          </div>
          {(c.author_id === user.id || user.is_super) && <button title="Delete comment" style={{ ...s.btnGhost, padding: 4, alignSelf: "flex-start" }} onClick={() => del(c)}><Icon name="x" size={12} color={FAINT} /></button>}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <input style={s.input} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Write a comment…" />
        <button style={{ ...s.btnPrimary, width: "auto", padding: "0 16px" }} onClick={send} disabled={busy || !body.trim()}>Post</button>
      </div>
    </div>
  )
}

function PhotoViewer({ post, start, urls, onClose }) {
  const [i, setI] = useState(start); const photos = post.photos || []
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") setI((x) => Math.min(photos.length - 1, x + 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)) }
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k)
  }, [])
  const url = urls[photos[i]?.path]
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,8,.94)", zIndex: 2000, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "calc(12px + env(safe-area-inset-top)) 16px 12px", color: "#fff" }} onClick={(e) => e.stopPropagation()}>
        <span style={{ fontSize: 13, opacity: .8 }}>{post.author_name} · {i + 1} of {photos.length}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {url && <a href={url} target="_blank" rel="noreferrer" style={{ ...s.btnGhost, color: "#fff", display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}><Icon name="download" size={15} color="#fff" /> Full size</a>}
          <button style={{ ...s.btnGhost, color: "#fff" }} onClick={onClose}><Icon name="x" size={20} color="#fff" /></button>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0 }}>
        {url && <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />}
        {i > 0 && <button onClick={(e) => { e.stopPropagation(); setI(i - 1) }} style={{ position: "absolute", left: 10, background: "rgba(255,255,255,.12)", border: "none", borderRadius: 24, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="back" size={22} color="#fff" /></button>}
        {i < photos.length - 1 && <button onClick={(e) => { e.stopPropagation(); setI(i + 1) }} style={{ position: "absolute", right: 10, background: "rgba(255,255,255,.12)", border: "none", borderRadius: 24, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="chevron" size={22} color="#fff" /></button>}
      </div>
      {post.body && <div style={{ color: "#e8e8e4", fontSize: 14, padding: "12px 18px calc(16px + env(safe-area-inset-bottom))", maxHeight: "22vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>{post.body}</div>}
    </div>
  )
}
