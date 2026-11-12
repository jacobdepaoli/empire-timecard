// ─── Users & logins (super admin only) ───────────────────────────────────────
// Every account in one place: add a login, reset a password, change the login email,
// turn access on/off, grant or remove admin. All actions go through the admin-users
// Edge Function, which re-checks that the caller is the super admin.
import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, PANEL, SURFACE, WARN, DANGER } from "../../theme.js"
import { Icon, Modal, Avatar } from "../../ui.jsx"
import { BRAND } from "../../brand.js"

async function call(body) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body })
  if (error) {
    try { const j = await error.context?.json?.(); if (j?.error) return { error: j.error } } catch { /* fall through */ }
    return { error: "Couldn't reach the server. Try again." }
  }
  return data || {}
}

const ago = (iso) => {
  if (!iso) return "Never"
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 2) return "Just now"; if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24); if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`
  return new Date(iso).toLocaleDateString()
}

function Level({ u }) {
  if (u.is_super) return <span style={s.badge("#b45309", "#fdf3e3")}>Super admin</span>
  if (u.is_owner) return <span style={s.badge("#0f766e", "#e6f6f3")}>Owner</span>
  if (u.is_admin) return <span style={s.badge("#8b5cf6")}>Admin</span>
  return <span style={s.badge(MUTED, "#eef0f2")}>Crew</span>
}

export default function Users({ user }) {
  const [users, setUsers] = useState(null); const [err, setErr] = useState("")
  const [q, setQ] = useState(""); const [open, setOpen] = useState(null); const [adding, setAdding] = useState(false)

  const load = async () => {
    const r = await call({ action: "list" })
    if (r.error) return setErr(r.error)
    setErr(""); setUsers(r.users || [])
  }
  useEffect(() => { load() }, [])

  const rows = useMemo(() => (users || []).filter((u) => !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(a.login_disabled) - Number(b.login_disabled) || Number(b.is_super) - Number(a.is_super) || Number(b.is_owner) - Number(a.is_owner) || Number(b.is_admin) - Number(a.is_admin) || a.name.localeCompare(b.name)), [users, q])

  if (!user.is_super) return <div style={s.alert("error")}>Only the super admin can manage logins.</div>
  if (err && !users) return <div style={s.alert("error")}>{err}</div>
  if (!users) return <div style={{ color: MUTED, padding: 20 }}>Loading accounts…</div>

  const active = users.filter((u) => !u.login_disabled).length
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, maxWidth: 560 }}>
          {active} account{active === 1 ? "" : "s"} can sign in · {users.length - active} turned off. Only you see this page. Other admins can still edit profiles (phone, pay, title) in TimeCard → Team, but not logins.
        </div>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 16px", display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setAdding(true)}><Icon name="plus" size={15} color="#fff" /> Add user</button>
      </div>
      <div style={{ position: "relative", marginBottom: 12, maxWidth: 360 }}>
        <span style={{ position: "absolute", left: 11, top: 11, pointerEvents: "none" }}><Icon name="search" size={16} color={FAINT} /></span>
        <input style={{ ...s.input, paddingLeft: 34 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" />
      </div>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        {rows.map((u, n) => (
          <button key={u.id} onClick={() => setOpen(u)}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 12, padding: "12px 14px", background: "none", border: "none", borderTop: n ? `1px solid ${BG}` : "none", textAlign: "left", cursor: "pointer", color: TEXT, opacity: u.login_disabled ? 0.55 : 1 }}>
            <Avatar name={u.name} src={u.photo_url} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color: INK }}>{u.name}</span><Level u={u} />
                {u.login_disabled && <span style={s.badge(DANGER, "#fdecea")}>Access off</span>}
                {!u.login_disabled && u.must_change_password && <span style={s.badge(WARN, "#fdf3e3")}>Temp password</span>}
              </div>
              <div style={{ fontSize: 12, color: FAINT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
            </div>
            <div style={{ fontSize: 12, color: MUTED, textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 10.5, color: FAINT }}>Last sign-in</div>{ago(u.last_sign_in_at)}</div>
          </button>
        ))}
      </div>
      {open && <UserModal u={open} me={user} onClose={() => setOpen(null)} onChanged={async () => { await load() }} />}
      {adding && <AddUser onClose={() => setAdding(false)} onDone={async () => { await load() }} />}
    </div>
  )
}

function TempPassword({ name, email, pw, onDone, title }) {
  const [copied, setCopied] = useState(false)
  return (
    <Modal title={title} onClose={onDone} width={460}>
      <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.6, marginBottom: 14 }}>Give <strong>{name}</strong> this temporary password. They'll pick their own the first time they sign in.</div>
      <div style={{ ...s.card, background: PANEL, textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{email}</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "1px", color: INK, userSelect: "all" }}>{pw}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ ...s.btnSecondary, flex: 1 }} onClick={() => { navigator.clipboard?.writeText(`${email}\n${pw}`).then(() => setCopied(true)) }}>{copied ? "Copied" : "Copy login"}</button>
        <button style={{ ...s.btnPrimary, flex: 1 }} onClick={onDone}>Done</button>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Shown once. Copy it before closing.</div>
    </Modal>
  )
}

function UserModal({ u, me, onClose, onChanged }) {
  const self = u.id === me.id
  const [email, setEmail] = useState(u.email || ""); const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [msg, setMsg] = useState("")
  const [pw, setPw] = useState("")

  const act = async (label, body, ok) => {
    setErr(""); setMsg(""); setBusy(label)
    const r = await call(body); setBusy("")
    if (r.error) return setErr(r.error)
    if (r.temp_password) setPw(r.temp_password)
    if (ok) setMsg(ok)
    await onChanged()
  }

  if (pw) return <TempPassword title="Password reset" name={u.name} email={u.email} pw={pw} onDone={onClose} />

  const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${BG}`, flexWrap: "wrap" }
  const label = (t, sub) => <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, color: INK, fontSize: 14 }}>{t}</div>{sub && <div style={{ fontSize: 12, color: MUTED }}>{sub}</div>}</div>
  return (
    <Modal title={u.name} onClose={onClose} width={560}>
      {err && <div style={s.alert("error")}>{err}</div>}
      {msg && <div style={{ background: GSOFT, color: GD, borderRadius: 10, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <Level u={u} /><span style={{ fontSize: 12, color: MUTED }}>{u.role} · last sign-in {ago(u.last_sign_in_at).toLowerCase()}</span>
      </div>

      <div style={row}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: INK, fontSize: 14, marginBottom: 6 }}>Login email</div>
          <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button style={{ ...s.btnSecondary, alignSelf: "flex-end" }} disabled={!!busy || email.trim().toLowerCase() === (u.email || "").toLowerCase()}
          onClick={() => act("email", { action: "update_email", id: u.id, email }, `Login email changed to ${email.trim().toLowerCase()}.`)}>{busy === "email" ? "Saving…" : "Change email"}</button>
      </div>

      <div style={row}>
        {label("Password", u.must_change_password ? "Still on a temporary password." : "They set their own.")}
        <button style={s.btnWarn} disabled={!!busy} onClick={() => window.confirm(`Give ${u.name} a new temporary password? Their current password stops working.`) && act("pw", { action: "reset_password", id: u.id })}>{busy === "pw" ? "Resetting…" : "Reset password"}</button>
      </div>

      <div style={row}>
        {label("Admin rights", u.is_owner ? "Owner accounts are always admins." : u.is_admin ? "Can see and manage everything except logins and DMs." : "Crew: own time, schedule, jobs, check out inventory.")}
        {self || u.is_owner ? <span style={{ fontSize: 12, color: FAINT }}>{self ? "Your account" : "Owner"}</span> :
          <button style={s.btnSecondary} disabled={!!busy} onClick={() => act("admin", { action: "set_admin", id: u.id, is_admin: !u.is_admin }, u.is_admin ? `${u.name} is now crew.` : `${u.name} is now an admin.`)}>
            {busy === "admin" ? "Saving…" : u.is_admin ? "Remove admin" : "Make admin"}</button>}
      </div>

      <div style={row}>
        {label("Access", u.login_disabled ? "Turned off: can't sign in. History is kept." : "Can sign in.")}
        {self ? <span style={{ fontSize: 12, color: FAINT }}>Your account</span> :
          <button style={u.login_disabled ? s.btnSecondary : s.btnDanger} disabled={!!busy}
            onClick={() => (u.login_disabled || window.confirm(`Turn off ${u.name}'s access? They're signed out within the hour and can't sign back in. Their time, jobs, and history stay.`)) &&
              act("access", { action: "set_access", id: u.id, enabled: u.login_disabled }, u.login_disabled ? `${u.name} can sign in again.` : `${u.name}'s access is off.`)}>
            {busy === "access" ? "Saving…" : u.login_disabled ? "Turn access on" : "Turn access off"}</button>}
      </div>

      {!self && (
        <div style={row}>
          {label("Delete account", "Permanent. Only for accounts with no time, T&M, inventory, or posting history; for anyone else, turn access off instead.")}
          <button style={s.btnDanger} disabled={!!busy} onClick={async () => {
            if (window.prompt(`Type DELETE to permanently remove ${u.name}'s account.`) !== "DELETE") return
            setErr(""); setBusy("delete")
            const r = await call({ action: "delete", id: u.id }); setBusy("")
            if (r.error) return setErr(r.error)
            await onChanged(); onClose()
          }}>{busy === "delete" ? "Deleting…" : "Delete"}</button>
        </div>
      )}
    </Modal>
  )
}

function AddUser({ onClose, onDone }) {
  const [f, setF] = useState({ name: "", email: "", role: "Apprentice", level: "crew" })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [made, setMade] = useState(null)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v, ...(k === "name" && !p.emailTouched ? { email: v.trim() ? `${v.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "")}@${BRAND.emailDomain}` : "" } : {}), ...(k === "email" ? { emailTouched: true } : {}) }))
  const submit = async () => {
    setErr(""); if (!f.name.trim()) return setErr("Add a name.")
    setBusy(true)
    const r = await call({ action: "create", employee: { name: f.name.trim(), email: f.email, role: f.level === "owner" ? "Owner" : f.role, is_admin: f.level !== "crew", is_owner: f.level === "owner" } })
    setBusy(false)
    if (r.error) return setErr(r.error)
    setMade({ ...f, pw: r.temp_password }); await onDone()
  }
  if (made) return <TempPassword title="User added" name={made.name} email={made.email} pw={made.pw} onDone={onClose} />
  return (
    <Modal title="Add user" onClose={onClose} width={480}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={s.field}><label style={s.label}>Full name</label><input style={s.input} value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></div>
      <div style={s.field}><label style={s.label}>Login email</label><input style={s.input} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
      <div style={s.field}><label style={s.label}>Access level</label>
        <select style={s.input} value={f.level} onChange={(e) => set("level", e.target.value)}>
          <option value="crew">Crew</option><option value="admin">Admin</option><option value="owner">Owner (admin, hidden from crew lists)</option>
        </select></div>
      {f.level !== "owner" && <div style={s.field}><label style={s.label}>Title</label><input style={s.input} value={f.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Journeyman" /></div>}
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>Creates the login and shows a one-time temporary password. Add phone, pay, and the rest in TimeCard → Team.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={s.btnGhost} onClick={onClose}>Cancel</button>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 20px" }} onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add user"}</button>
      </div>
    </Modal>
  )
}
