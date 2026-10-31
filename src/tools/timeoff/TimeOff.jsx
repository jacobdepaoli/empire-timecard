// ─── Time Off: crew request; admins approve or deny ──────────────────────────
import { useEffect, useState } from "react"
import { supabase } from "../../supabase.js"
import { s, G, GD, GSOFT, INK, TEXT, MUTED, FAINT, BORDER, PANEL, WARN, WSOFT, DANGER, DSOFT } from "../../theme.js"
import { Icon, Modal, Avatar, pushNotification } from "../../ui.jsx"
import { today, rangeLabel, workdays } from "../../dates.js"
import { timeAgo } from "../../photos.js"

const KINDS = ["PTO", "Sick", "Unpaid", "Other"]
const STATUS = { Pending: [WARN, WSOFT], Approved: [GD, GSOFT], Denied: [DANGER, DSOFT], Cancelled: [MUTED, "#eef0f2"] }
const span = (r) => r.all_day ? `${workdays(r.start_date, r.end_date) || 1} workday${workdays(r.start_date, r.end_date) === 1 ? "" : "s"}` : `${r.hours} hr${Number(r.hours) === 1 ? "" : "s"}`

export default function TimeOff({ user }) {
  const [list, setList] = useState([]); const [asking, setAsking] = useState(null); const [review, setReview] = useState(null)
  const [tab, setTab] = useState(user.is_admin ? "pending" : "mine")
  const load = async () => {
    const { data } = await supabase.from("pto_requests").select("*").order("start_date", { ascending: false })
    setList(data || [])
  }
  useEffect(() => {
    load()
    const ch = supabase.channel("pto-live").on("postgres_changes", { event: "*", schema: "public", table: "pto_requests" }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const mine = list.filter((r) => r.employee_id === user.id)
  const pending = list.filter((r) => r.status === "Pending")
  const upcoming = list.filter((r) => r.status === "Approved" && r.end_date >= today()).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const cancel = async (r) => { if (!window.confirm("Cancel this request?")) return; await supabase.from("pto_requests").update({ status: "Cancelled" }).eq("id", r.id); load() }

  const tabs = user.is_admin
    ? [["pending", `Needs review${pending.length ? ` (${pending.length})` : ""}`], ["upcoming", "Upcoming"], ["all", "All requests"], ["mine", "Mine"]]
    : [["mine", "My requests"]]
  const shown = tab === "pending" ? pending : tab === "upcoming" ? upcoming : tab === "all" ? list : mine

  return (
    <div>
      <div style={s.pageHeader}>
        <div><div style={s.pageTitle}>Time Off</div><div style={s.pageSub}>{user.is_admin ? "Review requests. Approved days show on the schedule." : "Request days off. You'll see the answer here."}</div></div>
        {!user.is_owner && <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 18px", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setAsking({})}><Icon name="plus" size={15} color="#fff" /> Request time off</button>}
      </div>

      {tabs.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={k === tab ? { ...s.btnSecondary, background: GSOFT, color: GD, borderColor: "#cde6cd" } : s.btnSecondary}>{l}</button>)}
        </div>
      )}

      {shown.length === 0 && <div style={{ ...s.card, textAlign: "center", padding: 40, color: MUTED }}><Icon name="calendar" size={28} color={BORDER} /><div style={{ marginTop: 10 }}>{tab === "pending" ? "Nothing waiting for review." : tab === "upcoming" ? "Nobody has approved time off coming up." : "No requests yet."}</div></div>}

      <div style={{ display: "grid", gap: 10 }}>
        {shown.map((r) => {
          const [c, bg] = STATUS[r.status]
          const isMine = r.employee_id === user.id
          return (
            <div key={r.id} style={{ ...s.card, marginBottom: 0, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", borderLeft: `4px solid ${c}` }}>
              <Avatar name={r.employee_name} size={42} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, color: INK }}>{tab === "mine" ? rangeLabel(r.start_date, r.end_date) : r.employee_name}</span>
                  <span style={s.badge(c, bg)}>{r.status}</span>
                  <span style={s.badge(MUTED, "#eef0f2")}>{r.kind}</span>
                </div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{tab !== "mine" && <>{rangeLabel(r.start_date, r.end_date)} · </>}{span(r)} · requested {timeAgo(r.created_at)}</div>
                {r.note && <div style={{ fontSize: 13, color: TEXT, marginTop: 6 }}>&ldquo;{r.note}&rdquo;</div>}
                {r.reviewed_by && <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>{r.status} by {r.reviewed_by}{r.review_note ? `: ${r.review_note}` : ""}</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {user.is_admin && r.status === "Pending" && <button style={{ ...s.btnPrimary, width: "auto", padding: "9px 18px" }} onClick={() => setReview(r)}>Review</button>}
                {isMine && r.status === "Pending" && <><button style={s.btnSecondary} onClick={() => setAsking(r)}>Edit</button><button style={s.btnDanger} onClick={() => cancel(r)}>Cancel</button></>}
              </div>
            </div>
          )
        })}
      </div>

      {asking && <RequestModal user={user} r={asking} onClose={() => setAsking(null)} onSaved={() => { setAsking(null); load() }} />}
      {review && <ReviewModal user={user} r={review} onClose={() => setReview(null)} onSaved={() => { setReview(null); load() }} />}
    </div>
  )
}

function RequestModal({ user, r, onClose, onSaved }) {
  const t = today()
  const [f, setF] = useState({ start_date: r.start_date || t, end_date: r.end_date || t, kind: r.kind || "PTO", all_day: r.all_day !== false, hours: r.hours || "", note: r.note || "" })
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v, ...(k === "start_date" && v > p.end_date ? { end_date: v } : {}) }))
  const save = async () => {
    setErr("")
    if (f.end_date < f.start_date) return setErr("End date is before the start date.")
    if (!f.all_day && !(Number(f.hours) > 0 && Number(f.hours) <= 12)) return setErr("Enter how many hours (up to 12).")
    setBusy(true)
    const rec = { start_date: f.start_date, end_date: f.all_day ? f.end_date : f.start_date, kind: f.kind, all_day: f.all_day, hours: f.all_day ? null : Number(f.hours), note: f.note.trim() }
    const { error } = r.id
      ? await supabase.from("pto_requests").update(rec).eq("id", r.id)
      : await supabase.from("pto_requests").insert({ ...rec, employee_id: user.id, employee_name: user.name, status: "Pending" })
    setBusy(false)
    if (error) return setErr("Couldn't send the request. Try again.")
    if (!r.id) pushNotification("Time off request", `${user.name}: ${rangeLabel(rec.start_date, rec.end_date)} (${rec.kind})`)
    onSaved()
  }
  return (
    <Modal title={r.id ? "Edit request" : "Request time off"} onClose={onClose} width={500}>
      {err && <div style={s.alert("error")}>{err}</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {KINDS.map((k) => <button key={k} onClick={() => set("kind", k)} style={{ ...s.btnSecondary, flex: 1, ...(f.kind === k ? { background: GSOFT, color: GD, borderColor: "#cde6cd" } : {}) }}>{k}</button>)}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 14 }}><input type="checkbox" checked={!f.all_day} onChange={(e) => set("all_day", !e.target.checked)} /> Part of a day (appointment, leaving early…)</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={s.field}><label style={s.label}>{f.all_day ? "First day off" : "Date"}</label><input type="date" style={s.input} value={f.start_date} min={r.id ? undefined : t} onChange={(e) => set("start_date", e.target.value)} /></div>
        {f.all_day
          ? <div style={s.field}><label style={s.label}>Last day off</label><input type="date" style={s.input} value={f.end_date} min={f.start_date} onChange={(e) => set("end_date", e.target.value)} /></div>
          : <div style={s.field}><label style={s.label}>Hours</label><input type="number" step="0.5" min="0.5" max="12" style={s.input} value={f.hours} onChange={(e) => set("hours", e.target.value)} placeholder="e.g. 3" /></div>}
      </div>
      {f.all_day && <div style={{ fontSize: 12, color: MUTED, marginTop: -6, marginBottom: 12 }}>{workdays(f.start_date, f.end_date)} workday{workdays(f.start_date, f.end_date) === 1 ? "" : "s"} (weekends not counted)</div>}
      <div style={s.field}><label style={s.label}>Note (optional)</label><textarea style={{ ...s.textarea, minHeight: 64 }} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Anything the office should know" /></div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={s.btnSecondary} onClick={onClose}>Cancel</button>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 22px" }} onClick={save} disabled={busy}>{busy ? "Sending…" : r.id ? "Save" : "Send request"}</button>
      </div>
    </Modal>
  )
}

function ReviewModal({ user, r, onClose, onSaved }) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [overlap, setOverlap] = useState([])
  useEffect(() => {
    supabase.rpc("time_off_between", { p_from: r.start_date, p_to: r.end_date }).then(({ data }) => setOverlap((data || []).filter((o) => o.employee_id !== r.employee_id)))
  }, [r.id])
  const decide = async (status) => {
    setBusy(true)
    await supabase.from("pto_requests").update({ status, reviewed_by: user.name, reviewed_at: new Date().toISOString(), review_note: note.trim() }).eq("id", r.id)
    pushNotification(`Time off ${status.toLowerCase()}`, `${r.employee_name}: ${rangeLabel(r.start_date, r.end_date)}`)
    setBusy(false); onSaved()
  }
  return (
    <Modal title="Review request" onClose={onClose} width={480}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <Avatar name={r.employee_name} size={46} />
        <div><div style={{ fontWeight: 800, color: INK, fontSize: 16 }}>{r.employee_name}</div><div style={{ fontSize: 13, color: MUTED }}>{r.kind} · {rangeLabel(r.start_date, r.end_date)} · {span(r)}</div></div>
      </div>
      {r.note && <div style={{ background: PANEL, borderRadius: 10, padding: "10px 14px", fontSize: 14, marginBottom: 12 }}>&ldquo;{r.note}&rdquo;</div>}
      <div style={{ ...s.alert(overlap.length ? "warning" : "success") }}>{overlap.length ? `Also out then: ${[...new Set(overlap.map((o) => o.employee_name))].join(", ")}` : "Nobody else is out on those days."}</div>
      <div style={s.field}><label style={s.label}>Note back (optional)</label><input style={s.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approved, enjoy the trip" /></div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={s.btnDanger} onClick={() => decide("Denied")} disabled={busy}>Deny</button>
        <button style={{ ...s.btnPrimary, width: "auto", padding: "10px 24px" }} onClick={() => decide("Approved")} disabled={busy}>Approve</button>
      </div>
    </Modal>
  )
}
