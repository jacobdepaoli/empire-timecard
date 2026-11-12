// ─── TimeCard tool: clock, jobs, T&M, logs, timecards, crew map, team ────────
import { useState, useEffect, useRef } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, SURFACE, PANEL, DANGER, WARN, SIDE_TEXT, SIDE_MUTED, GLIGHT } from "../../theme.js"
import { BRAND, COMPANY } from "../../brand.js"
import {
  fmtDate, fmtTime, fmtDateTime, money, duration, durationHours, isServiceJob,
  weekStart, weekLabel, genJobNumber, todayStr, getLocation, hasGps, mapsLink, readFileAsDataURL,
  toLocalDate, toLocalTime, combineLocal,
} from "../../util.js"
import { loadGoogleMaps, DEFAULT_CENTER } from "../../maps.js"
import { pushNotification, requestNotificationPermission, Logo, Icon, Modal, SignaturePad, Avatar } from "../../ui.jsx"

const BILL_RATE = 120

// The hub renders this. `page` comes from the URL (#/timecard/<page>).
export default function TimeCardTool({ user, setUser, page, setPage, onHome, onLogout, notifPerm, setNotifPerm }) {
  const pg = page || (user.is_owner ? "logs" : "clock")
  return (
    <div style={s.app}>
      <div style={s.layout}>
        <Sidebar user={user} page={pg} setPage={setPage} onHome={onHome} onLogout={onLogout} notifPerm={notifPerm} setNotifPerm={setNotifPerm} />
        <main style={s.main} className="tc-main">
          <div className="tc-mobile-brand"><Logo height={36} /><span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "2.5px", textTransform: "uppercase", color: GD }}>{BRAND.appName}</span></div>
          {pg === "clock" && !user.is_owner && <TimeClock user={user} />}
          {pg === "jobs" && <Jobs user={user} onOpenJob={(j) => { location.hash = `/jobs/${j.id}` }} />}
          {pg === "tm" && <TMSheets user={user} />}
          {pg === "logs" && <TimeLogs user={user} />}
          {pg === "timecards" && !user.is_owner && <Timecards user={user} />}
          {pg === "customers" && <Customers user={user} />}
          {pg === "map" && user.is_admin && <CrewMap />}
          {pg === "employees" && user.is_admin && <Employees me={user} />}
          {pg === "export" && user.is_admin && <Export />}
          {pg === "notifs" && <NotificationCenter user={user} />}
          {pg === "profile" && <Profile user={user} setUser={setUser} />}
        </main>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ user, page, setPage, onHome, onLogout, notifPerm, setNotifPerm }) {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    const fetch = async () => { const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("read", false); setUnread(count || 0) }
    fetch()
    const ch = supabase.channel("notif-count").on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, fetch).subscribe()
    return () => supabase.removeChannel(ch)
  }, [])
  const nav = [
    ...(user.is_owner ? [] : [{ id: "clock", label: "Time Clock", icon: "clock" }]),
    { id: "jobs", label: "Jobs", icon: "briefcase" },
    { id: "tm", label: "T&M Sheets", icon: "file" },
    { id: "logs", label: "Time Logs", icon: "list" },
    ...(user.is_owner ? [] : [{ id: "timecards", label: "Timecards", icon: "calendar" }]),
    { id: "customers", label: "Customers", icon: "book" },
    ...(user.is_admin ? [
      { id: "map", label: "Crew Map", icon: "map" },
      { id: "employees", label: "Employees", icon: "users" },
      { id: "export", label: "QB Export", icon: "download" },
    ] : []),
    { id: "notifs", label: "Notifications", icon: "bell", badge: unread },
    { id: "profile", label: "My Profile", icon: "user" },
  ]
  return (
    <nav style={s.sidebar} className="tc-sidebar">
      <div style={s.sideLogo} className="tc-side-logo"><Logo height={50} variant="dark" /><div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "2.5px", textTransform: "uppercase", color: GLIGHT, paddingLeft: 2 }}>{BRAND.appName}</div></div>
      <div style={s.sideNav} className="tc-side-nav">
        <div style={s.navItem(false)} className="tc-navitem" onClick={onHome}>
          <Icon name="grid" size={17} color={SIDE_MUTED} />
          <span style={{ flex: 1 }}>Home</span>
        </div>
        <div className="tc-side-divider" style={{ height: 1, background: "rgba(255,255,255,.08)", margin: "6px 6px 8px" }} />
        {nav.map((n) => (
          <div key={n.id} style={s.navItem(page === n.id)} className="tc-navitem" onClick={() => (n.id === "profile" ? (location.hash = "/profile") : setPage(n.id))}>
            <Icon name={n.icon} size={17} color={page === n.id ? GLIGHT : SIDE_MUTED} />
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge > 0 && <span style={{ background: G, color: INK, fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 10, animation: "pulse 2s infinite" }}>{n.badge}</span>}
          </div>
        ))}
        {notifPerm !== "granted" && notifPerm !== "unsupported" && (
          <div style={{ margin: "8px 4px", padding: "9px 12px", background: "rgba(74,160,74,.14)", border: "1px solid rgba(74,160,74,.28)", borderRadius: 10, fontSize: 12, color: GLIGHT, cursor: "pointer", fontWeight: 600 }} onClick={() => requestNotificationPermission().then(setNotifPerm)}>
            <Icon name="bell" size={12} color={GLIGHT} /> Enable alerts
          </div>
        )}
      </div>
      <div style={s.sideFoot} className="tc-side-foot">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 10px" }}>
          {user.photo_url ? <img src={user.photo_url} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            : <div style={{ width: 34, height: 34, borderRadius: "50%", background: G, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>{user.name[0]}</div>}
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div><div style={{ fontSize: 11, color: SIDE_MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.is_owner ? "Owner" : user.is_admin ? "Admin" : user.role}</div></div>
        </div>
        <div style={{ ...s.navItem(false), color: "#F08A7E" }} onClick={onLogout}><Icon name="logout" size={16} color="#F08A7E" /> Sign Out</div>
      </div>
    </nav>
  )
}

// ─── Time Clock ───────────────────────────────────────────────────────────────
function TimeClock({ user }) {
  const [now, setNow] = useState(new Date())
  const [active, setActive] = useState(null)
  const [jobs, setJobs] = useState([])
  const [selJob, setSelJob] = useState("")
  const [notes, setNotes] = useState("")
  const [site, setSite] = useState(""); const [cust, setCust] = useState("")
  const [loading, setLoading] = useState(false); const [msg, setMsg] = useState(null)
  const [tmForm, setTmForm] = useState(false)
  const [gpsRequired, setGpsRequired] = useState(user.gps_required !== false)

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); load(); return () => clearInterval(t) }, [])
  const load = async () => {
    const { data: j } = await supabase.from("jobs").select("*").eq("status", "Active").order("name")
    setJobs(j || [])
    const { data: a } = await supabase.from("time_logs").select("*").eq("employee_id", user.id).is("clock_out", null).maybeSingle()
    setActive(a || null)
    // refresh the GPS-required flag in case an admin changed it
    const { data: me } = await supabase.from("employees").select("gps_required").eq("id", user.id).maybeSingle()
    if (me) setGpsRequired(me.gps_required !== false)
  }

  // While clocked in (and this screen is open), refresh live location every 2 min.
  useEffect(() => {
    if (!active?.id) return
    let cancelled = false
    const ping = async () => {
      const loc = await getLocation()
      if (cancelled || !hasGps(loc.lat)) return
      await supabase.from("time_logs").update({ location_cur_lat: loc.lat, location_cur_lng: loc.lng, location_cur_at: new Date().toISOString() }).eq("id", active.id)
    }
    ping()
    const iv = setInterval(ping, 120000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [active?.id])
  const jobObj = jobs.find((j) => j.id === selJob)
  const needsSite = jobObj && isServiceJob(jobObj)

  const clockIn = async () => {
    if (!selJob) return setMsg({ type: "error", text: "Please select a job first." })
    if (needsSite && !site.trim()) return setMsg({ type: "error", text: "Site address is required for service jobs." })
    if (needsSite && !cust.trim()) return setMsg({ type: "error", text: "Customer name is required for service jobs." })
    setLoading(true)
    const loc = await getLocation()
    if (gpsRequired && !hasGps(loc.lat)) {
      setLoading(false)
      return setMsg({ type: "error", text: "Location is required to clock in. Turn on Location Services and allow location access for this site, then try again." })
    }
    const job = jobs.find((j) => j.id === selJob)
    const entry = {
      employee_id: user.id, employee_name: user.name, job_id: selJob, job_name: job?.name,
      clock_in: new Date().toISOString(), notes,
      site_address: needsSite ? site : job?.address || "", customer_name: needsSite ? cust : job?.client || "",
      is_service: isServiceJob(job),
      location_in_lat: loc.lat, location_in_lng: loc.lng, location_in_accuracy: loc.accuracy,
      location_cur_lat: loc.lat, location_cur_lng: loc.lng, location_cur_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from("time_logs").insert(entry).select().single()
    setLoading(false)
    if (error) return setMsg({ type: "error", text: "Failed to clock in. Check your connection." })
    setActive(data); setSelJob(""); setNotes(""); setSite(""); setCust("")
    setMsg({ type: "success", text: `Clocked in at ${fmtTime(new Date())}${hasGps(loc.lat) ? " · GPS locked" : ""}` })
    pushNotification("Clock In", `${user.name} clocked in at ${job?.name} — ${fmtTime(new Date())}`)
  }
  const startOut = () => { active?.is_service ? setTmForm(true) : doOut() }
  const doOut = async () => {
    setLoading(true)
    const loc = await getLocation()
    await supabase.from("time_logs").update({ clock_out: new Date().toISOString(), location_out_lat: loc.lat, location_out_lng: loc.lng, location_out_accuracy: loc.accuracy }).eq("id", active.id)
    const d = duration(active.clock_in)
    setMsg({ type: "success", text: `Clocked out. Shift: ${d}` })
    pushNotification("Clock Out", `${user.name} clocked out from ${active.job_name} — ${d}`)
    setActive(null); setLoading(false); setTmForm(false)
  }

  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageTitle}>Time Clock</div><div style={s.pageSub}>Clock in & out of your job site</div></div></div>
      <div style={{ ...s.clockCard, maxWidth: 680, margin: "0 auto" }}>
        <div style={s.clockTime}>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
        <div style={s.clockDate}>{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
        {msg && <div style={{ ...s.alert(msg.type), textAlign: "left" }}>{msg.text}</div>}
        {active ? (
          <div>
            <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 20px", textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: ".5px", marginBottom: 6 }}>CURRENTLY CLOCKED IN</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: active.is_service ? WARN : GD, marginBottom: 4 }}>{active.job_name}</div>
              {active.customer_name && <div style={{ fontSize: 13, color: MUTED, marginBottom: 2 }}>Customer: <span style={{ color: TEXT }}>{active.customer_name}</span></div>}
              {active.site_address && <div style={{ fontSize: 13, color: MUTED, display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><Icon name="pin" size={12} color={MUTED} />{active.site_address}</div>}
              <div style={{ fontSize: 13, color: MUTED }}>Started {fmtTime(active.clock_in)} · <span style={{ color: GD, fontWeight: 700 }}>{duration(active.clock_in)} elapsed</span></div>
              {active.is_service && <div style={{ marginTop: 10, padding: "7px 11px", background: "#fdf3e3", borderRadius: 8, fontSize: 12, color: WARN, fontWeight: 600 }}>T&M field report required before clock-out</div>}
            </div>
            <button style={s.btnClockOut} onClick={startOut} disabled={loading}><Icon name="stop" size={18} color={DANGER} /> {loading ? "Processing…" : active.is_service ? "Clock Out + T&M Report" : "Clock Out"}</button>
          </div>
        ) : (
          <div style={{ textAlign: "left" }}>
            <div style={s.field}>
              <label style={s.label}>Select Job Site</label>
              <select style={s.input} value={selJob} onChange={(e) => setSelJob(e.target.value)}>
                <option value="">— Choose a job —</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}{isServiceJob(j) ? "  (service)" : ""}</option>)}
              </select>
            </div>
            {needsSite && (
              <div style={{ background: "#fdf3e3", border: `1px solid #f0dcb4`, borderRadius: 12, padding: "14px 16px", marginBottom: 15 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: WARN, marginBottom: 10 }}>SERVICE JOB — enter site details</div>
                <div style={s.field}><label style={s.label}>Customer Name</label><input style={s.input} value={cust} onChange={(e) => setCust(e.target.value)} placeholder="e.g. John Smith" /></div>
                <div style={{ marginBottom: 0 }}><label style={s.label}>Site Address</label><input style={s.input} value={site} onChange={(e) => setSite(e.target.value)} placeholder="123 Main St, Reno NV" /></div>
              </div>
            )}
            <div style={s.field}><label style={s.label}>Notes (optional)</label><input style={s.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. panel upgrade, rough-in…" /></div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 18, display: "flex", alignItems: "center", gap: 5 }}><Icon name="pin" size={12} color={MUTED} /> {gpsRequired ? "GPS required — location is captured automatically and updates while you're clocked in." : "GPS is captured automatically when available."}</div>
            <button style={s.btnClockIn} onClick={clockIn} disabled={loading}><Icon name="play" size={18} color="#fff" /> {loading ? "Getting GPS…" : "Clock In"}</button>
          </div>
        )}
      </div>
      {tmForm && active && <TMFormModal user={user} fromClockOut log={active} onClose={() => setTmForm(false)} onSaved={doOut} />}
    </div>
  )
}

// ─── T&M Form (field service work order) ─────────────────────────────────────
function TMFormModal({ user, fromClockOut, log, onClose, onSaved }) {
  const [emps, setEmps] = useState([])
  const sigRef = useRef(null)
  const [saving, setSaving] = useState(false); const [err, setErr] = useState("")
  const today = todayStr()
  const [f, setF] = useState({
    tm_number: genJobNumber(today), work_date: today,
    customer_name: log?.customer_name || "", customer_phone: "", customer_email: "", site_address: log?.site_address || "",
    complaint: "", work_performed: log?.notes || "", resolution: "",
    labor: [{ name: user.name, rate: BILL_RATE, hours: "" }],
    materials: [{ qty: "", desc: "", cost: "", photo: "" }],
    photos: [],
    markup_rate: 30, tax_rate: 8.265,
    customer_sign_name: "", sign_date: today,
  })

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("crew_directory")
      setEmps(data || [])
      if (fromClockOut && log) {
        const { data: crew } = await supabase.rpc("active_crew_on_job", { p_job_id: log.job_id })
        if (crew?.length) setF((p) => ({ ...p, labor: crew.map((c) => ({ name: c.employee_name, rate: BILL_RATE, hours: durationHours(c.clock_in) })) }))
      }
    })()
  }, [])

  // ── totals ──
  const laborTotal = f.labor.reduce((a, r) => a + (Number(r.rate) || 0) * (Number(r.hours) || 0), 0)
  const matSub = f.materials.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.cost) || 0), 0)
  const matMarkup = matSub * (Number(f.markup_rate) || 0) / 100
  const matTotal = matSub + matMarkup
  const subtotal = laborTotal + matTotal
  const taxAmt = subtotal * (Number(f.tax_rate) || 0) / 100
  const grand = subtotal + taxAmt

  const setLabor = (i, k, v) => setF((p) => ({ ...p, labor: p.labor.map((r, idx) => idx === i ? { ...r, [k]: v } : r) }))
  const setMat = (i, k, v) => setF((p) => ({ ...p, materials: p.materials.map((r, idx) => idx === i ? { ...r, [k]: v } : r) }))
  const addLabor = () => setF((p) => ({ ...p, labor: [...p.labor, { name: "", rate: BILL_RATE, hours: "" }] }))
  const addMat = () => setF((p) => ({ ...p, materials: [...p.materials, { qty: "", desc: "", cost: "", photo: "" }] }))
  const rmLabor = (i) => setF((p) => ({ ...p, labor: p.labor.filter((_, idx) => idx !== i) }))
  const rmMat = (i) => setF((p) => ({ ...p, materials: p.materials.filter((_, idx) => idx !== i) }))

  const matPhoto = async (i, file) => { if (file) setMat(i, "photo", await readFileAsDataURL(file)) }
  const addPhotos = async (files) => {
    const arr = []
    for (const file of Array.from(files)) if (file.type.startsWith("image/")) arr.push({ src: await readFileAsDataURL(file), caption: "" })
    setF((p) => ({ ...p, photos: [...p.photos, ...arr] }))
  }
  const setCaption = (i, v) => setF((p) => ({ ...p, photos: p.photos.map((ph, idx) => idx === i ? { ...ph, caption: v } : ph) }))
  const rmPhoto = (i) => setF((p) => ({ ...p, photos: p.photos.filter((_, idx) => idx !== i) }))

  const save = async () => {
    if (!f.customer_name.trim()) return setErr("Customer name is required.")
    if (!f.work_performed.trim()) return setErr("Please describe the work performed.")
    setSaving(true)
    const rec = {
      tm_number: f.tm_number, job_id: log?.job_id || null, job_name: log?.job_name || f.customer_name,
      employee_id: user.id, employee_name: user.name, work_date: f.work_date,
      customer_name: f.customer_name, customer_phone: f.customer_phone, customer_email: f.customer_email, site_address: f.site_address,
      complaint: f.complaint, work_performed: f.work_performed, resolution: f.resolution,
      labor: f.labor.filter((r) => r.name), materials: f.materials.filter((r) => r.desc || r.cost), photos: f.photos,
      markup_rate: Number(f.markup_rate) || 0, tax_rate: Number(f.tax_rate) || 0,
      labor_total: +laborTotal.toFixed(2), materials_total: +matSub.toFixed(2), materials_markup: +matMarkup.toFixed(2),
      tax_amount: +taxAmt.toFixed(2), grand_total: +grand.toFixed(2),
      tech_signature: sigRef.current?.toDataURL() || "", customer_sign_name: f.customer_sign_name, sign_date: f.sign_date,
      status: "Complete",
    }
    const { error } = await supabase.from("tm_sheets").insert(rec)
    setSaving(false)
    if (error) { setErr("Failed to save. Try again."); return }
    await pushNotification("T&M Report Submitted", `${user.name} submitted ${f.tm_number} — ${f.customer_name} — ${money(grand)}`)
    onSaved ? onSaved() : onClose()
  }

  const cellInput = { width: "100%", border: `1px solid transparent`, background: "transparent", padding: "7px 6px", fontSize: 14, borderRadius: 6, outline: "none" }
  const numCell = { ...cellInput, textAlign: "right" }
  const tdb = { borderBottom: `1px solid ${BG}` }

  return (
    <div style={s.overlay} className="no-print" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.modal, width: 860 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div><div style={{ fontSize: 19, fontWeight: 800, color: INK }}>Time &amp; Material Report</div><div style={{ fontSize: 12, color: MUTED }}>{fromClockOut ? "Required before clock-out" : "New field report"}</div></div>
          <button style={s.btnGhost} onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {err && <div style={s.alert("error")}>{err}</div>}

        <div style={s.grid2}>
          <div style={s.field}><label style={s.label}>Job / Invoice #</label><input style={s.input} value={f.tm_number} onChange={(e) => setF({ ...f, tm_number: e.target.value })} /></div>
          <div style={s.field}><label style={s.label}>Date</label><input type="date" style={s.input} value={f.work_date} onChange={(e) => setF({ ...f, work_date: e.target.value })} /></div>
        </div>

        <SectionTitle>Customer Information</SectionTitle>
        <div style={s.grid2}>
          <div style={s.field}><label style={s.label}>Customer Name *</label><input style={s.input} value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} placeholder="John Smith" /></div>
          <div style={s.field}><label style={s.label}>Phone</label><input style={s.input} value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} placeholder="(775) 555-0000" /></div>
          <div style={s.field}><label style={s.label}>Email</label><input style={s.input} value={f.customer_email} onChange={(e) => setF({ ...f, customer_email: e.target.value })} placeholder="customer@email.com" /></div>
          <div style={s.field}><label style={s.label}>Service Address</label><input style={s.input} value={f.site_address} onChange={(e) => setF({ ...f, site_address: e.target.value })} placeholder="123 Main St, Reno NV" /></div>
        </div>

        <SectionTitle>Work Narrative</SectionTitle>
        <div style={s.field}><label style={s.label}>Customer Complaint</label><textarea style={s.textarea} value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} placeholder="What the customer reported…" /></div>
        <div style={s.field}><label style={s.label}>Work Performed *</label><textarea style={s.textarea} value={f.work_performed} onChange={(e) => setF({ ...f, work_performed: e.target.value })} placeholder="Describe the work performed in the field…" /></div>
        <div style={s.field}><label style={s.label}>Resolution</label><textarea style={s.textarea} value={f.resolution} onChange={(e) => setF({ ...f, resolution: e.target.value })} placeholder="Final result, recommendations, follow-ups…" /></div>

        <SectionTitle>Labor — full crew</SectionTitle>
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={s.th}>Employee</th><th style={{ ...s.th, width: 110, textAlign: "right" }}>Rate $/hr</th>
              <th style={{ ...s.th, width: 90, textAlign: "right" }}>Hours</th><th style={{ ...s.th, width: 110, textAlign: "right" }}>Line Total</th><th style={{ ...s.th, width: 36 }}></th>
            </tr></thead>
            <tbody>
              {f.labor.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...tdb, padding: "2px 6px" }}><input list="emp-list" style={cellInput} value={r.name} onChange={(e) => setLabor(i, "name", e.target.value)} placeholder="Employee name" /></td>
                  <td style={tdb}><input type="number" step="0.01" style={numCell} value={r.rate} onChange={(e) => setLabor(i, "rate", e.target.value)} /></td>
                  <td style={tdb}><input type="number" step="0.25" style={numCell} value={r.hours} onChange={(e) => setLabor(i, "hours", e.target.value)} placeholder="0" /></td>
                  <td style={{ ...tdb, textAlign: "right", paddingRight: 8, fontWeight: 700, fontSize: 13 }}>{money((Number(r.rate) || 0) * (Number(r.hours) || 0))}</td>
                  <td style={{ ...tdb, textAlign: "center" }}><button style={s.btnGhost} onClick={() => rmLabor(i)}><Icon name="x" size={14} color={DANGER} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="emp-list">{emps.map((e) => <option key={e.name} value={e.name} />)}</datalist>
        </div>
        <button style={{ ...s.btnSecondary, borderStyle: "dashed", color: GD }} onClick={addLabor}><Icon name="plus" size={13} color={GD} /> Add Labor Row</button>

        <SectionTitle>Materials</SectionTitle>
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={{ ...s.th, width: 64 }}>Photo</th><th style={{ ...s.th, width: 60, textAlign: "right" }}>Qty</th>
              <th style={s.th}>Material / Description</th><th style={{ ...s.th, width: 100, textAlign: "right" }}>Unit Cost</th>
              <th style={{ ...s.th, width: 100, textAlign: "right" }}>Line Total</th><th style={{ ...s.th, width: 36 }}></th>
            </tr></thead>
            <tbody>
              {f.materials.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...tdb, padding: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, border: `1px dashed ${BORDER}`, borderRadius: 6, cursor: "pointer", overflow: "hidden", background: PANEL, fontSize: 10, color: MUTED, textAlign: "center" }}>
                      {r.photo ? <img src={r.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "+ photo"}
                      <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => matPhoto(i, e.target.files?.[0])} />
                    </label>
                  </td>
                  <td style={tdb}><input type="number" step="1" style={numCell} value={r.qty} onChange={(e) => setMat(i, "qty", e.target.value)} placeholder="0" /></td>
                  <td style={tdb}><input style={cellInput} value={r.desc} onChange={(e) => setMat(i, "desc", e.target.value)} placeholder="Material / description" /></td>
                  <td style={tdb}><input type="number" step="0.01" style={numCell} value={r.cost} onChange={(e) => setMat(i, "cost", e.target.value)} placeholder="0.00" /></td>
                  <td style={{ ...tdb, textAlign: "right", paddingRight: 8, fontWeight: 700, fontSize: 13 }}>{money((Number(r.qty) || 0) * (Number(r.cost) || 0))}</td>
                  <td style={{ ...tdb, textAlign: "center" }}><button style={s.btnGhost} onClick={() => rmMat(i)}><Icon name="x" size={14} color={DANGER} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button style={{ ...s.btnSecondary, borderStyle: "dashed", color: GD }} onClick={addMat}><Icon name="plus" size={13} color={GD} /> Add Material Row</button>

        <SectionTitle>Site Photos</SectionTitle>
        {f.photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8, marginBottom: 10 }}>
            {f.photos.map((ph, i) => (
              <div key={i} style={{ position: "relative", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden", background: PANEL }}>
                <img src={ph.src} alt="" style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                <input style={{ width: "100%", border: "none", borderTop: `1px solid ${BORDER}`, padding: "4px 6px", fontSize: 11, outline: "none" }} placeholder="Caption" value={ph.caption} onChange={(e) => setCaption(i, e.target.value)} />
                <button onClick={() => rmPhoto(i)} style={{ position: "absolute", top: 3, right: 3, background: "rgba(0,0,0,.6)", border: "none", borderRadius: 4, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={11} color="#fff" /></button>
              </div>
            ))}
          </div>
        )}
        <label style={{ ...s.btnSecondary, borderStyle: "dashed", color: GD, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <Icon name="camera" size={14} color={GD} /> Add Photos
          <input type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} onChange={(e) => addPhotos(e.target.files)} />
        </label>

        <SectionTitle>Totals</SectionTitle>
        <div style={{ marginLeft: "auto", width: 360, maxWidth: "100%", background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 16px" }}>
          <TRow label="Labor Subtotal" val={money(laborTotal)} />
          <TRow label="Materials Subtotal" val={money(matSub)} />
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: MUTED }}>
            <span>Materials Markup <input type="number" step="0.1" value={f.markup_rate} onChange={(e) => setF({ ...f, markup_rate: e.target.value })} style={{ width: 56, textAlign: "right", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "1px 4px", fontSize: 12 }} /> %</span>
            <span>{money(matMarkup)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: MUTED }}>
            <span>Sales Tax <input type="number" step="0.001" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} style={{ width: 64, textAlign: "right", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "1px 4px", fontSize: 12 }} /> %</span>
            <span>{money(taxAmt)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: `2px solid ${G}`, marginTop: 6, paddingTop: 10, fontWeight: 900, fontSize: 18, color: INK }}><span>Grand Total</span><span>{money(grand)}</span></div>
        </div>

        <SectionTitle>Acknowledgement</SectionTitle>
        <div style={s.grid2}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={s.label}>Field Tech Signature</label>
              <button style={s.btnGhost} onClick={() => sigRef.current?.clear()}>Clear</button>
            </div>
            <SignaturePad ref={sigRef} height={120} />
          </div>
          <div>
            <div style={s.field}><label style={s.label}>Customer Printed Name</label><input style={s.input} value={f.customer_sign_name} onChange={(e) => setF({ ...f, customer_sign_name: e.target.value })} /></div>
            <div style={s.field}><label style={s.label}>Sign Date</label><input type="date" style={s.input} value={f.sign_date} onChange={(e) => setF({ ...f, sign_date: e.target.value })} /></div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button style={s.btnSecondary} onClick={onClose}>Cancel</button>
          <button style={{ ...s.btnPrimary, width: "auto", padding: "12px 26px" }} onClick={save} disabled={saving}>{saving ? "Saving…" : fromClockOut ? "Submit & Clock Out" : "Save T&M Report"}</button>
        </div>
      </div>
    </div>
  )
}
const SectionTitle = ({ children }) => (
  <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: "#fff", background: INK, padding: "7px 12px", margin: "20px 0 12px", borderLeft: `6px solid ${G}`, borderRadius: 3, fontWeight: 700 }}>{children}</div>
)
const TRow = ({ label, val }) => (<div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: MUTED }}><span>{label}</span><span>{val}</span></div>)

// ─── T&M printable document + viewer ─────────────────────────────────────────
function TMDocument({ sheet }) {
  return (
    <div className="tm-doc">
      <div className="tm-header">
        <Logo height={80} className="tm-brand-mark" />
        <div className="tm-doctitle">Time &amp; Material<br />Work Order<small>Field Service Report</small></div>
      </div>
      <div className="tm-meta-grid">
        <div className="tm-meta"><h3>From</h3>
          <div className="line"><strong>{COMPANY.name}</strong></div>
          {COMPANY.addr && <div className="line">{COMPANY.addr}</div>}
          {(COMPANY.phone || COMPANY.email) && <div className="line">{[COMPANY.phone, COMPANY.email].filter(Boolean).join(" · ")}</div>}
        </div>
        <div className="tm-meta"><h3>Job Details</h3>
          <div className="line"><strong>Job / Invoice #:</strong> {sheet.tm_number || "—"}</div>
          <div className="line"><strong>Date:</strong> {fmtDate(sheet.work_date)}</div>
          <div className="line"><strong>Submitted by:</strong> {sheet.employee_name}</div>
        </div>
      </div>
      <div className="tm-section"><div className="tm-h2">Customer Information</div>
        <div className="tm-meta-grid" style={{ marginBottom: 0 }}>
          <div className="tm-narr"><div className="lab">Customer</div><div className="val">{sheet.customer_name || "—"}</div></div>
          <div className="tm-narr"><div className="lab">Phone</div><div className="val">{sheet.customer_phone || "—"}</div></div>
          <div className="tm-narr"><div className="lab">Email</div><div className="val">{sheet.customer_email || "—"}</div></div>
          <div className="tm-narr"><div className="lab">Service Address</div><div className="val">{sheet.site_address || "—"}</div></div>
        </div>
      </div>
      <div className="tm-section"><div className="tm-h2">Work Narrative</div>
        <div className="tm-narr"><div className="lab">Customer Complaint</div><div className="val">{sheet.complaint || "—"}</div></div>
        <div className="tm-narr"><div className="lab">Work Performed</div><div className="val">{sheet.work_performed || "—"}</div></div>
        <div className="tm-narr"><div className="lab">Resolution</div><div className="val">{sheet.resolution || "—"}</div></div>
      </div>
      <div className="tm-section"><div className="tm-h2">Labor</div>
        <table className="tm-table"><thead><tr><th style={{ width: 30 }}>#</th><th>Employee</th><th className="num">Rate</th><th className="num">Hours</th><th className="num">Line Total</th></tr></thead>
          <tbody>{(sheet.labor || []).map((r, i) => (<tr key={i}><td>{i + 1}</td><td>{r.name}</td><td className="num">{money(r.rate)}</td><td className="num">{Number(r.hours).toFixed(2)}</td><td className="num">{money((Number(r.rate) || 0) * (Number(r.hours) || 0))}</td></tr>))}</tbody>
        </table>
      </div>
      {(sheet.materials || []).length > 0 && (
        <div className="tm-section"><div className="tm-h2">Materials</div>
          <table className="tm-table"><thead><tr><th style={{ width: 30 }}>#</th><th className="num">Qty</th><th>Material / Description</th><th className="num">Unit Cost</th><th className="num">Line Total</th></tr></thead>
            <tbody>{sheet.materials.map((r, i) => (<tr key={i}><td>{i + 1}</td><td className="num">{r.qty}</td><td>{r.desc}</td><td className="num">{money(r.cost)}</td><td className="num">{money((Number(r.qty) || 0) * (Number(r.cost) || 0))}</td></tr>))}</tbody>
          </table>
        </div>
      )}
      {(sheet.photos || []).length > 0 && (
        <div className="tm-section"><div className="tm-h2">Site Photos</div>
          <div className="tm-photo-grid">{sheet.photos.map((ph, i) => (<div className="tm-photo-card" key={i}><img src={ph.src} alt="" />{ph.caption && <div className="cap">{ph.caption}</div>}</div>))}</div>
        </div>
      )}
      <div className="tm-section"><div className="tm-h2">Totals</div>
        <div className="tm-totals">
          <div className="r sub"><span>Labor Subtotal</span><span>{money(sheet.labor_total)}</span></div>
          <div className="r sub"><span>Materials Subtotal</span><span>{money(sheet.materials_total)}</span></div>
          <div className="r sub"><span>Materials Markup ({sheet.markup_rate}%)</span><span>{money(sheet.materials_markup)}</span></div>
          <div className="r sub"><span>Sales Tax ({sheet.tax_rate}%)</span><span>{money(sheet.tax_amount)}</span></div>
          <div className="r grand"><span>Grand Total</span><span>{money(sheet.grand_total)}</span></div>
        </div>
      </div>
      <div className="tm-section"><div className="tm-h2">Acknowledgement</div>
        <div className="tm-sig-wrap">
          <div className="tm-sig-box"><div className="cap">Field Tech Signature</div><div className="pad">{sheet.tech_signature ? <img src={sheet.tech_signature} alt="signature" /> : <span style={{ color: FAINT, fontSize: 12 }}>Not signed</span>}</div></div>
          <div className="tm-sig-box"><div className="cap">Printed Name &amp; Date</div><div className="meta"><div><strong>Name:</strong> {sheet.customer_sign_name || "—"}</div><div><strong>Date:</strong> {fmtDate(sheet.sign_date) || "—"}</div></div></div>
        </div>
      </div>
      <div className="tm-foot">
        <strong>Thank you for choosing {COMPANY.name}.</strong><br />
        We appreciate your business and the opportunity to serve you. Payment is due upon receipt unless otherwise agreed in writing.{(COMPANY.phone || COMPANY.email) && <> For questions about this invoice, contact us at {[COMPANY.phone, COMPANY.email].filter(Boolean).map((v, i) => <span key={v}>{i > 0 && " or "}<strong>{v}</strong></span>)}.</>}
        <div className="sur">Note: A 3% processing fee applies to all credit/debit card payments.</div>
      </div>
    </div>
  )
}

function TMViewModal({ sheet, onClose }) {
  const print = () => {
    const old = document.title
    document.title = sheet.tm_number || "Empire-TM"
    const restore = () => { document.title = old; window.removeEventListener("afterprint", restore) }
    window.addEventListener("afterprint", restore)
    setTimeout(() => window.print(), 60)
  }
  const email = () => {
    const to = encodeURIComponent(sheet.customer_email || "")
    const subject = encodeURIComponent(`${COMPANY.name} Time & Material — ${sheet.tm_number} — ${sheet.customer_name}`)
    const body = encodeURIComponent(`Hello,\n\nPlease find attached the Time & Material report ${sheet.tm_number}, dated ${fmtDate(sheet.work_date)}.\n\nGrand Total: ${money(sheet.grand_total)}\n\nThank you for choosing ${COMPANY.name}.\n\n— ${COMPANY.name}${COMPANY.phone || COMPANY.email ? "\n" + [COMPANY.phone, COMPANY.email].filter(Boolean).join(" · ") : ""}`)
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  }
  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.modal, width: 860, padding: 0, overflow: "hidden" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontWeight: 800, color: INK }}>{sheet.tm_number} · {sheet.customer_name}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={s.btnSecondary} onClick={email}><Icon name="mail" size={14} /> Email</button>
            <button style={{ ...s.btnPrimary, width: "auto", padding: "9px 16px" }} onClick={print}><Icon name="printer" size={14} color="#fff" /> Print / Save PDF</button>
            <button style={s.btnGhost} onClick={onClose}><Icon name="x" size={18} /></button>
          </div>
        </div>
        <div className="tm-print-root" style={{ maxHeight: "80vh", overflowY: "auto" }}><TMDocument sheet={sheet} /></div>
      </div>
    </div>
  )
}

// ─── T&M Sheets list ──────────────────────────────────────────────────────────
function TMSheets({ user }) {
  const [sheets, setSheets] = useState([]); const [filter, setFilter] = useState("month")
  const [view, setView] = useState(null); const [create, setCreate] = useState(false)
  const load = async () => {
    let q = supabase.from("tm_sheets").select("*").order("created_at", { ascending: false })
    if (!user.is_admin) q = q.eq("employee_id", user.id)
    const cut = { week: 7, month: 30, year: 365 }
    if (filter !== "all") { const d = new Date(); d.setDate(d.getDate() - cut[filter]); q = q.gte("created_at", d.toISOString()) }
    const { data } = await q; setSheets(data || [])
  }
  useEffect(() => { load() }, [filter])
  const total = sheets.reduce((a, t) => a + (t.grand_total || 0), 0)
  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>T&amp;M Sheets</div><div style={s.pageSub}>{sheets.length} reports · {money(total)} total</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {["week", "month", "year", "all"].map((fl) => <button key={fl} style={fl === filter ? { ...s.btnSecondary, background: GSOFT, color: GD, borderColor: "#cde6cd", textTransform: "capitalize" } : { ...s.btnSecondary, textTransform: "capitalize" }} onClick={() => setFilter(fl)}>{fl}</button>)}
          <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setCreate(true)}><Icon name="plus" size={15} color="#fff" /> New T&amp;M</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {sheets.map((t) => (
          <div key={t.id} className="lift" onClick={() => setView(t)} style={{ ...s.card, marginBottom: 0, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: INK }}>{t.tm_number}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.customer_name}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{fmtDate(t.work_date)}{user.is_admin ? ` · ${t.employee_name}` : ""}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, color: GD, whiteSpace: "nowrap" }}>{money(t.grand_total)}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
              <span style={s.badge(GD, GSOFT)}>{(t.labor || []).length} crew</span>
              {(t.photos || []).length > 0 && <span style={s.badge(MUTED, "#eef0ec")}>{t.photos.length} photo</span>}
              {t.tech_signature && <span style={s.badge(GD, GSOFT)}>Signed</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: GD, fontWeight: 700 }}>View →</span>
            </div>
          </div>
        ))}
        {sheets.length === 0 && <div style={{ ...s.card, textAlign: "center", color: MUTED, padding: 40, marginBottom: 0, gridColumn: "1 / -1" }}>No T&amp;M reports for this period.</div>}
      </div>
      {view && <TMViewModal sheet={view} onClose={() => setView(null)} />}
      {create && <TMFormModal user={user} onClose={() => setCreate(false)} onSaved={() => { setCreate(false); load() }} />}
    </div>
  )
}

// ─── Reusable: Notes panel (jobs + customers) ─────────────────────────────────
function NotesPanel({ entityType, entityId, user }) {
  const [notes, setNotes] = useState([]); const [body, setBody] = useState(""); const [photos, setPhotos] = useState([]); const [saving, setSaving] = useState(false)
  const load = async () => { const { data } = await supabase.from("notes").select("*").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false }); setNotes(data || []) }
  useEffect(() => { load() }, [entityId])
  const addPhotos = async (files) => { const arr = []; for (const f of Array.from(files)) if (f.type.startsWith("image/")) arr.push(await readFileAsDataURL(f)); setPhotos((p) => [...p, ...arr]) }
  const save = async () => {
    if (!body.trim() && photos.length === 0) return
    setSaving(true)
    await supabase.from("notes").insert({ entity_type: entityType, entity_id: entityId, author_id: user.id, author_name: user.name, body, photo_urls: photos })
    setSaving(false); setBody(""); setPhotos([]); load()
  }
  return (
    <div>
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <textarea style={s.textarea} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a progress note…" />
        {photos.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>{photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: `1px solid ${BORDER}` }} />)}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <label style={{ ...s.btnSecondary, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}><Icon name="camera" size={14} /> Photos<input type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} onChange={(e) => addPhotos(e.target.files)} /></label>
          <button style={{ ...s.btnPrimary, width: "auto", padding: "9px 18px" }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Add Note"}</button>
        </div>
      </div>
      {notes.map((n) => (
        <div key={n.id} style={{ borderLeft: `3px solid ${G}`, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED, marginBottom: 6 }}><strong style={{ color: TEXT }}>{n.author_name}</strong><span>{fmtDateTime(n.created_at)}</span></div>
          {n.body && <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.body}</div>}
          {(n.photo_urls || []).length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{n.photo_urls.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${BORDER}` }} /></a>)}</div>}
        </div>
      ))}
      {notes.length === 0 && <div style={{ textAlign: "center", color: MUTED, padding: 16, fontSize: 13 }}>No notes yet.</div>}
    </div>
  )
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────
export function Jobs({ user, onOpenJob }) {
  const [jobs, setJobs] = useState([]); const [modal, setModal] = useState(null); const [form, setForm] = useState({})
  const [search, setSearch] = useState(""); const [sf, setSf] = useState("Active"); const [detail, setDetail] = useState(null)
  const load = async () => { const { data } = await supabase.from("jobs").select("*").order("name"); setJobs(data || []) }
  useEffect(() => { load() }, [])
  const save = async () => {
    if (form.id) await supabase.from("jobs").update(form).eq("id", form.id)
    else await supabase.from("jobs").insert({ ...form, color: form.is_service ? WARN : G })
    await load(); setModal(null)
  }
  const del = async (id) => { if (!confirm("Delete this job?")) return; await supabase.from("jobs").delete().eq("id", id); await load() }
  const sc = { Active: G, Paused: WARN, Closed: MUTED }
  const open = (j) => (onOpenJob ? onOpenJob(j) : setDetail(j))
  const filtered = jobs.filter((j) => (sf === "All" || j.status === sf) && (j.name.toLowerCase().includes(search.toLowerCase()) || (j.client || "").toLowerCase().includes(search.toLowerCase())))
  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>Jobs</div><div style={s.pageSub}>{filtered.length} showing</div></div>
        {user.is_admin && <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => { setForm({ status: "Active" }); setModal("job") }}><Icon name="plus" size={15} color="#fff" /> New Job</button>}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...s.input, maxWidth: 260 }} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {["Active", "Paused", "Closed", "All"].map((fl) => <button key={fl} style={fl === sf ? { ...s.btnSecondary, background: GSOFT, color: GD, borderColor: "#cde6cd" } : s.btnSecondary} onClick={() => setSf(fl)}>{fl}</button>)}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {filtered.map((j) => (
          <div key={j.id} style={{ ...s.card, borderLeft: `4px solid ${j.color || G}`, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => open(j)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: INK }}>{j.name}</span>
                  <span style={s.badge(sc[j.status] || MUTED)}>{j.status}</span>
                  {j.is_service && <span style={s.badge(WARN)}>Service</span>}
                </div>
                {j.client && <div style={{ fontSize: 13, color: MUTED, marginBottom: 3 }}>Client: <span style={{ color: TEXT }}>{j.client}</span></div>}
                {j.address && <div style={{ fontSize: 13, color: MUTED, display: "flex", alignItems: "center", gap: 4 }}><Icon name="pin" size={12} color={MUTED} />{j.address}</div>}
                {j.notes && <div style={{ fontSize: 13, color: TEXT, marginTop: 8, background: PANEL, padding: "8px 12px", borderRadius: 8 }}>{j.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={s.btnSecondary} onClick={() => open(j)}>{onOpenJob ? "Updates" : "Notes"}</button>
                {user.is_admin && <><button style={s.btnSecondary} onClick={() => { setForm({ ...j }); setModal("job") }}><Icon name="edit" size={14} /></button><button style={s.btnDanger} onClick={() => del(j.id)}><Icon name="trash" size={14} /></button></>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {modal === "job" && (
        <Modal title={form.id ? "Edit Job" : "New Job"} onClose={() => setModal(null)}>
          {[["name", "Job Name"], ["client", "Client"], ["address", "Address / Location"]].map(([k, l]) => <div key={k} style={s.field}><label style={s.label}>{l}</label><input style={s.input} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>)}
          <div style={s.field}><label style={s.label}>Status</label><select style={s.input} value={form.status || "Active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["Active", "Paused", "Closed"].map((v) => <option key={v}>{v}</option>)}</select></div>
          <div style={s.field}><label style={s.label}>Service Job (no fixed address)</label><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: MUTED }}><input type="checkbox" checked={form.is_service || false} onChange={(e) => setForm({ ...form, is_service: e.target.checked, address_required: e.target.checked })} /> Employee enters address + customer at clock-in; T&amp;M required at clock-out</label></div>
          <div style={s.field}><label style={s.label}>Notes / Site Instructions</label><textarea style={s.textarea} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button style={s.btnSecondary} onClick={() => setModal(null)}>Cancel</button><button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={save}>Save Job</button></div>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>{detail.client && <>Client: {detail.client} · </>}{detail.address}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>Progress Notes &amp; Photos</div>
          <NotesPanel entityType="job" entityId={detail.id} user={user} />
        </Modal>
      )}
    </div>
  )
}

// ─── Customers ────────────────────────────────────────────────────────────────
function Customers({ user }) {
  const [list, setList] = useState([]); const [search, setSearch] = useState(""); const [edit, setEdit] = useState(null)
  const load = async () => { const { data } = await supabase.from("customers").select("*").order("name"); setList(data || []) }
  useEffect(() => { load() }, [])
  const filtered = list.filter((c) => [c.name, c.company, c.email, c.city].some((v) => (v || "").toLowerCase().includes(search.toLowerCase())))
  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>Customers</div><div style={s.pageSub}>{list.length} in directory</div></div>
        {user.is_admin && <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setEdit({})}><Icon name="plus" size={15} color="#fff" /> Add Customer</button>}
      </div>
      <input style={{ ...s.input, marginBottom: 18, maxWidth: 320 }} placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {filtered.map((c) => (
          <div key={c.id} className="lift" onClick={() => setEdit({ ...c })} style={{ ...s.card, marginBottom: 0, cursor: "pointer", display: "flex", gap: 14, alignItems: "center" }}>
            <Avatar name={c.company || c.name} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
              {c.company && c.company !== c.name && <div style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.company}</div>}
              <div style={{ fontSize: 12, color: FAINT, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[c.phone, c.city ? `${c.city}${c.state ? ", " + c.state : ""}` : ""].filter(Boolean).join(" · ") || "No contact info"}</div>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <div style={{ ...s.card, textAlign: "center", color: MUTED, padding: 40 }}>No customers found.</div>}
      {edit && <CustomerModal cust={edit} user={user} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function CustomerModal({ cust, user, onClose, onSaved }) {
  const [f, setF] = useState({ ...cust }); const [saving, setSaving] = useState(false); const [err, setErr] = useState("")
  const isNew = !cust.id; const admin = user.is_admin
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    if (!f.name?.trim()) return setErr("Name is required.")
    setSaving(true)
    const fields = { name: f.name, company: f.company || "", phone: f.phone || "", email: f.email || "", address: f.address || "", city: f.city || "", state: f.state || "", notes: f.notes || "" }
    const { error } = isNew ? await supabase.from("customers").insert(fields) : await supabase.from("customers").update(fields).eq("id", cust.id)
    setSaving(false); if (error) return setErr("Save failed."); onSaved()
  }
  const del = async () => { if (!confirm("Delete this customer?")) return; await supabase.from("customers").delete().eq("id", cust.id); onSaved() }
  const Field = ({ k, label, type = "text", ph, span }) => (
    <div style={{ ...s.field, gridColumn: span ? "1 / -1" : "auto", marginBottom: 0 }}>
      <label style={s.label}>{label}</label>
      <input type={type} style={s.input} value={f[k] || ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </div>
  )
  return (
    <Modal title={isNew ? "Add Customer" : f.name} onClose={onClose} width={680}>
      {err && <div style={s.alert("error")}>{err}</div>}
      {admin ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {Field({ k: "name", label: "Name", ph: "John Smith / Domino's #7400" })}
          {Field({ k: "company", label: "Company" })}
          {Field({ k: "phone", label: "Phone", type: "tel" })}
          {Field({ k: "email", label: "Email", type: "email" })}
          {Field({ k: "address", label: "Address", span: true })}
          {Field({ k: "city", label: "City" })}
          {Field({ k: "state", label: "State" })}
          <div style={{ ...s.field, gridColumn: "1 / -1", marginBottom: 0 }}><label style={s.label}>Notes</label><textarea style={s.textarea} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
      ) : (
        <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.7, marginBottom: 8 }}>
          {f.company && <div style={{ color: MUTED }}>{f.company}</div>}
          {[f.phone, f.email].filter(Boolean).join(" · ")}<br />
          {[f.address, f.city, f.state].filter(Boolean).join(", ")}
        </div>
      )}

      {!isNew && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".5px", margin: "20px 0 10px" }}>Notes &amp; Photos</div>
          <NotesPanel entityType="customer" entityId={cust.id} user={user} />
        </>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
        <div>{admin && !isNew && <button style={s.btnDanger} onClick={del}><Icon name="trash" size={13} /> Delete</button>}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={s.btnSecondary} onClick={onClose}>Close</button>
          {admin && <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 24px" }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>}
        </div>
      </div>
    </Modal>
  )
}

// ─── Time Logs ────────────────────────────────────────────────────────────────
function TimeLogs({ user }) {
  const [logs, setLogs] = useState([]); const [filter, setFilter] = useState("week"); const [edit, setEdit] = useState(null); const [add, setAdd] = useState(false)
  const [emps, setEmps] = useState([]); const [jobs, setJobs] = useState([])
  const load = async () => {
    let q = supabase.from("time_logs").select("*").order("clock_in", { ascending: false })
    if (!user.is_admin) q = q.eq("employee_id", user.id)
    const cut = { today: 1, week: 7, month: 30 }
    if (filter !== "all") { const d = new Date(); d.setDate(d.getDate() - cut[filter]); q = q.gte("clock_in", d.toISOString()) }
    const { data } = await q; setLogs(data || [])
  }
  useEffect(() => { load() }, [filter])
  useEffect(() => { if (user.is_admin) { supabase.from("employees").select("*").eq("active", true).eq("is_owner", false).order("name").then(({ data }) => setEmps(data || [])); supabase.from("jobs").select("*").order("name").then(({ data }) => setJobs(data || [])) } }, [])
  const complete = logs.filter((l) => l.clock_out)
  const totalHrs = complete.reduce((a, l) => a + durationHours(l.clock_in, l.clock_out), 0)
  const saveEdit = async (l) => { await supabase.from("time_logs").update({ clock_in: l.clock_in, clock_out: l.clock_out, notes: l.notes }).eq("id", l.id); await load(); setEdit(null) }
  const del = async (id) => { if (!confirm("Delete this entry?")) return; await supabase.from("time_logs").delete().eq("id", id); await load() }
  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>{user.is_admin ? "All Time Logs" : "My Time Logs"}</div><div style={s.pageSub}>{logs.length} entries · {totalHrs.toFixed(1)} hrs</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {["today", "week", "month", "all"].map((fl) => <button key={fl} style={fl === filter ? { ...s.btnSecondary, background: GSOFT, color: GD, borderColor: "#cde6cd", textTransform: "capitalize" } : { ...s.btnSecondary, textTransform: "capitalize" }} onClick={() => setFilter(fl)}>{fl}</button>)}
          {user.is_admin && <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setAdd(true)}><Icon name="plus" size={14} color="#fff" /> Add Entry</button>}
        </div>
      </div>
      <div style={{ ...s.grid4, marginBottom: 22 }}>
        {[{ l: "Total Hours", v: totalHrs.toFixed(1) }, { l: "Entries", v: logs.length }, { l: "Active Now", v: logs.filter((x) => !x.clock_out).length }, { l: "Jobs", v: new Set(logs.map((x) => x.job_id)).size }].map((st) => <div key={st.l} style={s.statCard}><div style={s.statVal}>{st.v}</div><div style={s.statLabel}>{st.l}</div></div>)}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {logs.map((l) => (
          <div key={l.id} style={{ ...s.card, marginBottom: 0, padding: "14px 16px", borderLeft: `3px solid ${l.clock_out ? BORDER : G}`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.job_name}</div>
              <div style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.is_admin ? `${l.employee_name} · ` : ""}{l.customer_name ? `${l.customer_name} · ` : ""}{fmtDate(l.clock_in)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
              <div style={{ textAlign: "center" }}><div style={{ color: INK }}>{fmtTime(l.clock_in)}</div><div style={{ fontSize: 9, color: FAINT, fontFamily: "'DM Sans',sans-serif", letterSpacing: ".5px" }}>IN</div></div>
              <span style={{ color: FAINT }}>→</span>
              <div style={{ textAlign: "center", minWidth: 52 }}>{l.clock_out ? <><div style={{ color: INK }}>{fmtTime(l.clock_out)}</div><div style={{ fontSize: 9, color: FAINT, fontFamily: "'DM Sans',sans-serif", letterSpacing: ".5px" }}>OUT</div></> : <span style={s.badge(GD, GSOFT)}>Active</span>}</div>
              <div style={{ minWidth: 60, textAlign: "right", color: GD, fontWeight: 700 }}>{duration(l.clock_in, l.clock_out)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {hasGps(l.location_cur_lat) || hasGps(l.location_in_lat) ? <a href={mapsLink(hasGps(l.location_cur_lat) ? l.location_cur_lat : l.location_in_lat, hasGps(l.location_cur_lat) ? l.location_cur_lng : l.location_in_lng)} target="_blank" rel="noreferrer" style={{ ...s.badge(GD, GSOFT), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="pin" size={11} color={GD} />Map</a> : <span style={s.badge(MUTED, "#eef0ec")}>No GPS</span>}
              {user.is_admin && <><button style={{ ...s.btnSecondary, padding: "8px 10px" }} onClick={() => setEdit({ ...l })}><Icon name="edit" size={13} /></button><button style={{ ...s.btnDanger, padding: "8px 10px" }} onClick={() => del(l.id)}><Icon name="trash" size={13} /></button></>}
            </div>
          </div>
        ))}
        {logs.length === 0 && <div style={{ ...s.card, textAlign: "center", color: MUTED, padding: 40, marginBottom: 0 }}>No time logs for this period.</div>}
      </div>
      {edit && (
        <Modal title="Edit Time Entry" onClose={() => setEdit(null)}>
          <div style={s.field}><label style={s.label}>Clock In</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" style={s.input} value={toLocalDate(edit.clock_in)} onChange={(e) => setEdit({ ...edit, clock_in: combineLocal(e.target.value, toLocalTime(edit.clock_in) || "00:00") })} />
              <input type="time" style={s.input} value={toLocalTime(edit.clock_in)} onChange={(e) => setEdit({ ...edit, clock_in: combineLocal(toLocalDate(edit.clock_in) || todayStr(), e.target.value) })} />
            </div>
          </div>
          <div style={s.field}><label style={s.label}>Clock Out</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" style={s.input} value={toLocalDate(edit.clock_out)} onChange={(e) => setEdit({ ...edit, clock_out: combineLocal(e.target.value, toLocalTime(edit.clock_out) || "00:00") })} />
              <input type="time" style={s.input} value={toLocalTime(edit.clock_out)} onChange={(e) => setEdit({ ...edit, clock_out: combineLocal(toLocalDate(edit.clock_out) || todayStr(), e.target.value) })} />
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>Both blank = shift stays active (not clocked out).</div>
          </div>
          <div style={s.field}><label style={s.label}>Notes</label><input style={s.input} value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button style={s.btnSecondary} onClick={() => setEdit(null)}>Cancel</button><button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={() => saveEdit(edit)}>Save</button></div>
        </Modal>
      )}
      {add && <AddEntryModal emps={emps} jobs={jobs} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); load() }} />}
    </div>
  )
}

function AddEntryModal({ emps, jobs, onClose, onSaved }) {
  const [f, setF] = useState({ employee_id: "", job_id: "", clock_in: "", clock_out: "", notes: "" })
  const [err, setErr] = useState("")
  const save = async () => {
    const emp = emps.find((e) => e.id === f.employee_id); const job = jobs.find((j) => j.id === f.job_id)
    if (!emp || !job || !f.clock_in) return setErr("Employee, job, and clock-in time are required.")
    await supabase.from("time_logs").insert({
      employee_id: emp.id, employee_name: emp.name, job_id: job.id, job_name: job.name,
      clock_in: f.clock_in, clock_out: f.clock_out || null,
      notes: f.notes, site_address: job.address || "", customer_name: job.client || "", is_service: isServiceJob(job),
    })
    onSaved()
  }
  return (
    <Modal title="Add Time Entry" onClose={onClose}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={s.grid2}>
        <div style={s.field}><label style={s.label}>Employee</label><select style={s.input} value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}><option value="">— Select —</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        <div style={s.field}><label style={s.label}>Job</label><select style={s.input} value={f.job_id} onChange={(e) => setF({ ...f, job_id: e.target.value })}><option value="">— Select —</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select></div>
        <div style={s.field}><label style={s.label}>Clock In</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" style={s.input} value={toLocalDate(f.clock_in)} onChange={(e) => setF({ ...f, clock_in: combineLocal(e.target.value, toLocalTime(f.clock_in) || "08:00") })} />
            <input type="time" style={s.input} value={toLocalTime(f.clock_in)} onChange={(e) => setF({ ...f, clock_in: combineLocal(toLocalDate(f.clock_in) || todayStr(), e.target.value) })} />
          </div>
        </div>
        <div style={s.field}><label style={s.label}>Clock Out</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" style={s.input} value={toLocalDate(f.clock_out)} onChange={(e) => setF({ ...f, clock_out: combineLocal(e.target.value, toLocalTime(f.clock_out) || "00:00") })} />
            <input type="time" style={s.input} value={toLocalTime(f.clock_out)} onChange={(e) => setF({ ...f, clock_out: combineLocal(toLocalDate(f.clock_out) || todayStr(), e.target.value) })} />
          </div>
        </div>
      </div>
      <div style={s.field}><label style={s.label}>Notes</label><input style={s.input} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button style={s.btnSecondary} onClick={onClose}>Cancel</button><button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={save}>Add Entry</button></div>
    </Modal>
  )
}

// ─── Timecards (weekly sign-off) ──────────────────────────────────────────────
function Timecards({ user }) {
  const [weeks, setWeeks] = useState([]); const [cards, setCards] = useState([]); const [sign, setSign] = useState(null)
  const load = async () => {
    if (user.is_admin) {
      const { data } = await supabase.from("timecards").select("*").order("week_start", { ascending: false })
      setCards(data || [])
    } else {
      const since = new Date(); since.setDate(since.getDate() - 56)
      const { data: logs } = await supabase.from("time_logs").select("*").eq("employee_id", user.id).not("clock_out", "is", null).gte("clock_in", since.toISOString()).order("clock_in", { ascending: false })
      const { data: tc } = await supabase.from("timecards").select("*").eq("employee_id", user.id)
      const map = {}
      ;(logs || []).forEach((l) => { const w = weekStart(l.clock_in); (map[w] ||= { week: w, hours: 0, entries: [] }); map[w].hours += durationHours(l.clock_in, l.clock_out); map[w].entries.push(l) })
      const arr = Object.values(map).sort((a, b) => b.week.localeCompare(a.week)).map((w) => ({ ...w, card: (tc || []).find((c) => c.week_start === w.week) }))
      setWeeks(arr)
    }
  }
  useEffect(() => { load() }, [])
  const approve = async (c) => { await supabase.from("timecards").update({ status: "Approved", approved_by: user.name, approved_at: new Date().toISOString() }).eq("id", c.id); await pushNotification("Timecard Approved", `${c.employee_name}'s week of ${weekLabel(c.week_start)} approved.`); load() }

  if (user.is_admin) {
    return (
      <div>
        <div style={s.pageHeader}><div><div style={s.pageTitle}>Timecards</div><div style={s.pageSub}>{cards.length} submitted · {cards.filter((c) => c.status === "Submitted").length} awaiting approval</div></div></div>
        <div style={s.card}>
          <table style={s.table}>
            <thead><tr><th style={s.th}>Employee</th><th style={s.th}>Week</th><th style={s.th}>Hours</th><th style={s.th}>Status</th><th style={s.th}>Signature</th><th style={s.th}></th></tr></thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{c.employee_name}</td>
                  <td style={s.td}>{weekLabel(c.week_start)}</td>
                  <td style={{ ...s.td, color: GD, fontWeight: 700 }}>{Number(c.total_hours).toFixed(1)}</td>
                  <td style={s.td}><span style={s.badge(c.status === "Approved" ? GD : WARN, c.status === "Approved" ? GSOFT : "#fdf3e3")}>{c.status}</span></td>
                  <td style={s.td}>{c.signature ? <img src={c.signature} alt="" style={{ height: 30 }} /> : "—"}</td>
                  <td style={s.td}>{c.status === "Submitted" && <button style={{ ...s.btnPrimary, width: "auto", padding: "8px 16px" }} onClick={() => approve(c)}>Approve</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cards.length === 0 && <div style={{ textAlign: "center", color: MUTED, padding: 40 }}>No timecards submitted yet.</div>}
        </div>
      </div>
    )
  }
  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageTitle}>My Timecards</div><div style={s.pageSub}>Review and sign off on your weekly hours</div></div></div>
      <div style={{ display: "grid", gap: 12 }}>
        {weeks.map((w) => (
          <div key={w.week} style={{ ...s.card, marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: INK }}>{weekLabel(w.week)}</div>
              <div style={{ fontSize: 13, color: MUTED }}>{w.entries.length} entries · <span style={{ color: GD, fontWeight: 700 }}>{w.hours.toFixed(1)} hrs</span></div>
            </div>
            {w.card ? <span style={s.badge(w.card.status === "Approved" ? GD : WARN, w.card.status === "Approved" ? GSOFT : "#fdf3e3")}>{w.card.status === "Approved" ? "✓ Approved" : "Submitted"}</span>
              : <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 20px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setSign(w)}><Icon name="pen" size={14} color="#fff" /> Review &amp; Sign</button>}
          </div>
        ))}
        {weeks.length === 0 && <div style={{ ...s.card, textAlign: "center", color: MUTED, padding: 40 }}>No completed hours in the last 8 weeks.</div>}
      </div>
      {sign && <SignTimecardModal user={user} week={sign} onClose={() => setSign(null)} onSaved={() => { setSign(null); load() }} />}
    </div>
  )
}

function SignTimecardModal({ user, week, onClose, onSaved }) {
  const sigRef = useRef(null); const [saving, setSaving] = useState(false); const [err, setErr] = useState("")
  const submit = async () => {
    if (sigRef.current?.isEmpty()) return setErr("Please sign to certify your hours.")
    setSaving(true)
    const { error } = await supabase.from("timecards").upsert({
      employee_id: user.id, employee_name: user.name, week_start: week.week, total_hours: +week.hours.toFixed(2),
      entries: week.entries.map((e) => ({ job: e.job_name, in: e.clock_in, out: e.clock_out, hrs: durationHours(e.clock_in, e.clock_out) })),
      status: "Submitted", signature: sigRef.current.toDataURL(), submitted_at: new Date().toISOString(),
    }, { onConflict: "employee_id,week_start" })
    setSaving(false)
    if (error) return setErr("Failed to submit. Try again.")
    await pushNotification("Timecard Submitted", `${user.name} signed off ${week.hours.toFixed(1)} hrs for ${weekLabel(week.week)}.`)
    onSaved()
  }
  return (
    <Modal title={`Timecard — ${weekLabel(week.week)}`} onClose={onClose}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
        <table style={s.table}><thead><tr><th style={s.th}>Job</th><th style={s.th}>Date</th><th style={s.th}>In</th><th style={s.th}>Out</th><th style={{ ...s.th, textAlign: "right" }}>Hrs</th></tr></thead>
          <tbody>{week.entries.map((e) => <tr key={e.id}><td style={s.td}>{e.job_name}</td><td style={{ ...s.td, color: MUTED }}>{fmtDate(e.clock_in)}</td><td style={{ ...s.td, fontSize: 12 }}>{fmtTime(e.clock_in)}</td><td style={{ ...s.td, fontSize: 12 }}>{fmtTime(e.clock_out)}</td><td style={{ ...s.td, textAlign: "right" }}>{durationHours(e.clock_in, e.clock_out).toFixed(1)}</td></tr>)}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 17, marginBottom: 16 }}><span>Total</span><span style={{ color: GD }}>{week.hours.toFixed(1)} hrs</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><label style={s.label}>Your Signature</label><button style={s.btnGhost} onClick={() => sigRef.current?.clear()}>Clear</button></div>
      <SignaturePad ref={sigRef} height={110} />
      <div style={{ fontSize: 12, color: MUTED, margin: "6px 0 16px" }}>By signing, you certify these hours are accurate.</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button style={s.btnSecondary} onClick={onClose}>Cancel</button><button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={submit} disabled={saving}>{saving ? "Submitting…" : "Submit Timecard"}</button></div>
    </Modal>
  )
}

// ─── Crew Map ─────────────────────────────────────────────────────────────────
function CrewMap() {
  const mapEl = useRef(null); const mapObj = useRef(null); const markers = useRef([])
  const [crew, setCrew] = useState([]); const [error, setError] = useState("")
  const load = async () => {
    const { data } = await supabase.from("time_logs").select("*").is("clock_out", null).order("clock_in", { ascending: false })
    setCrew(data || [])
    return data || []
  }
  const plot = (maps, data) => {
    markers.current.forEach((m) => m.setMap(null)); markers.current = []
    const bounds = new maps.LatLngBounds(); let any = false
    data.forEach((l) => {
      const lat = hasGps(l.location_cur_lat) ? l.location_cur_lat : l.location_in_lat
      const lng = hasGps(l.location_cur_lat) ? l.location_cur_lng : l.location_in_lng
      if (!hasGps(lat)) return
      const ll = { lat: Number(lat), lng: Number(lng) }
      const mk = new maps.Marker({ position: ll, map: mapObj.current, title: `${l.employee_name} · ${l.job_name}`,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: G, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 } })
      const upd = l.location_cur_at ? `<br>updated ${fmtTime(l.location_cur_at)}` : ""
      const info = new maps.InfoWindow({ content: `<div style="font-family:sans-serif;font-size:13px"><strong>${l.employee_name}</strong><br>${l.job_name}<br>${l.customer_name || ""}<br>since ${fmtTime(l.clock_in)}${upd}</div>` })
      mk.addListener("click", () => info.open(mapObj.current, mk))
      markers.current.push(mk); bounds.extend(ll); any = true
    })
    if (any) { mapObj.current.fitBounds(bounds); if (markers.current.length === 1) mapObj.current.setZoom(14) }
  }
  useEffect(() => {
    let alive = true
    // Google calls this when it rejects the key (website not allowed, billing off, API not enabled).
    window.gm_authFailure = () => setError(`Google rejected the Maps key for ${location.host}. In Google Cloud → Credentials, add https://${location.host}/* to the key's allowed websites, and make sure billing and the Maps JavaScript API are on.`)
    ;(async () => {
      let maps
      try { maps = await loadGoogleMaps() }
      catch (e) { if (alive) setError(`Google Maps didn't load (${e.message}). A content blocker or network filter may be blocking maps.googleapis.com.`); return }
      if (!alive) return
      try {
        mapObj.current = new maps.Map(mapEl.current, { center: DEFAULT_CENTER, zoom: 11, mapTypeControl: false, streetViewControl: false })
      } catch (e) { setError(`Map couldn't start: ${e.message}`); return }
      try { plot(maps, await load()) }
      catch (e) { setError(`Map loaded, but crew pins failed: ${e.message}`) }
    })()
    const iv = setInterval(async () => { if (window.google?.maps) plot(window.google.maps, await load()) }, 30000)
    return () => { alive = false; clearInterval(iv) }
  }, [])
  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageTitle}>Crew Map</div><div style={s.pageSub}>{crew.length} clocked in right now · auto-refreshes</div></div></div>
      {error && <div style={s.alert("error")}>{error}</div>}
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ ...s.card, padding: 0, overflow: "hidden", height: 460 }}><div ref={mapEl} style={{ width: "100%", height: "100%" }} /></div>
        <div style={s.card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 12 }}>Active Crew</div>
          {crew.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>Nobody is clocked in right now.</div>}
          {crew.map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BG}` }}>
              <div><div style={{ fontWeight: 700 }}>{l.employee_name}</div><div style={{ fontSize: 12, color: MUTED }}>{l.job_name}{l.customer_name ? ` · ${l.customer_name}` : ""} · since {fmtTime(l.clock_in)}{l.location_cur_at ? ` · updated ${fmtTime(l.location_cur_at)}` : ""}</div></div>
              {hasGps(l.location_cur_lat) || hasGps(l.location_in_lat)
                ? <a href={mapsLink(hasGps(l.location_cur_lat) ? l.location_cur_lat : l.location_in_lat, hasGps(l.location_cur_lat) ? l.location_cur_lng : l.location_in_lng)} target="_blank" rel="noreferrer" style={{ ...s.badge(GD, GSOFT), textDecoration: "none" }}>Map</a>
                : <span style={s.badge(MUTED, "#eef0f2")}>No GPS</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Employees ────────────────────────────────────────────────────────────────
const ROLE_SUGGESTIONS = ["Director of Electrical & Integrated Technologies", "Electrical Division Controller & Administrative Operations", "Project Manager | Field Superintendent", "Foreman", "Journeyman", "Apprentice", "Laborer"]

// Admin-only account actions run server-side (Supabase Edge Function) so the
// service key never reaches the browser.
async function adminUsers(body) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body })
  if (error) {
    let msg = "Request failed."
    try { msg = (await error.context.json()).error || msg } catch (_) {}
    return { error: msg }
  }
  return data
}


function Employees({ me }) {
  const [emps, setEmps] = useState([]); const [edit, setEdit] = useState(null); const [search, setSearch] = useState("")
  const load = async () => { const { data } = await supabase.from("employees").select("*").eq("is_owner", false).order("name"); setEmps(data || []) }
  useEffect(() => { load() }, [])
  const filtered = emps.filter((e) => [e.name, e.email, e.role].some((v) => (v || "").toLowerCase().includes(search.toLowerCase())))
  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>Team</div><div style={s.pageSub}>{emps.filter((e) => e.active).length} active · {emps.length} total</div></div>
        {me?.is_super && <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setEdit({ role: "Apprentice" })}><Icon name="plus" size={15} color="#fff" /> Add Member</button>}
      </div>
      <input style={{ ...s.input, maxWidth: 300, marginBottom: 18 }} placeholder="Search team…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {filtered.map((e) => (
          <div key={e.id} className="lift" onClick={() => setEdit({ ...e })} style={{ ...s.card, marginBottom: 0, cursor: "pointer", display: "flex", gap: 14, alignItems: "center", opacity: e.active ? 1 : 0.6 }}>
            <Avatar name={e.name} src={e.photo_url} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
              <div style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.role}{e.phone ? ` · ${e.phone}` : ""}</div>
              <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
                <span style={s.badge(e.active ? GD : MUTED, e.active ? GSOFT : "#eef0f2")}>{e.active ? "Active" : "Inactive"}</span>
                {e.is_admin && <span style={s.badge("#8b5cf6")}>Admin</span>}
                {e.gps_required === false && <span style={s.badge(WARN, "#fdf3e3")}>GPS off</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <div style={{ ...s.card, textAlign: "center", color: MUTED, padding: 40 }}>No team members found.</div>}
      {edit && <EmployeeModal emp={edit} me={me} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function EmployeeModal({ emp, me, onClose, onSaved }) {
  const [f, setF] = useState({ ...emp })
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false); const [uploading, setUploading] = useState(false)
  const [tempPw, setTempPw] = useState("")
  const isNew = !emp.id
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const uploadPhoto = async (file) => {
    if (!file) return
    setUploading(true); setErr("")
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase()
    const path = `${emp.id || "new"}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from("employee-photos").upload(path, file, { upsert: true, contentType: file.type })
    if (error) { setUploading(false); return setErr("Photo upload failed. Try a smaller image.") }
    const { data } = supabase.storage.from("employee-photos").getPublicUrl(path)
    set("photo_url", data.publicUrl); setUploading(false)
  }

  const save = async () => {
    if (!f.name?.trim()) return setErr("Name is required.")
    if (!f.email?.trim()) return setErr("Email is required.")
    setSaving(true); setErr("")
    const fields = {
      name: f.name.trim(), email: f.email?.toLowerCase().trim(), phone: f.phone || "", role: f.role || "Apprentice",
      is_admin: !!f.is_admin, gps_required: f.gps_required !== false, photo_url: f.photo_url || "",
      address: f.address || "", city: f.city || "", state: f.state || "", zip: f.zip || "",
      emergency_contact: f.emergency_contact || "", emergency_phone: f.emergency_phone || "",
      hire_date: f.hire_date || null, pay_rate: f.pay_rate ? Number(f.pay_rate) : 0,
      license_number: f.license_number || "", notes: f.notes || "",
    }
    if (isNew) {
      const res = await adminUsers({ action: "create", employee: fields })
      setSaving(false)
      if (res.error) return setErr(res.error)
      setTempPw(res.temp_password); setF((p) => ({ ...p, id: res.id }))
      return
    }
    if (fields.email !== (emp.email || "").toLowerCase()) {
      const res = await adminUsers({ action: "update_email", id: emp.id, email: fields.email })
      if (res.error) { setSaving(false); return setErr(res.error) }
    }
    const { email: _e, ...rest } = fields
    const { error } = await supabase.from("employees").update(rest).eq("id", emp.id)
    setSaving(false)
    if (error) return setErr("Save failed. Try again.")
    onSaved()
  }
  const toggleActive = async () => {
    if (emp.id === me?.id) return setErr("You can't deactivate your own account.")
    const res = await adminUsers({ action: "set_access", id: emp.id, enabled: !f.active })
    if (res.error) return setErr(res.error)
    onSaved()
  }
  const resetPw = async () => {
    if (!confirm(`Give ${f.name} a new temporary password? Their current password stops working.`)) return
    const res = await adminUsers({ action: "reset_password", id: emp.id })
    if (res.error) return setErr(res.error)
    setTempPw(res.temp_password)
  }

  if (tempPw) return (
    <Modal title={isNew ? "Team member added" : "Password reset"} onClose={onSaved} width={460}>
      <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.6, marginBottom: 14 }}>Give <strong>{f.name}</strong> this temporary password. They'll set their own the first time they sign in.</div>
      <div style={{ ...s.card, background: PANEL, textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{f.email}</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "1px", color: INK, userSelect: "all" }}>{tempPw}</div>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>This is shown once. Copy it now.</div>
      <button style={s.btnPrimary} onClick={onSaved}>Done</button>
    </Modal>
  )

  // plain function (not a component) so inputs don't lose focus on re-render
  const Field = ({ k, label, type = "text", ph, span }) => (
    <div style={{ ...s.field, gridColumn: span ? "1 / -1" : "auto", marginBottom: 0 }}>
      <label style={s.label}>{label}</label>
      <input type={type} style={s.input} value={f[k] || ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </div>
  )

  return (
    <Modal title={isNew ? "Add Team Member" : f.name} onClose={onClose} width={720}>
      {err && <div style={s.alert("error")}>{err}</div>}

      {/* Photo + identity */}
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${BORDER}` }}>
        <Avatar name={f.name} src={f.photo_url} size={88} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ ...s.btnSecondary, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <Icon name="camera" size={14} /> {uploading ? "Uploading…" : f.photo_url ? "Change Photo" : "Upload Photo"}
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
          </label>
          {f.photo_url && <button style={s.btnGhost} onClick={() => set("photo_url", "")}>Remove photo</button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {Field({ k: "name", label: "Full Name", ph: "John Smith" })}
        {me?.is_super || isNew ? Field({ k: "email", label: "Email (login)", type: "email", ph: `john@${BRAND.emailDomain}` })
          : <div style={{ ...s.field, marginBottom: 0 }}><label style={s.label}>Email (login)</label><input style={{ ...s.input, background: PANEL, color: MUTED }} value={f.email || ""} disabled title="Only the super admin can change logins" /></div>}
        {Field({ k: "phone", label: "Phone", type: "tel", ph: "(775) 555-0000" })}
        <div style={{ ...s.field, marginBottom: 0 }}>
          <label style={s.label}>Title</label>
          <input style={s.input} list="role-suggestions" value={f.role || ""} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Journeyman" />
          <datalist id="role-suggestions">{ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        {Field({ k: "hire_date", label: "Hire Date", type: "date" })}
        {Field({ k: "pay_rate", label: "Pay Rate ($/hr)", type: "number", ph: "0.00" })}
        {Field({ k: "address", label: "Address", span: true, ph: "123 Main St" })}
        {Field({ k: "city", label: "City" })}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {Field({ k: "state", label: "State" })}
          {Field({ k: "zip", label: "ZIP" })}
        </div>
        {Field({ k: "emergency_contact", label: "Emergency Contact", ph: "Name" })}
        {Field({ k: "emergency_phone", label: "Emergency Phone", type: "tel" })}
        {Field({ k: "license_number", label: "License / Cert #", span: true, ph: "Electrical card, OSHA, driver's license…" })}
        <div style={{ ...s.field, gridColumn: "1 / -1", marginBottom: 0 }}>
          <label style={s.label}>Notes</label>
          <textarea style={s.textarea} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "18px 0", padding: "14px 16px", background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}><input type="checkbox" checked={f.is_admin || false} disabled={emp.id === me?.id || !me?.is_super} onChange={(e) => set("is_admin", e.target.checked)} /> Admin access{!me?.is_super && <span style={{ fontWeight: 400, color: MUTED }}> (super admin only)</span>}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}><input type="checkbox" checked={f.gps_required !== false} onChange={(e) => set("gps_required", e.target.checked)} /> Require GPS for clock-in</label>
      </div>

      {isNew && <div style={s.alert("success")}>Saving creates their login and shows a one-time temporary password.</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {!isNew && me?.is_super && <button style={s.btnSecondary} onClick={toggleActive}>{f.active ? "Deactivate" : "Activate"}</button>}
          {!isNew && me?.is_super && <button style={s.btnWarn} onClick={resetPw}>Reset Password</button>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={s.btnSecondary} onClick={onClose}>Cancel</button>
          <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 24px" }} onClick={save} disabled={saving || uploading}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────
function NotificationCenter({ user }) {
  const [notifs, setNotifs] = useState([])
  const load = async () => { const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(60); setNotifs(data || []) }
  useEffect(() => { load(); const ch = supabase.channel("notifs-live").on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, load).subscribe(); return () => supabase.removeChannel(ch) }, [])
  const markAll = async () => { await supabase.from("notifications").update({ read: true }).eq("read", false); load() }
  const clear = async () => { await supabase.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000"); setNotifs([]) }
  const unread = notifs.filter((n) => !n.read).length
  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageTitle}>Notifications</div><div style={s.pageSub}>{unread} unread</div></div><div style={{ display: "flex", gap: 8 }}>{unread > 0 && <button style={s.btnSecondary} onClick={markAll}>Mark all read</button>}{user.is_admin && notifs.length > 0 && <button style={s.btnDanger} onClick={clear}>Clear all</button>}</div></div>
      {notifs.length === 0 ? <div style={{ ...s.card, textAlign: "center", padding: 48, color: MUTED }}><Icon name="bell" size={30} color={BORDER} /><div style={{ marginTop: 12 }}>No notifications yet.</div></div>
        : notifs.map((n) => (
          <div key={n.id} style={{ ...s.card, marginBottom: 8, borderLeft: `3px solid ${n.read ? BORDER : G}`, opacity: n.read ? 0.7 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div><div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div><div style={{ fontSize: 13, color: MUTED }}>{n.body}</div></div>
              <div style={{ fontSize: 11, color: FAINT, whiteSpace: "nowrap" }}>{fmtDateTime(n.created_at)}</div>
            </div>
          </div>
        ))}
    </div>
  )
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export function Profile({ user, setUser }) {
  const [form, setForm] = useState({ ...user }); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [saved, setSaved] = useState(false); const [err, setErr] = useState("")
  const save = async () => {
    setErr("")
    if (pw && pw.length < 8) return setErr("Password must be at least 8 characters.")
    if (pw && pw !== pw2) return setErr("Passwords don't match.")
    if (pw) { const { error: pe } = await supabase.auth.updateUser({ password: pw }); if (pe) return setErr("Couldn't change your password. Try a different one.") }
    const up = { name: form.name, phone: form.phone }
    const { error } = await supabase.from("employees").update(up).eq("id", user.id)
    if (error) return setErr("Failed to save. Try again.")
    setUser({ ...user, ...up }); setPw(""); setPw2(""); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }
  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageTitle}>My Profile</div><div style={s.pageSub}>Manage your account</div></div></div>
      <div style={{ maxWidth: 480 }}>
        {saved && <div style={s.alert("success")}>Saved!</div>}
        {err && <div style={s.alert("error")}>{err}</div>}
        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22, paddingBottom: 18, borderBottom: `1px solid ${BORDER}` }}>
            <Avatar name={user.name} src={user.photo_url} size={54} />
            <div><div style={{ fontWeight: 800, fontSize: 18, color: INK }}>{user.name}</div><div style={{ color: MUTED, fontSize: 13 }}>{user.is_owner ? "Owner" : user.role} · {user.email}</div></div>
          </div>
          {[["name", "Full Name"], ["phone", "Phone"]].map(([k, l]) => <div key={k} style={s.field}><label style={s.label}>{l}</label><input style={s.input} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>)}
          <div style={s.field}><label style={s.label}>Email (login)</label><input style={{ ...s.input, background: PANEL, color: MUTED }} value={user.email} readOnly /><div style={{ fontSize: 11, color: FAINT, marginTop: 5 }}>An admin can change your login email from the Team page.</div></div>
        </div>
        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Icon name="lock" size={16} color={GD} /><span style={{ fontWeight: 800, color: INK }}>Change Password</span></div>
          <div style={s.field}><label style={s.label}>New Password</label><input style={s.input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" /></div>
          <div style={s.field}><label style={s.label}>Confirm</label><input style={s.input} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter" /></div>
        </div>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "11px 30px" }} onClick={save}>Save Changes</button>
      </div>
    </div>
  )
}

// ─── QuickBooks Export ────────────────────────────────────────────────────────
function Export() {
  const [range, setRange] = useState("week"); const [fmt, setFmt] = useState("iif"); const [done, setDone] = useState(false); const [count, setCount] = useState(0); const [hrs, setHrs] = useState(0)
  useEffect(() => {
    (async () => {
      let q = supabase.from("time_logs").select("clock_in,clock_out").not("clock_out", "is", null)
      const cut = { today: 1, week: 7, month: 30 }
      if (range !== "all") { const d = new Date(); d.setDate(d.getDate() - cut[range]); q = q.gte("clock_in", d.toISOString()) }
      const { data } = await q; setCount(data?.length || 0); setHrs((data || []).reduce((a, l) => a + durationHours(l.clock_in, l.clock_out), 0))
    })()
  }, [range])
  const run = async () => {
    let q = supabase.from("time_logs").select("*").not("clock_out", "is", null)
    const cut = { today: 1, week: 7, month: 30 }
    if (range !== "all") { const d = new Date(); d.setDate(d.getDate() - cut[range]); q = q.gte("clock_in", d.toISOString()) }
    const { data: logs } = await q
    if (!logs?.length) return alert("No completed time entries for this period.")
    if (fmt === "iif") {
      const lines = ["!TIMERTXN\tTIMER_TXNTYPE\tDATE\tJOBNAME\tEMP\tPAYROLL_ITEM\tDURATION\tNOTES"]
      logs.forEach((l) => lines.push(`TIMERTXN\tTIMER\t${fmtDate(l.clock_in)}\t${l.job_name}\t${l.employee_name}\tHourly\t${durationHours(l.clock_in, l.clock_out).toFixed(2)}\t${l.notes || ""}`))
      dl("empire_timecard.iif", lines.join("\n"), "text/plain")
    } else {
      const h = "Employee,Job,Customer,Site Address,Date,Clock In,Clock Out,Hours,Notes"
      const rows = logs.map((l) => [l.employee_name, l.job_name, l.customer_name || "", l.site_address || "", fmtDate(l.clock_in), fmtTime(l.clock_in), fmtTime(l.clock_out), durationHours(l.clock_in, l.clock_out).toFixed(2), l.notes || ""].map((v) => `"${v}"`).join(",")).join("\n")
      dl("empire_timecard.csv", h + "\n" + rows, "text/csv")
    }
    setDone(true); setTimeout(() => setDone(false), 3000)
  }
  const dl = (name, content, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click() }
  return (
    <div>
      <div style={s.pageHeader}><div><div style={s.pageTitle}>QuickBooks Export</div><div style={s.pageSub}>Payroll-ready time data</div></div></div>
      <div style={{ maxWidth: 520 }}>
        {done && <div style={s.alert("success")}>File downloaded!</div>}
        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#EAF5EA", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#2ca01c" }}>QB</div>
            <div><div style={{ fontWeight: 800, fontSize: 16, color: INK }}>QuickBooks</div><div style={{ fontSize: 12, color: MUTED }}>IIF for Desktop · CSV for Online</div></div>
          </div>
          <div style={s.field}><label style={s.label}>Date Range</label><select style={s.input} value={range} onChange={(e) => setRange(e.target.value)}><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option><option value="all">All Time</option></select></div>
          <div style={s.field}><label style={s.label}>Format</label><select style={s.input} value={fmt} onChange={(e) => setFmt(e.target.value)}><option value="iif">QuickBooks IIF (Desktop)</option><option value="csv">CSV (QB Online / Excel)</option></select></div>
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, display: "flex", gap: 32 }}>
            <div><div style={{ fontSize: 24, color: GD, fontWeight: 700 }}>{count}</div><div style={{ fontSize: 11, color: MUTED }}>Entries</div></div>
            <div><div style={{ fontSize: 24, color: GD, fontWeight: 700 }}>{hrs.toFixed(1)}</div><div style={{ fontSize: 11, color: MUTED }}>Total Hours</div></div>
          </div>
          <button style={{ ...s.btnPrimary, width: "auto", padding: "12px 26px", display: "flex", alignItems: "center", gap: 8 }} onClick={run}><Icon name="download" size={16} color="#fff" /> Export {fmt === "iif" ? "IIF" : "CSV"}</button>
        </div>
        <div style={{ ...s.card, fontSize: 13, color: MUTED, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: TEXT, marginBottom: 8 }}>Import into QuickBooks</div>
          <strong style={{ color: TEXT }}>Desktop:</strong> File → Utilities → Import → Timer Activities (.iif)<br />
          <strong style={{ color: TEXT }}>Online:</strong> Import CSV via Time Activity report
        </div>
      </div>
    </div>
  )
}

