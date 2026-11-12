// Cost = what we pay the supply house (updated by each receive). Sell = Depot price.
// If Sell is blank, Markup % over Cost sets it. No tax anywhere (Jacob, 2026-11-12).
const n = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v))
export function sellOf(i) {
  const sell = n(i?.sell_price), cost = n(i?.unit_cost), mk = n(i?.markup_pct)
  if (sell != null) return sell
  if (cost != null && mk != null) return Math.round(cost * (1 + mk / 100) * 10000) / 10000
  return null
}
// Actual markup % between cost and sell (whichever way sell was set).
export function markupOf(i) {
  const cost = n(i?.unit_cost), sell = sellOf(i)
  if (cost == null || sell == null || cost === 0) return null
  return Math.round(((sell - cost) / cost) * 1000) / 10
}
export const sellFromMarkup = (i) => n(i?.sell_price) == null && n(i?.markup_pct) != null
