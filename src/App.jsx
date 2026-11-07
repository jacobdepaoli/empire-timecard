// ─── Empire Hub: sign-in, routing, and the tool frame ───────────────────────
import { useEffect, useState } from "react"
import { supabase } from "./supabase.js"
import { css, s, G } from "./theme.js"
import { Logo, Icon, requestNotificationPermission } from "./ui.jsx"
import { Login, ChangePassword } from "./auth.jsx"
import { useRoute, go } from "./router.js"
import { Home, ToolShell } from "./Shell.jsx"
import { TOOLS } from "./tools/registry.js"
import { MyProfile } from "./tools/crew/Crew.jsx"

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authErr, setAuthErr] = useState("")
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported")
  const route = useRoute()

  // Load the employee profile that belongs to the signed-in Supabase Auth user.
  const loadProfile = async (uid) => {
    const { data } = await supabase.from("employees").select("*").eq("id", uid).maybeSingle()
    if (!data || !data.active) {
      setAuthErr(data ? "This account has been deactivated. Contact the office." : "No employee profile is linked to this login.")
      await supabase.auth.signOut(); setUser(null)
    } else { setAuthErr(""); setUser(data) }
    setLoading(false)
  }

  useEffect(() => {
    const el = document.createElement("style"); el.textContent = css; document.head.appendChild(el)
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!sess) { setUser(null); setLoading(false); return }
      // Defer: Supabase recommends not awaiting other supabase calls inside this callback.
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") setTimeout(() => loadProfile(sess.user.id), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (user && notifPerm === "default") requestNotificationPermission().then(setNotifPerm) }, [user])
  // Short links printed on QR labels: #/i/<SKU> → the item in Inventory.
  useEffect(() => { if (route[0] === "i") location.replace(`#/inventory/item/${encodeURIComponent(route[1] || "")}`) }, [route])

  const logout = async () => { await supabase.auth.signOut(); setUser(null); go("") }

  if (loading) return <div style={{ ...s.loadScreen, background: "#1C1B17" }}><Logo height={64} variant="dark" /><Icon name="spinner" size={26} color={G} spin /></div>
  if (!user) return <Login notice={authErr} />
  if (user.must_change_password) return <ChangePassword user={user} onDone={setUser} />

  const [toolId] = route
  if (toolId === "i") return null
  if (toolId === "profile") return <ToolShell user={user} title="My Profile" icon="user"><MyProfile user={user} setUser={setUser} /></ToolShell>

  const tool = TOOLS.find((t) => t.id === toolId && (!t.adminOnly || user.is_admin))
  if (!tool) return <Home user={user} onLogout={logout} />

  const Tool = tool.component
  if (tool.fullScreen) {
    return <Tool user={user} setUser={setUser} route={route} page={route[1]} setPage={(p) => go(`${tool.id}/${p}`)}
      onHome={() => go("")} onLogout={logout} notifPerm={notifPerm} setNotifPerm={setNotifPerm} />
  }
  return <ToolShell user={user} title={tool.name} icon={tool.icon}><Tool user={user} setUser={setUser} route={route} /></ToolShell>
}
