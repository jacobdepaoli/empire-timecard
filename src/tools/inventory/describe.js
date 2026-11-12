// One readable description per item, built from its fields: size first when it's a simple size,
// then the name, then color/config. e.g. 1/2" EMT Connector · #12 AWG Electrical Wire, THHN Copper, Red
// The fields stay separate in the database; this is only how the item is shown, searched, labeled, and de-duplicated.

export const needsSize = (i) => /^verify$/i.test(String(i?.size_rating || "").trim())

export function fmtSize(sz) {
  const s = String(sz || "").trim()
  if (!s || /^verify$/i.test(s)) return ""
  return s.replace(/[”″]|''/g, '"').replace(/\s*(?:in\.|inch(?:es)?)(?=$|[\s,])/gi, '"')
}

export function describe(i) {
  if (!i) return ""
  const size = fmtSize(i.size_rating), name = String(i.name || "").trim(), cfg = String(i.configuration || "").trim()
  const low = name.toLowerCase()
  let d = name
  if (size && !low.includes(size.toLowerCase())) {
    // Short sizes read naturally in front (1/2" EMT Connector, 20 A Breaker); longer specs go after the name.
    d = /^[#\d]/.test(size) && size.length <= 12 && !size.includes(",") ? `${size} ${name}` : `${name}, ${size}`
  }
  if (cfg && !d.toLowerCase().includes(cfg.toLowerCase())) d += `, ${cfg}`
  return d
}

// Same key = same item described two ways (case, spacing, punctuation, and inch marks ignored).
export const dupKey = (i) => describe(i).toLowerCase().replace(/["”″]|\binch(es)?\b|\bin\./g, "in").replace(/[^a-z0-9/#]+/g, " ").trim()
