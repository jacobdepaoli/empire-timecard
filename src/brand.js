// ─── Brand + company details (one place to change them) ──────────────────────
// Address / phone / email print on T&M work orders and pre-fill customer emails.
// Leave a value "" to hide that line.
export const BRAND = {
  appName: "TimeCard",
  company: "Empire Electric",
  tagline: "Electrical & Integrated Technology",
  emailDomain: "empireelectricnv.com",
  addr: "",
  phone: "",
  email: "",
  // T&M / job number prefix: EENV + YY + M + DD  (2026-10-31 → EENV261031)
  jobPrefix: "EENV",
}

export const COMPANY = { name: BRAND.company, addr: BRAND.addr, phone: BRAND.phone, email: BRAND.email }
