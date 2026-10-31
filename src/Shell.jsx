// ─── Hub shell: home screen + the frame around simple tools ─────────────────
import { useEffect, useState } from "react"
import { supabase } from "./supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, SURFACE, SIDE, SIDE_MUTED, GLIGHT, WARN } from "./theme.js"
import { BRAND } from "./brand.js"
import { Logo, Icon, Avatar } from "./ui.jsx"
import { go } from "./router.js"
import { duration } from "./util.js"
import { TOOLS } from "./tools/registry.js"
import { upcomingCelebrations } from "./tools/crew/Crew.jsx"

const wrap = { maxWidth: 1040, margin: "0 auto", padding: "0 clamp(14px,4vw,28px)" }

function TopBar({ user, children, onLogout }) {
  return (
    <div style={{ background: SIDE, position: "sticky", top: 0, zIndex: 50, paddingTop: "env(safe-area-inset-top)" }}>
      <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 12, height: 60 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>{children}</div>
        <button onClick={() => go("profile")} title="My profile" style={{ background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
          <Avatar name={user.name} src={user.photo_url} size={32} />
        </button>
        {onLogout && <button onClick={onLogout} title="Sign out" style={{ background: "transparent", border: "none", padding: 6, display: "flex" }}><Icon name="logout" size={18} color={SIDE_MUTED} /></button>}
      </div>
    </div>
  )
}

// Frame for tools that don't have their own layout (everything except TimeCard).
export function ToolShell({ user, title, icon, children }) {
  return (
    <div style={{ minHeight: "100vh", background: BG }}>
      <TopBar user={user}>
        <button onClick={() => go("")} style={{ background: "rgba(255,255,255,.07)", border: "none", borderRadius: 10, padding: "7px 11px 7px 7px", display: "flex", alignItems: "center", gap: 4, color: "#fff", fontWeight: 700, fontSize: 13 }}>
          <Icon name="back" size={16} color="#fff" /> Home
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontWeight: 800, fontSize: 16, minWidth: 0 }}>
          {icon && <Icon name={icon} size={17} color={GLIGHT} />}<span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        </div>
      </TopBar>
      <div style={{ ...wrap, paddingTop: 22, paddingBottom: "calc(48px + env(safe-area-inset-bottom))" }}>{children}</div>
    </div>
  )
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening" }

export function Home({ user, onLogout }) {
  const [badges, setBadges] = useState({})
  const [unread, setUnread] = useState(null)   // newest unconfirmed announcement
  const [celebs, setCelebs] = useState([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const d0 = new Date(), todayIso = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-${String(d0.getDate()).padStart(2, "0")}`
      const [{ data: anns }, { data: reads }, { data: open }, { data: sched }, pend, { data: inbox }] = await Promise.all([
        supabase.from("announcements").select("id,title,author_id,created_at,pinned,kind").order("created_at", { ascending: false }).limit(50),
        supabase.from("announcement_reads").select("announcement_id").eq("employee_id", user.id),
        user.is_owner ? Promise.resolve({ data: null }) : supabase.from("time_logs").select("job_name,clock_in").eq("employee_id", user.id).is("clock_out", null).maybeSingle(),
        supabase.from("schedule_entries").select("label,start_time,jobs(name)").eq("employee_id", user.id).eq("work_date", todayIso).order("start_time"),
        user.is_admin ? supabase.from("pto_requests").select("id", { count: "exact", head: true }).eq("status", "Pending") : Promise.resolve({ count: 0 }),
        supabase.rpc("my_conversations"),
      ])
      const unreadMsgs = (inbox || []).reduce((n, c) => n + (c.unread || 0), 0)
      const pendCount = pend?.count || 0
      if (!alive) return
      const seen = new Set((reads || []).map((r) => r.announcement_id))
      const todo = (anns || []).filter((a) => a.kind !== "celebration" && a.author_id !== user.id && !seen.has(a.id))
      setUnread(todo[0] || null)
      setBadges({
        announcements: todo.length ? { count: todo.length } : null,
        timecard: open ? { status: `On the clock · ${open.job_name}`, since: open.clock_in } : null,
        schedule: sched?.length ? { status: `Today: ${sched.map((x) => x.jobs?.name || x.label).join(", ")}` } : null,
        timeoff: pendCount ? { count: pendCount } : null,
        messages: unreadMsgs ? { count: unreadMsgs } : null,
      })
    }
    load()
    supabase.rpc("crew_profiles").then(({ data }) => alive && setCelebs(upcomingCelebrations(data || [], 14)))
    const ch = supabase.channel("home-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, load)
      .subscribe()
    const iv = setInterval(load, 60000)
    return () => { alive = false; clearInterval(iv); supabase.removeChannel(ch) }
  }, [user.id])

  const first = user.name.split(" ")[0]
  const tools = TOOLS.filter((t) => !t.adminOnly || user.is_admin)

  return (
    <div style={{ minHeight: "100vh", background: BG }}>
      <TopBar user={user} onLogout={onLogout}><Logo height={34} variant="dark" /></TopBar>
      <div style={{ background: `radial-gradient(700px 260px at 15% 0%, rgba(74,160,74,.22), transparent 70%), ${SIDE}`, paddingBottom: 54 }}>
        <div style={{ ...wrap, paddingTop: 18 }}>
          <div style={{ color: "#fff", fontSize: "clamp(24px,5vw,32px)", fontWeight: 800, letterSpacing: "-.6px" }}>{greeting()}, {first}</div>
          <div style={{ color: SIDE_MUTED, fontSize: 14, marginTop: 4 }}>{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
      </div>

      <div style={{ ...wrap, marginTop: -36, paddingBottom: "calc(48px + env(safe-area-inset-bottom))" }}>
        {unread && (
          <div className="lift" onClick={() => go("announcements")} style={{ ...s.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, borderLeft: `4px solid ${G}`, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: GSOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="megaphone" size={20} color={GD} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: GD }}>New announcement</div>
              <div style={{ fontWeight: 800, color: INK, fontSize: 15, lineHeight: 1.3 }}>{unread.title}</div>
            </div>
            <Icon name="chevron" size={18} color={FAINT} />
          </div>
        )}

        {celebs.length > 0 && (
          <div style={{ ...s.card, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: GD }}>Celebrations</div>
              <button style={{ ...s.btnGhost, padding: "2px 4px", fontSize: 12 }} onClick={() => go("crew")}>See the crew</button>
            </div>
            {celebs.slice(0, 4).map((c) => (
              <div key={c.id} onClick={() => go(c.inDays === 0 ? "announcements" : "crew")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", cursor: "pointer", borderTop: `1px solid ${BG}` }}>
                <Avatar name={c.who.name} src={c.who.photo_url} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: INK, fontSize: 14 }}>{c.kind === "birthday" ? `🎂 ${c.first}'s birthday` : `🎉 ${c.first}: ${c.years} year${c.years === 1 ? "" : "s"} with the crew`}</div>
                  <div style={{ fontSize: 12, color: c.inDays === 0 ? GD : MUTED, fontWeight: c.inDays === 0 ? 700 : 500 }}>{c.inDays === 0 ? "Today! Tap to send a note" : c.inDays === 1 ? `Tomorrow · ${c.label}` : `In ${c.inDays} days · ${c.label}`}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(46%, 230px), 1fr))", gap: 12 }}>
          {tools.map((t) => {
            const b = badges[t.id]
            return (
              <div key={t.id} className="lift" onClick={() => go(t.id)} style={{ ...s.card, marginBottom: 0, cursor: "pointer", position: "relative", display: "flex", flexDirection: "column", gap: 10, minHeight: 132, padding: "clamp(14px,3vw,20px)" }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: INK, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={t.icon} size={22} color={GLIGHT} /></div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: INK }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>{t.desc}</div>
                </div>
                {b?.status && <div style={{ fontSize: 12, fontWeight: 700, color: GD, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 9, background: G, animation: "pulse 2s infinite" }} />{b.status}{b.since ? ` · ${duration(b.since)}` : ""}</div>}
                {b?.count > 0 && <span style={{ position: "absolute", top: 16, right: 16, background: G, color: "#fff", fontWeight: 800, fontSize: 12, minWidth: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 7px" }}>{b.count}</span>}
              </div>
            )
          })}
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: FAINT, marginTop: 32, letterSpacing: "1.5px", textTransform: "uppercase" }}>{BRAND.company} · {BRAND.tagline}</div>
      </div>
    </div>
  )
}
