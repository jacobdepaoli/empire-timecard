// ─── Crew: directory of profiles + "My profile" editor ──────────────────────
import { useEffect, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, PANEL, SIDE, GLIGHT } from "../../theme.js"
import { Icon, Modal, Avatar } from "../../ui.jsx"
import { go } from "../../router.js"
import { compressImage } from "../../photos.js"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const fmtMD = (md) => { if (!md) return ""; const [m, d] = md.split("-").map(Number); return `${MONTHS[m - 1]} ${d}` }
const yearsSince = (iso) => { if (!iso) return null; const a = new Date(iso + "T00:00:00"), n = new Date(); let y = n.getFullYear() - a.getFullYear(); if (n < new Date(n.getFullYear(), a.getMonth(), a.getDate())) y--; return y }
export const tenure = (iso) => { const y = yearsSince(iso); if (y === null) return ""; return y < 1 ? "New this year" : `${y} year${y === 1 ? "" : "s"} with the crew` }

// Days until the next occurrence of MM-DD (0 = today).
export function daysUntil(md) {
  if (!md) return null
  const [m, d] = md.split("-").map(Number), t = new Date(); t.setHours(0, 0, 0, 0)
  let next = new Date(t.getFullYear(), m - 1, d)
  if (m === 2 && d === 29 && next.getMonth() !== 1) next = new Date(t.getFullYear(), 1, 28)
  if (next < t) next = new Date(t.getFullYear() + 1, m - 1, d)
  return Math.round((next - t) / 86400000)
}

// Upcoming birthdays + work anniversaries within `days`.
export function upcomingCelebrations(crew, days = 14) {
  const out = []
  crew.forEach((c) => {
    const first = c.nickname || c.name.split(" ")[0]
    const b = daysUntil(c.birthday_md)
    if (b !== null && b <= days) out.push({ id: c.id + "b", who: c, first, kind: "birthday", inDays: b, label: fmtMD(c.birthday_md) })
    if (c.hire_date) {
      const md = c.hire_date.slice(5), a = daysUntil(md), y = (yearsSince(c.hire_date) ?? 0) + (a === 0 ? 0 : 1)
      if (a !== null && a <= days && y >= 1) out.push({ id: c.id + "a", who: c, first, kind: "anniversary", inDays: a, years: y, label: fmtMD(md) })
    }
  })
  return out.sort((x, y) => x.inDays - y.inDays)
}

export default function Crew({ user }) {
  const [crew, setCrew] = useState([]); const [q, setQ] = useState(""); const [view, setView] = useState(null)
  useEffect(() => { supabase.rpc("crew_profiles").then(({ data }) => setCrew(data || [])) }, [])
  const shown = crew.filter((c) => [c.name, c.nickname, c.role, c.hometown].some((v) => (v || "").toLowerCase().includes(q.toLowerCase())))
  const me = crew.find((c) => c.id === user.id)
  const incomplete = me && !me.photo_url && !me.bio

  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>The Crew</div><div style={s.pageSub}>Get to know the team.</div></div>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => go("profile")}><Icon name="edit" size={15} color="#fff" /> Edit my profile</button>
      </div>
      {incomplete && (
        <div className="lift" onClick={() => go("profile")} style={{ ...s.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, background: GSOFT, borderColor: "#cde6cd" }}>
          <Icon name="camera" size={22} color={GD} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800, color: INK }}>Add your photo and a little about you</div><div style={{ fontSize: 13, color: MUTED }}>Takes a minute. Your birthday gets a shout-out on the day.</div></div>
          <Icon name="chevron" size={18} color={GD} />
        </div>
      )}
      <input style={{ ...s.input, maxWidth: 320, marginBottom: 18 }} placeholder="Search the crew…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: 14 }}>
        {shown.map((c) => (
          <div key={c.id} className="lift" onClick={() => setView(c)} style={{ ...s.card, marginBottom: 0, cursor: "pointer", textAlign: "center", padding: "22px 18px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Avatar name={c.name} src={c.photo_url} size={84} /></div>
            <div style={{ fontWeight: 800, fontSize: 17, color: INK }}>{c.name}</div>
            {c.nickname && <div style={{ fontSize: 13, color: GD, fontWeight: 700 }}>&ldquo;{c.nickname}&rdquo;</div>}
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.35 }}>{c.role}</div>
            {c.hire_date && <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>{tenure(c.hire_date)}</div>}
          </div>
        ))}
      </div>
      {view && <ProfileCard c={view} onClose={() => setView(null)} isMe={view.id === user.id} />}
    </div>
  )
}

function ProfileCard({ c, onClose, isMe }) {
  const rows = [["pin", "Hometown", c.hometown], ["briefcase", "Favorite tool", c.favorite_tool], ["user", "Fun fact", c.fun_fact],
    ["calendar", "Birthday", c.birthday_md && fmtMD(c.birthday_md)], ["clock", "With the crew", c.hire_date && tenure(c.hire_date)]].filter((r) => r[2])
  return (
    <Modal title="" onClose={onClose} width={460}>
      <div style={{ textAlign: "center", marginTop: -18 }}>
        <div style={{ display: "flex", justifyContent: "center" }}><Avatar name={c.name} src={c.photo_url} size={112} /></div>
        <div style={{ fontWeight: 800, fontSize: 22, color: INK, marginTop: 12 }}>{c.name}</div>
        {c.nickname && <div style={{ fontSize: 14, color: GD, fontWeight: 700 }}>&ldquo;{c.nickname}&rdquo;</div>}
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{c.role}</div>
      </div>
      {c.bio && <div style={{ fontSize: 15, lineHeight: 1.6, color: TEXT, margin: "18px 0 6px", whiteSpace: "pre-wrap", textAlign: "center" }}>{c.bio}</div>}
      {rows.length > 0 && (
        <div style={{ background: PANEL, borderRadius: 12, padding: "6px 14px", marginTop: 14 }}>
          {rows.map(([ic, l, v]) => <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 14 }}><Icon name={ic} size={15} color={GD} /><span style={{ color: MUTED, width: 110 }}>{l}</span><span style={{ color: INK, fontWeight: 600, flex: 1 }}>{v}</span></div>)}
        </div>
      )}
      {c.phone && <a href={`tel:${c.phone}`} style={{ ...s.btnSecondary, display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 14, textDecoration: "none" }}>Call {c.name.split(" ")[0]} · {c.phone}</a>}
      {!c.bio && rows.length === 0 && <div style={{ textAlign: "center", color: FAINT, fontSize: 13, marginTop: 16 }}>{isMe ? "Your profile is empty. Add a bio and a few fun facts." : "Nothing here yet."}</div>}
      {isMe && <button style={{ ...s.btnPrimary, marginTop: 16 }} onClick={() => go("profile")}>Edit my profile</button>}
    </Modal>
  )
}

// ─── My profile (every user) ────────────────────────────────────────────────
export function MyProfile({ user, setUser }) {
  const [f, setF] = useState({ ...user, birthday: user.birthday || "" })
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("")
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const uploadPhoto = async (file) => {
    if (!file) return
    setUploading(true); setMsg(null)
    try {
      const { blob } = await compressImage(file, 800, 0.85)
      const path = `${user.id}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from("employee-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true })
      if (error) throw error
      const url = supabase.storage.from("employee-photos").getPublicUrl(path).data.publicUrl
      const { error: e2 } = await supabase.from("employees").update({ photo_url: url }).eq("id", user.id)
      if (e2) throw e2
      set("photo_url", url); setUser({ ...user, photo_url: url })
      setMsg({ type: "success", text: "Photo updated." })
    } catch (_) { setMsg({ type: "error", text: "Couldn't upload that photo. Try another one." }) }
    setUploading(false)
  }

  const save = async () => {
    setMsg(null)
    if (!f.name?.trim()) return setMsg({ type: "error", text: "Your name can't be blank." })
    if (pw && pw.length < 8) return setMsg({ type: "error", text: "Password must be at least 8 characters." })
    if (pw && pw !== pw2) return setMsg({ type: "error", text: "Passwords don't match." })
    setBusy(true)
    if (pw) { const { error } = await supabase.auth.updateUser({ password: pw }); if (error) { setBusy(false); return setMsg({ type: "error", text: "Couldn't change your password. Try a different one." }) } }
    const up = { name: f.name.trim(), nickname: (f.nickname || "").trim(), phone: f.phone || "", share_phone: !!f.share_phone, birthday: f.birthday || null, show_birthday: f.show_birthday !== false,
      hometown: f.hometown || "", favorite_tool: f.favorite_tool || "", fun_fact: f.fun_fact || "", bio: f.bio || "" }
    const { error } = await supabase.from("employees").update(up).eq("id", user.id)
    setBusy(false)
    if (error) return setMsg({ type: "error", text: "Couldn't save. Try again." })
    setUser({ ...user, ...up }); setPw(""); setPw2("")
    setMsg({ type: "success", text: pw ? "Profile and password saved." : "Profile saved." })
  }

  const field = (k, label, ph, type = "text") => (
    <div style={s.field}><label style={s.label}>{label}</label><input type={type} style={s.input} value={f[k] || ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></div>
  )
  return (
    <div style={{ maxWidth: 620 }}>
      {msg && <div style={s.alert(msg.type)}>{msg.text}</div>}
      <div style={{ ...s.card, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", background: SIDE, borderColor: SIDE }}>
        <Avatar name={f.name} src={f.photo_url} size={92} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#fff" }}>{f.name}</div>
          <div style={{ fontSize: 13, color: "#b8bab3", marginTop: 2 }}>{user.is_owner ? "Owner" : user.role} · {user.email}</div>
          <label style={{ ...s.btnSecondary, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 10, background: "rgba(255,255,255,.08)", color: "#fff", borderColor: "rgba(255,255,255,.15)" }}>
            <Icon name="camera" size={14} color={GLIGHT} /> {uploading ? "Uploading…" : f.photo_url ? "Change photo" : "Add a photo"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { uploadPhoto(e.target.files?.[0]); e.target.value = "" }} />
          </label>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ fontWeight: 800, color: INK, marginBottom: 14 }}>About you</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: "0 14px" }}>
          {field("name", "Full name")}
          {field("nickname", "Nickname (optional)", "What the crew calls you")}
          {field("hometown", "Hometown", "e.g. Fernley, NV")}
          {field("favorite_tool", "Favorite tool", "e.g. Knipex lineman's")}
        </div>
        {field("fun_fact", "Fun fact", "Something the crew wouldn't guess")}
        <div style={s.field}><label style={s.label}>Bio</label><textarea style={s.textarea} value={f.bio || ""} onChange={(e) => set("bio", e.target.value)} placeholder="Where you've worked, what you like doing, family, hobbies…" /></div>
      </div>

      <div style={s.card}>
        <div style={{ fontWeight: 800, color: INK, marginBottom: 14 }}>Birthday & contact</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: "0 14px" }}>
          <div style={s.field}><label style={s.label}>Birthday</label><input type="date" style={s.input} value={f.birthday || ""} onChange={(e) => set("birthday", e.target.value)} /></div>
          {field("phone", "Phone", "(775) 555-0000", "tel")}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 8 }}><input type="checkbox" checked={f.show_birthday !== false} onChange={(e) => set("show_birthday", e.target.checked)} /> Celebrate my birthday (crew sees month and day only, never the year)</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}><input type="checkbox" checked={!!f.share_phone} onChange={(e) => set("share_phone", e.target.checked)} /> Show my phone number in the crew directory</label>
      </div>

      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><Icon name="lock" size={16} color={GD} /><span style={{ fontWeight: 800, color: INK }}>Change password</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: "0 14px" }}>
          <div style={s.field}><label style={s.label}>New password</label><input style={s.input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Leave blank to keep" autoComplete="new-password" /></div>
          <div style={s.field}><label style={s.label}>Confirm</label><input style={s.input} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter" autoComplete="new-password" /></div>
        </div>
      </div>
      <button style={{ ...s.btnPrimary, width: "auto", padding: "12px 32px" }} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
    </div>
  )
}
