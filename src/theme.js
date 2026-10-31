// ─── Design system — Empire Electric (black / white / #4AA04A) ───────────────
export const G = "#4AA04A"        // Empire green (logo bolt)
export const GD = "#2E7D32"       // deep green — for text/icons on white (AA contrast)
export const GSOFT = "#EAF5EA"    // green tint background
export const INK = "#1C1B17"      // Empire black (logo tile)
export const TEXT = "#24231F"
export const MUTED = "#5F5F5F"     // logo tagline gray
export const FAINT = "#9B9B97"
export const BORDER = "#E6E6E2"   // soft warm-gray border
export const BG = "#F4F4F1"       // off-white app background
export const SURFACE = "#ffffff"
export const PANEL = "#F7F8F5"    // faint panel
// Dark chrome (sidebar / mobile tab bar / login backdrop)
export const SIDE = "#1C1B17"
export const SIDE_2 = "#2A2A2A"     // logo dark-variant tile
export const SIDE_TEXT = "#D9DAD5"
export const SIDE_MUTED = "#8E8F89"
export const SIDE_LINE = "rgba(255,255,255,.08)"
export const GLIGHT = "#6CC36C"     // green that reads on the dark sidebar
export const DANGER = "#c0392b"
export const DSOFT = "#fdecea"
export const WARN = "#b9770a"
export const WSOFT = "#fdf3e3"

export const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body, #root { min-height: 100%; background: ${BG}; }
  body {
    color: ${TEXT};
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    font-feature-settings: 'cv11', 'ss01';
    font-variant-numeric: tabular-nums;
    min-height: 100vh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(1200px 600px at 100% -10%, rgba(74,160,74,.10), transparent 60%),
      radial-gradient(900px 500px at -10% 0%, rgba(74,160,74,.05), transparent 55%),
      ${BG};
    background-attachment: fixed;
  }

  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: #cfd0cb; border-radius: 99px; border: 2px solid ${BG}; }
  ::-webkit-scrollbar-thumb:hover { background: #b6b7b1; }

  input, select, textarea, button { font-family: inherit; color: ${TEXT}; -webkit-tap-highlight-color: transparent; }
  ::placeholder { color: #aab0b8; }
  input, select, textarea { transition: border-color .12s ease, box-shadow .12s ease; }
  input:focus, select:focus, textarea:focus {
    border-color: ${G} !important;
    box-shadow: 0 0 0 3.5px rgba(74,160,74,.18);
  }
  button { cursor: pointer; transition: transform .1s ease, filter .14s ease, box-shadow .14s ease, background .14s ease; }
  button:active { transform: translateY(1px); }
  .btn-primary:hover { filter: brightness(1.04); box-shadow: 0 10px 24px rgba(74,160,74,.34) !important; }
  .btn-ghost-h:hover { background: ${GSOFT} !important; color: ${GD} !important; }

  /* clickable cards lift slightly */
  .lift { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
  .lift:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(16,24,40,.10); border-color: #d6dcd3; }

  @keyframes slideIn { from { opacity:0; transform:translateY(10px) scale(.99); } to { opacity:1; transform:translateY(0) scale(1); } }
  @keyframes pulse { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(1.18);opacity:.7;} }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; transform-origin: center; }

  canvas { touch-action: none; }
  .tc-mobile-brand { display: none; align-items: center; justify-content: space-between; margin-bottom: 18px; }

  /* ── Mobile: sidebar becomes bottom tab bar ── */
  @media (max-width: 860px) {
    .tc-sidebar {
      position: fixed !important; left: 8px !important; right: 8px !important;
      bottom: calc(8px + env(safe-area-inset-bottom)) !important; top: auto !important;
      width: auto !important; height: 70px !important; flex-direction: row !important;
      border-radius: 18px !important; z-index: 999 !important;
      box-shadow: 0 10px 34px rgba(0,0,0,.35) !important;
      border: 1px solid ${SIDE_LINE} !important;
    }
    .tc-sidebar .tc-side-logo, .tc-sidebar .tc-side-foot { display: none !important; }
    .tc-mobile-brand { display: flex !important; }
    .tc-side-divider { display: none !important; }
    .tc-navitem { box-shadow: none !important; }
    .tc-sidebar .tc-side-nav {
      display: flex !important; flex: 1 !important; flex-direction: row !important;
      align-items: center !important; gap: 2px !important;
      padding: 7px !important; overflow-x: auto !important; overflow-y: hidden !important; scrollbar-width: none;
    }
    .tc-sidebar .tc-side-nav::-webkit-scrollbar { display: none; }
    .tc-navitem {
      display: flex !important; flex: 0 0 auto !important;
      min-width: 64px !important; height: 56px !important; flex-direction: column !important;
      align-items: center !important; justify-content: center !important; gap: 3px !important; padding: 6px 6px !important;
      font-size: 10px !important; text-align: center !important; margin: 0 !important;
    }
    .tc-navitem span { font-size: 10px !important; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tc-main { margin-left: 0 !important; padding: calc(16px + env(safe-area-inset-top)) 14px 100px !important; }
    table { display: block !important; overflow-x: auto !important; white-space: nowrap !important; }
    input, select, textarea { font-size: 16px !important; }
  }

  /* ════════════════════════════════════════════════════════════
     T&M DOCUMENT — print-perfect, field service work order
     ════════════════════════════════════════════════════════════ */
  .tm-doc { background:#fff; color:#111; padding:18px 30px 30px; font-size:14px; }
  .tm-header { display:flex; align-items:center; justify-content:space-between;
    border-bottom:3px solid ${G}; padding-bottom:8px; margin-bottom:14px; gap:16px; }
  .tm-brand-mark { height:96px; max-width:380px; width:auto; object-fit:contain; }
  .tm-doctitle { text-align:right; text-transform:uppercase; font-weight:900; font-size:20px; line-height:1.1; color:#111; }
  .tm-doctitle small { display:block; font-size:10px; font-weight:600; letter-spacing:2px; color:${MUTED}; margin-top:4px; }
  .tm-meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px 24px; margin-bottom:14px; }
  .tm-meta { background:${PANEL}; border-left:3px solid ${G}; padding:10px 14px; border-radius:4px; }
  .tm-meta h3 { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:${MUTED}; margin-bottom:6px; }
  .tm-meta .line { font-size:13px; line-height:1.55; }
  .tm-section { margin-top:16px; }
  .tm-h2 { font-size:12px; letter-spacing:2px; text-transform:uppercase; color:#fff; background:#111;
    padding:7px 12px; margin-bottom:10px; border-left:6px solid ${G}; border-radius:3px; }
  .tm-narr { margin-bottom:10px; }
  .tm-narr .lab { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:${MUTED}; font-weight:600; margin-bottom:2px; }
  .tm-narr .val { white-space:pre-wrap; line-height:1.5; min-height:1em; }
  table.tm-table { width:100%; border-collapse:collapse; margin-top:4px; }
  table.tm-table th { background:#f0f2f4; color:#111; font-size:11px; text-transform:uppercase; letter-spacing:1px;
    padding:8px; text-align:left; border-bottom:2px solid ${G}; }
  table.tm-table td { padding:7px 8px; border-bottom:1px solid ${BORDER}; vertical-align:middle; }
  table.tm-table .num { text-align:right; white-space:nowrap; }
  .tm-totals { margin-top:14px; margin-left:auto; width:340px; max-width:100%; background:${PANEL};
    border:1px solid ${BORDER}; border-radius:8px; padding:12px 16px; }
  .tm-totals .r { display:flex; justify-content:space-between; padding:5px 0; font-size:14px; }
  .tm-totals .r.sub { color:${MUTED}; font-size:13px; }
  .tm-totals .r.grand { border-top:2px solid ${G}; margin-top:6px; padding-top:10px; font-weight:900; font-size:18px; }
  .tm-sig-wrap { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:10px; }
  .tm-sig-box { border:1px solid ${BORDER}; border-radius:6px; overflow:hidden; }
  .tm-sig-box .cap { background:#f0f2f4; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:${MUTED}; padding:6px 10px; }
  .tm-sig-box .pad { height:110px; display:flex; align-items:center; justify-content:center; }
  .tm-sig-box .pad img { max-height:104px; max-width:100%; object-fit:contain; }
  .tm-sig-box .meta { padding:12px 14px; font-size:13px; line-height:1.9; }
  .tm-photo-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
  .tm-photo-card { border:1px solid ${BORDER}; border-radius:6px; overflow:hidden; background:${PANEL}; }
  .tm-photo-card img { display:block; width:100%; height:150px; object-fit:cover; }
  .tm-photo-card .cap { padding:5px 7px; font-size:11px; color:${MUTED}; }
  .tm-foot { margin-top:22px; padding-top:14px; border-top:1px solid ${BORDER}; font-size:12.5px; color:${MUTED}; line-height:1.55; }
  .tm-foot strong { color:#111; }
  .tm-foot .sur { margin-top:8px; color:#111; font-weight:600; }

  @media (max-width: 720px) {
    .tm-meta-grid, .tm-sig-wrap { grid-template-columns:1fr; }
    .tm-photo-grid { grid-template-columns:1fr 1fr; }
    .tm-doc { padding:16px; }
  }

  /* ── PRINT: show only the T&M document, full and clean ── */
  @media print {
    @page { size: letter portrait; margin: 0.4in 0.5in 0.5in; }
    *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { background:#fff !important; }
    body * { visibility: hidden !important; }
    .tm-print-root, .tm-print-root * { visibility: visible !important; }
    .tm-print-root { position:absolute; left:0; top:0; width:100%; }
    .no-print { display:none !important; }
    .tm-doc { padding:0 !important; box-shadow:none !important; }
    .tm-section, .tm-meta, .tm-totals, .tm-sig-wrap, .tm-foot, table.tm-table tr, .tm-photo-card {
      page-break-inside: avoid !important; break-inside: avoid !important;
    }
    .tm-h2, .tm-header { page-break-after: avoid !important; }
    .tm-photo-card img { height:170px !important; }
  }
`

// ─── Style objects ───────────────────────────────────────────────────────────
const shadowSm = "0 1px 2px rgba(16,24,40,.05)"
const shadow = "0 1px 2px rgba(16,24,40,.04), 0 4px 14px rgba(16,24,40,.05)"
const shadowMd = "0 10px 30px rgba(16,24,40,.08)"
const shadowLg = "0 24px 60px rgba(16,24,40,.16)"
const greenGrad = "linear-gradient(135deg, #47A047, #2F7F33)"

export const s = {
  app: { minHeight: "100vh", background: BG, color: TEXT },
  loadScreen: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG, flexDirection: "column", gap: 18 },

  // Login
  loginWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(900px 480px at 50% -6%, rgba(74,160,74,.22), transparent 62%), ${SIDE}`, padding: 16 },
  loginCard: { background: SURFACE, border: "none", borderRadius: 20, padding: "clamp(28px,6vw,46px) clamp(22px,5vw,40px)", width: "min(430px, 100%)", boxShadow: "0 30px 80px rgba(0,0,0,.45)" },

  // Fields
  field: { marginBottom: 15 },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" },
  input: { width: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "11px 13px", color: TEXT, fontSize: 14, outline: "none" },
  textarea: { width: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "11px 13px", color: TEXT, fontSize: 14, outline: "none", minHeight: 80, resize: "vertical", fontFamily: "inherit" },

  // Buttons
  btnPrimary: { width: "100%", background: greenGrad, color: "#fff", border: "none", borderRadius: 11, padding: "12px 16px", fontWeight: 800, fontSize: 15, boxShadow: "0 8px 20px rgba(74,160,74,.28)" },
  btnSecondary: { background: SURFACE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 11, padding: "9px 15px", fontWeight: 650, fontSize: 13, boxShadow: shadowSm },
  btnGhost: { background: "transparent", color: MUTED, border: "none", padding: "8px 12px", fontWeight: 600, fontSize: 13, borderRadius: 8 },
  btnDanger: { background: DSOFT, color: DANGER, border: `1px solid #f3c9c4`, borderRadius: 8, padding: "8px 14px", fontWeight: 600, fontSize: 13 },
  btnWarn: { background: WSOFT, color: WARN, border: `1px solid #f0dcb4`, borderRadius: 8, padding: "8px 14px", fontWeight: 600, fontSize: 13 },

  // Layout
  layout: { display: "flex", minHeight: "100vh" },
  sidebar: { width: 252, background: SIDE, borderRight: `1px solid ${SIDE}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 10 },
  sideLogo: { padding: "22px 18px 18px", borderBottom: `1px solid ${SIDE_LINE}`, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 },
  sideNav: { flex: 1, padding: "12px 10px", overflowY: "auto" },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10, marginBottom: 2, cursor: "pointer", fontSize: 14, fontWeight: active ? 700 : 500, color: active ? "#fff" : SIDE_TEXT, background: active ? "rgba(74,160,74,.18)" : "transparent", boxShadow: active ? `inset 3px 0 0 ${G}` : "none" }),
  sideFoot: { padding: "12px 12px", borderTop: `1px solid ${SIDE_LINE}` },
  main: { marginLeft: 252, flex: 1, padding: "30px clamp(20px,4vw,48px)", minHeight: "100vh", maxWidth: 1200 },

  // Page chrome
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 26, flexWrap: "wrap" },
  pageTitle: { fontSize: "clamp(23px,3.4vw,32px)", fontWeight: 800, letterSpacing: "-.8px", color: INK },
  pageSub: { fontSize: 13, color: MUTED, marginTop: 4 },

  card: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "20px 22px", marginBottom: 16, boxShadow: shadow },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 },
  statCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "18px 20px", boxShadow: shadow },
  statVal: { fontSize: 30, fontWeight: 700, letterSpacing: "-1px", color: GD },
  statLabel: { fontSize: 12, color: MUTED, marginTop: 4, fontWeight: 600 },

  // Clock
  clockCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 22, padding: "clamp(22px,5vw,42px)", textAlign: "center", boxShadow: shadowMd },
  clockTime: { fontSize: "clamp(38px,7vw,60px)", fontWeight: 700, color: INK, letterSpacing: "-2px", marginBottom: 6, whiteSpace: "nowrap" },
  clockDate: { fontSize: 14, color: MUTED, marginBottom: 26 },
  btnClockIn: { background: greenGrad, color: "#fff", border: "none", borderRadius: 15, padding: "18px 40px", fontWeight: 900, fontSize: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", boxShadow: "0 12px 28px rgba(74,160,74,.30)" },
  btnClockOut: { background: DSOFT, color: DANGER, border: `1px solid #f0c4bd`, borderRadius: 14, padding: "18px 40px", fontWeight: 900, fontSize: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%" },

  badge: (color, soft) => ({ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: soft || (color + "1a"), color, letterSpacing: ".2px", whiteSpace: "nowrap" }),

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".4px", padding: "9px 12px", borderBottom: `1px solid ${BORDER}` },
  td: { padding: "12px", borderBottom: `1px solid ${BG}`, fontSize: 13, verticalAlign: "middle" },

  overlay: { position: "fixed", inset: 0, background: "rgba(16,20,26,.45)", backdropFilter: "blur(2px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px calc(48px + env(safe-area-inset-bottom))", overflowY: "auto" },
  modal: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "26px 28px", width: 680, maxWidth: "100%", margin: "auto", animation: "slideIn .18s ease", boxShadow: shadowLg },

  alert: (type) => ({ padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 14, fontWeight: 500,
    background: type === "success" ? GSOFT : type === "warning" ? WSOFT : DSOFT,
    color: type === "success" ? GD : type === "warning" ? WARN : DANGER,
    border: `1px solid ${type === "success" ? "#cfe6ad" : type === "warning" ? "#f0dcb4" : "#f3c9c4"}` }),
}
