// ─── Calendar date helpers (local dates as YYYY-MM-DD, no timezone drift) ────
const pad = (n) => String(n).padStart(2, "0")
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d) }
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
export const today = () => iso(new Date())
export const mondayOf = (s) => { const d = parse(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return iso(d) }
export const days = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i))
export const between = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out }
export const weekdayShort = (s) => parse(s).toLocaleDateString([], { weekday: "short" })
export const md = (s) => parse(s).toLocaleDateString([], { month: "short", day: "numeric" })
export const mdy = (s) => parse(s).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
export const rangeLabel = (a, b) => (a === b ? mdy(a) : parse(a).getFullYear() === parse(b).getFullYear() ? `${md(a)} – ${mdy(b)}` : `${mdy(a)} – ${mdy(b)}`)
export const workdays = (a, b) => between(a, b).filter((d) => { const w = parse(d).getDay(); return w !== 0 && w !== 6 }).length
export const time12 = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}${m ? ":" + pad(m) : ""}${h < 12 ? "a" : "p"}` }
