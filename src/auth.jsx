// ─── Sign in + first-login password change ────────────────────────────────────
import { useState } from "react"
import { supabase } from "./supabase.js"
import { s, GD, GSOFT, INK, MUTED } from "./theme.js"
import { BRAND } from "./brand.js"
import { Logo, Icon } from "./ui.jsx"

// ─── Login ────────────────────────────────────────────────────────────────────
export function Login({ notice }) {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("")
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false)
  const submit = async () => {
    if (!email || !pass) return setErr("Please enter your email and password.")
    setLoading(true); setErr("")
    const { error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase().trim(), password: pass })
    setLoading(false)
    if (error) return setErr("Invalid email or password.")
    // App root picks up the new session and loads the profile.
  }
  return (
    <div style={s.loginWrap}>
      <div style={s.loginCard}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><Logo height={74} /></div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, background: GSOFT, color: GD, fontWeight: 800, fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase" }}><Icon name="grid" size={13} color={GD} /> {BRAND.hubName}</div>
          {BRAND.loginTagline && <div style={{ marginTop: 16, fontSize: 17, fontWeight: 700, color: INK, letterSpacing: "-.2px" }}>{BRAND.loginTagline}</div>}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: INK }}>Sign in</div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 22 }}>Use your {BRAND.company} email to continue</div>
        {notice && !err && <div style={s.alert("warning")}>{notice}</div>}
        {err && <div style={s.alert("error")}>{err}</div>}
        <div style={s.field}><label style={s.label}>Email</label><input style={s.input} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={`you@${BRAND.emailDomain}`} autoComplete="email" /></div>
        <div style={s.field}><label style={s.label}>Password</label><input style={s.input} type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" autoComplete="current-password" /></div>
        <button style={s.btnPrimary} onClick={submit} disabled={loading}>{loading ? "Signing in…" : "Sign In"}</button>
      </div>
    </div>
  )
}

export function ChangePassword({ user, onDone }) {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [err, setErr] = useState(""); const [loading, setLoading] = useState(false)
  const save = async () => {
    setErr("")
    if (pw.length < 8) return setErr("Password must be at least 8 characters.")
    if (pw !== pw2) return setErr("Passwords don't match.")
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setLoading(false); return setErr(error.message?.includes("different") ? "Choose a password different from your temporary one." : "Failed to update password. Try again.") }
    await supabase.from("employees").update({ must_change_password: false }).eq("id", user.id)
    setLoading(false)
    onDone({ ...user, must_change_password: false })
  }
  return (
    <div style={s.loginWrap}>
      <div style={{ ...s.loginCard, width: "min(420px,100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: GSOFT, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="lock" size={22} color={GD} /></div>
          <div><div style={{ fontWeight: 800, fontSize: 17, color: INK }}>Welcome, {user.name}!</div><div style={{ fontSize: 13, color: MUTED }}>Set your personal password to continue</div></div>
        </div>
        <div style={s.alert("success")}>You signed in with a temporary password. Set your own to continue.</div>
        {err && <div style={s.alert("error")}>{err}</div>}
        <div style={s.field}><label style={s.label}>New Password</label><input style={s.input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" /></div>
        <div style={s.field}><label style={s.label}>Confirm Password</label><input style={s.input} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Re-enter" /></div>
        <button style={s.btnPrimary} onClick={save} disabled={loading}>{loading ? "Saving…" : "Set Password & Continue"}</button>
      </div>
    </div>
  )
}

