import { BRAND } from "./brand.js"

// ─── Shared helpers ──────────────────────────────────────────────────────────
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "")
export const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""
export const fmtDateTime = (d) => (d ? `${fmtDate(d)} ${fmtTime(d)}` : "")

export const money = (n) => "$" + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)

export const duration = (start, end) => {
  const ms = (end ? new Date(end) : new Date()) - new Date(start)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}
export const durationHours = (start, end) =>
  Math.round(((end ? new Date(end) : new Date()) - new Date(start)) / 360000) / 10

const SERVICE_JOB_KEYWORDS = ["service", "warranty"]
export const isServiceJob = (job) =>
  !!job && (job.is_service || SERVICE_JOB_KEYWORDS.some((k) => job.name?.toLowerCase().includes(k)))

// Monday-start week key (YYYY-MM-DD of the Monday)
export const weekStart = (d = new Date()) => {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // 0 = Monday
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - day)
  return x.toISOString().slice(0, 10)
}
export const weekLabel = (mondayStr) => {
  const a = new Date(mondayStr + "T00:00:00")
  const b = new Date(a)
  b.setDate(b.getDate() + 6)
  const o = { month: "short", day: "numeric" }
  return `${a.toLocaleDateString([], o)} – ${b.toLocaleDateString([], o)}`
}

// Auto job number: prefix + YY + M (no leading zero) + DD (zero-padded).
// With the EENV prefix: 2026-06-03 → EENV26603
export const genJobNumber = (dateStr) => {
  const today = dateStr || new Date().toISOString().slice(0, 10)
  const parts = today.split("-").map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return ""
  const [y, m, d] = parts
  const yy = String(y).slice(-2).padStart(2, "0")
  return `${BRAND.jobPrefix}${yy}${m}${String(d).padStart(2, "0")}`
}

export const todayStr = () => new Date().toISOString().slice(0, 10)

// datetime-local <input> helpers — keep wall-clock time correct across timezones.
// toLocalInput: UTC ISO from the DB  →  "YYYY-MM-DDTHH:mm" in the viewer's local time
// fromLocalInput: that local string  →  UTC ISO to store back
export const toLocalInput = (iso) => {
  if (!iso) return ""
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export const fromLocalInput = (val) => (val ? new Date(val).toISOString() : null)

// Separate date + time pickers (reliable on iOS, unlike datetime-local).
const pad = (n) => String(n).padStart(2, "0")
export const toLocalDate = (iso) => {
  if (!iso) return ""
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const toLocalTime = (iso) => {
  if (!iso) return ""
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
// Combine a local date string + local time string into a UTC ISO timestamp.
export const combineLocal = (dateStr, timeStr) => {
  if (!dateStr) return null
  return new Date(`${dateStr}T${timeStr || "00:00"}`).toISOString()
}

// GPS — captured automatically, never editable
export function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ lat: "N/A", lng: "N/A", accuracy: null })
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude.toFixed(5),
          lng: p.coords.longitude.toFixed(5),
          accuracy: Math.round(p.coords.accuracy),
        }),
      () => resolve({ lat: "N/A", lng: "N/A", accuracy: null }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  })
}

export const hasGps = (lat) => lat && lat !== "N/A"
export const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

export const readFileAsDataURL = (file) =>
  new Promise((resolve) => {
    const r = new FileReader()
    r.onload = (e) => resolve(e.target.result)
    r.readAsDataURL(file)
  })
