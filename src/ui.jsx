// ─── Shared UI used by every hub tool ─────────────────────────────────────────
import { useState, useRef, forwardRef, useImperativeHandle } from "react"
import { supabase } from "./supabase.js"
import { s, G, GD, GSOFT, INK, BORDER } from "./theme.js"
import { BRAND } from "./brand.js"

// ─── Notifications ────────────────────────────────────────────────────────────
export async function pushNotification(title, body) {
  await supabase.from("notifications").insert({ title, body })
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(title, { body }) } catch (_) {}
  }
}
export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported"
  if (Notification.permission !== "default") return Notification.permission
  return await Notification.requestPermission()
}

// ─── Logo + Icons ─────────────────────────────────────────────────────────────
// variant: "light" = full logo for white backgrounds, "dark" = full logo for the dark sidebar, "icon" = E mark only
export function Logo({ height = 40, variant = "light", className = "" }) {
  const src = variant === "icon" ? "/brand/icon.svg" : variant === "dark" ? "/brand/logo-on-dark.svg" : "/brand/logo-on-light.svg"
  return <img src={src} alt={BRAND.company} className={className} style={{ height, width: "auto", maxWidth: "100%", objectFit: "contain", objectPosition: "left center", display: "block" }} />
}

export const Icon = ({ name, size = 18, color = "currentColor", spin = false }) => {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }
  const paths = {
    clock: <><circle cx="12" cy="12" r="9" /><polyline points="12,7 12,12 16,14" /></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16,17 21,12 16,7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    trash: <><polyline points="3,6 5,6 21,6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
    list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
    play: <polygon points="6,4 20,12 6,20" fill={color} stroke="none" />,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" fill={color} stroke="none" />,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    check: <polyline points="20,6 9,17 4,12" />,
    spinner: <path className={spin ? "spin" : ""} d="M12 3a9 9 0 1 0 9 9" />,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
    camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
    map: <><polygon points="1,6 8,3 16,6 23,3 23,18 16,21 8,18 1,21" /><line x1="8" y1="3" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="21" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></>,
    printer: <><polyline points="6,9 6,2 18,2 18,9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,6 12,13 2,6" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    box: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27,6.96 12,12.01 20.73,6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
    truck: <><rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
    scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><line x1="7" y1="12" x2="17" y2="12" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
    search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    back: <polyline points="15,18 9,12 15,6" />,
    sun: <><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="6.34" y2="6.34" /><line x1="17.66" y1="17.66" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="6.34" y2="17.66" /><line x1="17.66" y1="6.34" x2="19.07" y2="4.93" /></>,
    chevron: <polyline points="9,18 15,12 9,6" />,
    message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
    pinned: <><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" /></>,
  }
  return <svg {...p}>{paths[name] || null}</svg>
}

// ─── Reusable: Modal ──────────────────────────────────────────────────────────
export function Modal({ title, children, onClose, width = 680 }) {
  return (
    <div style={s.overlay} className="no-print eh-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.modal, width }} className="eh-modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div className="eh-modal-title" style={{ fontSize: 18, fontWeight: 800, color: INK, minWidth: 0 }}>{title}</div>
          <button style={s.btnGhost} onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Reusable: Signature pad ──────────────────────────────────────────────────
export const SignaturePad = forwardRef(({ height = 140 }, ref) => {
  const c = useRef(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  useImperativeHandle(ref, () => ({
    toDataURL: () => (hasInk ? c.current.toDataURL("image/png") : ""),
    clear: () => { const ctx = c.current.getContext("2d"); ctx.clearRect(0, 0, c.current.width, c.current.height); setHasInk(false) },
    isEmpty: () => !hasInk,
  }))
  const pos = (e) => {
    const cv = c.current, r = cv.getBoundingClientRect(), t = e.touches?.[0]
    return { x: ((t?.clientX ?? e.clientX) - r.left) * (cv.width / r.width), y: ((t?.clientY ?? e.clientY) - r.top) * (cv.height / r.height) }
  }
  const start = (e) => { drawing.current = true; const ctx = c.current.getContext("2d"); const pt = pos(e); ctx.beginPath(); ctx.moveTo(pt.x, pt.y); setHasInk(true); e.preventDefault() }
  const move = (e) => { if (!drawing.current) return; const ctx = c.current.getContext("2d"); const pt = pos(e); ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.strokeStyle = "#111"; ctx.lineTo(pt.x, pt.y); ctx.stroke(); e.preventDefault() }
  const end = () => { drawing.current = false }
  return (
    <canvas ref={c} width={760} height={height * 2}
      style={{ width: "100%", height, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, touchAction: "none", cursor: "crosshair" }}
      onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
      onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
  )
})


export function Avatar({ name, src, size = 56 }) {
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `1px solid ${BORDER}`, flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: "50%", background: GSOFT, color: GD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: Math.round(size * 0.4), flexShrink: 0 }}>{(name || "?").trim()[0]?.toUpperCase()}</div>
}
