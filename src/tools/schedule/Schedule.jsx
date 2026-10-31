// ─── Schedule: who's on which job, by day. Admins assign; everyone views. ────
import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, BG, PANEL, WARN, WSOFT, DANGER, SURFACE } from "../../theme.js"
import { Icon, Modal, Avatar } from "../../ui.jsx"
import { iso, parse, addDays, today, mondayOf, days, weekdayShort, md, rangeLabel, time12 } from "../../dates.js"

const useWide = () => { const [w, setW] = useState(window.innerWidth); useEffect(() => { const r = () => setW(window.innerWidth); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r) }, []); return w >= 820 }
const OUT_BG = "repeating-linear-gradient(135deg, #f1f1ee, #f1f1ee 6px, #e8e8e4 6px, #e8e8e4 12px)"

export default function Schedule({ user }) {
  const wide = useWide()
  const [mode, setMode] = useState("week")
  const [anchor, setAnchor] = useState(today())                // any date in the visible period
  const [dayPick, setDayPick] = useState(today())              // phone day view
  const [crew, setCrew] = useState([]); const [jobs, setJobs] = useState([])
  const [entries, setEntries] = useState([]); const [pto, setPto] = useState([]); const [hols, setHols] = useState([])
  const [edit, setEdit] = useState(null); const [peek, setPeek] = useState(null)

  const week0 = mondayOf(anchor)
  const range = useMemo(() => {
    if (mode === "week") return { from: week0, to: addDays(week0, 6) }
    const d = parse(anchor), first = iso(new Date(d.getFullYear(), d.getMonth(), 1)), from = mondayOf(first)
    return { from, to: addDays(from, 41) }
  }, [mode, anchor])

  const load = async () => {
    const [{ data: c }, { data: j }, { data: e }, { data: p }, { data: h }] = await Promise.all([
      supabase.rpc("crew_directory"),
      supabase.from("jobs").select("id,name,color,address,status,client").order("name"),
      supabase.from("schedule_entries").select("*").gte("work_date", range.from).lte("work_date", range.to),
      supabase.rpc("time_off_between", { p_from: range.from, p_to: range.to }),
      supabase.from("holidays").select("*").gte("date", range.from).lte("date", range.to),
    ])
    const list = c || []
    const meFirst = [...list.filter((x) => x.id === user.id), ...list.filter((x) => x.id !== user.id)]
    setCrew(meFirst); setJobs(j || []); setEntries(e || []); setPto(p || []); setHols(h || [])
  }
  useEffect(() => { load() }, [range.from, range.to])
  useEffect(() => {
    const ch = supabase.channel("sched-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_entries" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pto_requests" }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [range.from, range.to])

  const jobById = Object.fromEntries(jobs.map((j) => [j.id, j]))
  const holiday = (d) => hols.find((h) => h.date === d)
  const cell = (empId, d) => entries.filter((e) => e.employee_id === empId && e.work_date === d).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))
  const outOn = (empId, d) => pto.find((p) => p.employee_id === empId && p.start_date <= d && p.end_date >= d)

  const shift = (n) => {
    if (mode === "week") { const a = addDays(anchor, n * 7); setAnchor(a); setDayPick(addDays(dayPick, n * 7)) }
    else { const d = parse(anchor); setAnchor(iso(new Date(d.getFullYear(), d.getMonth() + n, 1))) }
  }
  const goToday = () => { setAnchor(today()); setDayPick(today()) }

  const copyLastWeek = async () => {
    const prev0 = addDays(week0, -7)
    const { data: prev } = await supabase.from("schedule_entries").select("*").gte("work_date", prev0).lte("work_date", addDays(prev0, 6))
    if (!prev?.length) return alert("Last week has nothing scheduled to copy.")
    const taken = new Set(entries.map((e) => `${e.employee_id}|${e.work_date}`))
    const rows = prev.map((e) => ({ ...e, work_date: addDays(e.work_date, 7) }))
      .filter((e) => !taken.has(`${e.employee_id}|${e.work_date}`) && !(outOn(e.employee_id, e.work_date)?.all_day) && !holiday(e.work_date))
      .map(({ id, created_at, ...rest }) => ({ ...rest, created_by: user.name }))
    if (!rows.length) return alert("Everything from last week is already on this week (or those days are off).")
    if (!window.confirm(`Copy ${rows.length} assignment${rows.length === 1 ? "" : "s"} from last week? Days already scheduled, holidays, and approved time off are skipped.`)) return
    await supabase.from("schedule_entries").insert(rows); load()
  }

  const title = mode === "week" ? rangeLabel(week0, addDays(week0, 6)) : parse(anchor).toLocaleDateString([], { month: "long", year: "numeric" })
  const Chip = ({ e }) => {
    const j = jobById[e.job_id]
    return (
      <div onClick={(ev) => { ev.stopPropagation(); user.is_admin ? setEdit(e) : setPeek(e) }} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${j?.color || "#9B9B97"}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, marginBottom: 4, cursor: "pointer", textAlign: "left" }}>
        <div style={{ fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j?.name || e.label || "Assignment"}</div>
        {(e.start_time || e.end_time) && <div style={{ color: MUTED, fontSize: 11 }}>{time12(e.start_time)}{e.end_time ? `–${time12(e.end_time)}` : ""}</div>}
      </div>
    )
  }
  const Out = ({ p }) => <div style={{ background: OUT_BG, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 4 }}>{p.all_day ? "Out" : `Out ${p.hours}h`}</div>

  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>Schedule</div><div style={s.pageSub}>{user.is_admin ? "Tap a day to assign someone. Approved time off shows automatically." : "Where you're working this week."}</div></div>
        {user.is_admin && mode === "week" && <button style={{ ...s.btnSecondary, display: "flex", alignItems: "center", gap: 6 }} onClick={copyLastWeek}><Icon name="calendar" size={14} /> Copy last week</button>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button style={{ ...s.btnSecondary, padding: "8px 10px" }} onClick={() => shift(-1)} title="Previous"><Icon name="back" size={16} /></button>
        <button style={s.btnSecondary} onClick={goToday}>Today</button>
        <button style={{ ...s.btnSecondary, padding: "8px 10px" }} onClick={() => shift(1)} title="Next"><Icon name="chevron" size={16} /></button>
        <div style={{ fontWeight: 800, color: INK, fontSize: 16, marginLeft: 6, flex: 1, minWidth: 160 }}>{title}</div>
        <div style={{ display: "flex", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 11, padding: 3 }}>
          {["week", "month"].map((m) => <button key={m} onClick={() => setMode(m)} style={{ border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 13, background: mode === m ? INK : "transparent", color: mode === m ? "#fff" : MUTED }}>{m === "week" ? "Week" : "Month"}</button>)}
        </div>
      </div>

      {mode === "month" && (
        <div style={{ ...s.card, padding: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} style={{ fontSize: 11, fontWeight: 800, color: MUTED, textAlign: "center", padding: 4, textTransform: "uppercase" }}>{d}</div>)}
            {days(range.from, 42).map((d) => {
              const inMonth = parse(d).getMonth() === parse(anchor).getMonth()
              const n = new Set(entries.filter((e) => e.work_date === d).map((e) => e.employee_id)).size
              const out = crew.filter((c) => outOn(c.id, d))
              const mine = entries.some((e) => e.work_date === d && e.employee_id === user.id)
              const h = holiday(d)
              return (
                <div key={d} onClick={() => { setAnchor(d); setDayPick(d); setMode("week") }} style={{ minHeight: wide ? 92 : 62, borderRadius: 8, padding: 6, cursor: "pointer", background: h ? WSOFT : d === today() ? GSOFT : inMonth ? "#fff" : PANEL, border: `1px solid ${d === today() ? "#cde6cd" : BORDER}`, opacity: inMonth ? 1 : 0.55 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: d === today() ? GD : INK }}>{parse(d).getDate()}</div>
                  {h && <div style={{ fontSize: 10.5, fontWeight: 700, color: WARN, lineHeight: 1.2 }}>{h.name}</div>}
                  {wide && n > 0 && <div style={{ fontSize: 11, color: MUTED }}>{n} scheduled</div>}
                  {wide && out.length > 0 && <div style={{ fontSize: 11, color: MUTED }}>{out.length} out</div>}
                  {mine && <div style={{ width: 7, height: 7, borderRadius: 4, background: G, marginTop: 3 }} title="You're scheduled" />}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mode === "week" && wide && (
        <div style={{ ...s.card, padding: 0, overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, tableLayout: "fixed" }}>
            <thead><tr>
              <th style={{ ...s.th, width: 170, position: "sticky", left: 0, background: SURFACE }}>Crew</th>
              {days(week0, 7).map((d) => {
                const h = holiday(d)
                return <th key={d} style={{ ...s.th, textAlign: "center", background: d === today() ? GSOFT : h ? WSOFT : undefined, color: d === today() ? GD : MUTED }}>
                  {weekdayShort(d)} {parse(d).getDate()}{h && <div style={{ fontSize: 10, color: WARN, textTransform: "none", letterSpacing: 0, marginTop: 2 }}>{h.name}</div>}
                </th>
              })}
            </tr></thead>
            <tbody>
              {crew.map((c) => (
                <tr key={c.id} style={{ background: c.id === user.id ? "#FAFDF9" : undefined }}>
                  <td style={{ ...s.td, position: "sticky", left: 0, background: c.id === user.id ? "#FAFDF9" : SURFACE, borderRight: `1px solid ${BG}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar name={c.name} src={c.photo_url} size={28} /><div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, color: INK, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.id === user.id ? "You" : c.name}</div><div style={{ fontSize: 11, color: FAINT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.role}</div></div></div>
                  </td>
                  {days(week0, 7).map((d) => {
                    const p = outOn(c.id, d), list = cell(c.id, d)
                    return (
                      <td key={d} onClick={() => user.is_admin && setEdit({ work_date: d, employee_id: c.id })} style={{ ...s.td, verticalAlign: "top", padding: 6, cursor: user.is_admin ? "pointer" : "default", background: holiday(d) ? "#FFFBF3" : undefined, borderRight: `1px solid ${BG}` }}>
                        {p && <Out p={p} />}
                        {list.map((e) => <Chip key={e.id} e={e} />)}
                        {user.is_admin && !list.length && !p && <div style={{ color: BORDER, fontSize: 18, textAlign: "center", lineHeight: "30px" }}>+</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {crew.length === 0 && <div style={{ padding: 30, textAlign: "center", color: MUTED }}>No crew yet.</div>}
        </div>
      )}

      {mode === "week" && !wide && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 12 }}>
            {days(week0, 7).map((d) => {
              const on = d === dayPick, mine = entries.some((e) => e.work_date === d && e.employee_id === user.id)
              return <button key={d} onClick={() => setDayPick(d)} style={{ border: `1px solid ${on ? INK : BORDER}`, background: on ? INK : holiday(d) ? WSOFT : SURFACE, color: on ? "#fff" : INK, borderRadius: 10, padding: "6px 0", fontWeight: 700, fontSize: 12, position: "relative" }}>
                <div style={{ fontSize: 10, opacity: .7, textTransform: "uppercase" }}>{weekdayShort(d).slice(0, 3)}</div>{parse(d).getDate()}
                {mine && <span style={{ position: "absolute", top: 4, right: 6, width: 6, height: 6, borderRadius: 3, background: G }} />}
              </button>
            })}
          </div>
          {holiday(dayPick) && <div style={{ ...s.alert("warning") }}>{holiday(dayPick).name}</div>}
          <div style={{ display: "grid", gap: 8 }}>
            {crew.map((c) => {
              const p = outOn(c.id, dayPick), list = cell(c.id, dayPick)
              return (
                <div key={c.id} onClick={() => user.is_admin && setEdit({ work_date: dayPick, employee_id: c.id })} style={{ ...s.card, marginBottom: 0, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start", cursor: user.is_admin ? "pointer" : "default", borderLeft: c.id === user.id ? `4px solid ${G}` : undefined }}>
                  <Avatar name={c.name} src={c.photo_url} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: INK, fontSize: 14, marginBottom: 6 }}>{c.id === user.id ? "You" : c.name}</div>
                    {p && <Out p={p} />}
                    {list.map((e) => <Chip key={e.id} e={e} />)}
                    {!p && !list.length && <div style={{ fontSize: 12, color: FAINT }}>{user.is_admin ? "Not scheduled · tap to assign" : "Not scheduled"}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {edit && <AssignModal e={edit} crew={crew} jobs={jobs.filter((j) => j.status !== "Closed" || j.id === edit.job_id)} user={user} outOn={outOn} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
      {peek && <PeekModal e={peek} job={jobById[peek.job_id]} onClose={() => setPeek(null)} />}
    </div>
  )
}

function AssignModal({ e, crew, jobs, user, outOn, onClose, onSaved }) {
  const isNew = !e.id
  const who = crew.find((c) => c.id === e.employee_id)
  const [f, setF] = useState({ job_id: e.job_id || (e.label ? "" : jobs.find((j) => j.status === "Active")?.id || ""), label: e.label || "", start_time: (e.start_time || "07:00").slice(0, 5), end_time: (e.end_time || "15:30").slice(0, 5), notes: e.notes || "", repeat: false })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("")
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const p = outOn(e.employee_id, e.work_date)
  const dow = parse(e.work_date).getDay()   // 1..5 = Mon..Fri
  const restOfWeek = dow >= 1 && dow <= 4 ? days(addDays(e.work_date, 1), 5 - dow) : []

  const save = async () => {
    if (!f.job_id && !f.label.trim()) return setErr("Pick a job or type what they're doing.")
    setBusy(true)
    const rec = { employee_id: e.employee_id, job_id: f.job_id || null, label: f.job_id ? "" : f.label.trim(), start_time: f.start_time || null, end_time: f.end_time || null, notes: f.notes.trim() }
    let error
    if (isNew) {
      const dates = [e.work_date, ...(f.repeat ? restOfWeek.filter((d) => !outOn(e.employee_id, d)?.all_day) : [])]
      ;({ error } = await supabase.from("schedule_entries").insert(dates.map((d) => ({ ...rec, work_date: d, created_by: user.name }))))
    } else ({ error } = await supabase.from("schedule_entries").update(rec).eq("id", e.id))
    setBusy(false)
    if (error) return setErr("Couldn't save. Try again.")
    onSaved()
  }
  const remove = async () => { await supabase.from("schedule_entries").delete().eq("id", e.id); onSaved() }

  return (
    <Modal title={`${who?.name || "Assign"} · ${weekdayShort(e.work_date)} ${md(e.work_date)}`} onClose={onClose} width={480}>
      {err && <div style={s.alert("error")}>{err}</div>}
      {p && <div style={s.alert("warning")}>{who?.name.split(" ")[0]} has approved time off this day{p.all_day ? "" : ` (${p.hours} hrs)`}.</div>}
      <div style={s.field}><label style={s.label}>Job</label>
        <select style={s.input} value={f.job_id} onChange={(ev) => set("job_id", ev.target.value)}>
          <option value="">Not a job (shop, training, supply run…)</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}{j.status !== "Active" ? ` (${j.status})` : ""}</option>)}
        </select>
      </div>
      {!f.job_id && <div style={s.field}><label style={s.label}>What they're doing</label><input style={s.input} value={f.label} onChange={(ev) => set("label", ev.target.value)} placeholder="e.g. Shop day, OSHA 10 class" /></div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={s.field}><label style={s.label}>Start</label><input type="time" style={s.input} value={f.start_time} onChange={(ev) => set("start_time", ev.target.value)} /></div>
        <div style={s.field}><label style={s.label}>End</label><input type="time" style={s.input} value={f.end_time} onChange={(ev) => set("end_time", ev.target.value)} /></div>
      </div>
      <div style={s.field}><label style={s.label}>Notes (optional)</label><input style={s.input} value={f.notes} onChange={(ev) => set("notes", ev.target.value)} placeholder="e.g. Meet at the shop first, bring the trencher" /></div>
      {isNew && restOfWeek.length > 0 && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 16 }}><input type="checkbox" checked={f.repeat} onChange={(ev) => set("repeat", ev.target.checked)} /> Same thing through Friday ({restOfWeek.length} more day{restOfWeek.length === 1 ? "" : "s"})</label>}
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
        <div>{!isNew && <button style={s.btnDanger} onClick={remove}><Icon name="trash" size={13} /> Remove</button>}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={s.btnSecondary} onClick={onClose}>Cancel</button>
          <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  )
}

function PeekModal({ e, job, onClose }) {
  return (
    <Modal title={job?.name || e.label || "Assignment"} onClose={onClose} width={420}>
      <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.9 }}>
        <div><strong>{weekdayShort(e.work_date)} {md(e.work_date)}</strong>{(e.start_time || e.end_time) && <> · {time12(e.start_time)}{e.end_time ? `–${time12(e.end_time)}` : ""}</>}</div>
        {job?.client && <div>Client: {job.client}</div>}
        {job?.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer" style={{ color: GD, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}><Icon name="pin" size={14} color={GD} />{job.address}</a>}
        {e.notes && <div style={{ background: PANEL, borderRadius: 10, padding: "8px 12px", marginTop: 8 }}>{e.notes}</div>}
      </div>
      {job && <button style={{ ...s.btnPrimary, marginTop: 16 }} onClick={() => { location.hash = `/jobs/${job.id}` }}>Open job</button>}
    </Modal>
  )
}
