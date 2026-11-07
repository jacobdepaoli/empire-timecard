// sheets-sync: the hub side of the two-way Google Sheet sync for Inventory.
// Called only by the Apps Script inside the Sheet, with header  x-sync-key: <key from Inventory → Google Sheet>.
//
//   { action: "snapshot", skus?: string[] }
//       → { items: Row[], categories: string[], types: string[], server_time }
//       Every active item, plus any SKU the sheet already lists (so retired items show Active = false).
//
//   { action: "push", rows: [{ row, sku?, ...fields, on_hand? }], editor? }
//       → { results: [{ row, ok, sku?, item?, error? }] }
//       Rows without a SKU become new items (SKU assigned from the category prefix).
//       A changed "On hand · Main Shop" is recorded as a count at Main Shop, labeled with the editor.
import { createClient } from "npm:@supabase/supabase-js@2"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const TYPES: Record<string, string> = { material: "Material", tool: "Tool", equipment: "Equipment", consumable: "Consumable", asset: "Asset" }
const TEXT_FIELDS = ["category", "family", "name", "size_rating", "configuration", "unit", "mfr_part_number", "photo_location", "notes"]
const NUM_FIELDS = ["min_qty", "unit_cost"]
const BOOL_FIELDS = ["billable", "active"]
const MAIN_SHOP = "Main Shop"

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
}

// "$1,234.50" → 1234.5 ; "" → null ; junk → NaN (reported as an error)
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") return v
  const n = Number(String(v).replace(/[$,\s]/g, ""))
  return Number.isFinite(n) ? n : NaN
}
function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v
  return /^(true|yes|y|1|x)$/i.test(String(v ?? "").trim())
}
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d

async function mainShopId() {
  const { data } = await db.from("inv_locations").select("id").eq("name", MAIN_SHOP).eq("kind", "shop").maybeSingle()
  if (data) return data.id as string
  const { data: made, error } = await db.from("inv_locations").insert({ name: MAIN_SHOP, kind: "shop" }).select("id").single()
  if (error) throw error
  return made.id as string
}

// Stock per item: Main Shop qty, total, and a readable list of everywhere else.
async function stockFor(itemIds: string[], shopId: string) {
  const out: Record<string, { main: number; total: number; other: string }> = {}
  if (!itemIds.length) return out
  const { data: locs } = await db.from("inv_locations").select("id,name")
  const locName = Object.fromEntries((locs || []).map((l) => [l.id, l.name]))
  for (let i = 0; i < itemIds.length; i += 300) {
    const { data, error } = await db.from("inv_stock").select("item_id,location_id,qty").in("item_id", itemIds.slice(i, i + 300))
    if (error) throw error
    for (const r of data || []) {
      const q = Number(r.qty || 0)
      const o = (out[r.item_id] ||= { main: 0, total: 0, other: "" })
      o.total += q
      if (r.location_id === shopId) o.main += q
      else if (q !== 0) o.other += `${o.other ? "; " : ""}${locName[r.location_id] || "Other"}: ${round(q)}`
    }
  }
  return out
}

function toRow(it: Record<string, any>, st?: { main: number; total: number; other: string }) {
  const total = round(st?.total || 0)
  return {
    sku: it.sku, category: it.category || "", family: it.family || "", name: it.name || "",
    size_rating: it.size_rating || "", configuration: it.configuration || "", unit: it.unit || "",
    type: TYPES[it.type] || it.type || "",
    on_hand: round(st?.main || 0), on_hand_total: total,
    min_qty: it.min_qty == null ? "" : Number(it.min_qty), unit_cost: it.unit_cost == null ? "" : Number(it.unit_cost),
    value: it.unit_cost == null ? "" : round(total * Number(it.unit_cost), 2),
    other_locations: st?.other || "", mfr_part_number: it.mfr_part_number || "", photo_location: it.photo_location || "",
    billable: !!it.billable, active: !!it.active, notes: it.notes || "", updated_at: it.updated_at,
  }
}

async function snapshot(skus: string[]) {
  const shopId = await mainShopId()
  const items: Record<string, any>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("inv_items").select("*").eq("active", true).order("sku").range(from, from + 999)
    if (error) throw error
    items.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const have = new Set(items.map((i) => i.sku))
  const missing = skus.filter((s) => s && !have.has(s))
  for (let i = 0; i < missing.length; i += 300) {
    const { data } = await db.from("inv_items").select("*").in("sku", missing.slice(i, i + 300))
    items.push(...(data || []))
  }
  const st = await stockFor(items.map((i) => i.id), shopId)
  const { data: cats } = await db.from("inv_categories").select("name,subcategories").order("sort")
  return {
    items: items.map((i) => toRow(i, st[i.id])),
    categories: (cats || []).map((c) => c.name),
    subcategories: [...new Set((cats || []).flatMap((c) => c.subcategories || []))],
    types: Object.values(TYPES),
    server_time: new Date().toISOString(),
  }
}

async function push(rows: Record<string, any>[], editor: string) {
  const shopId = await mainShopId()
  const { data: cats } = await db.from("inv_categories").select("name,kind,subcategories")
  const catKind = Object.fromEntries((cats || []).map((c) => [c.name, c.kind]))
  const catSubs: Record<string, string[]> = Object.fromEntries((cats || []).map((c) => [c.name, c.subcategories || []]))
  // Subcategory must belong to the item's category; a category change clears a subcategory that no longer fits.
  const fitSub = (patch: Record<string, unknown>, category: string, current: string | null) => {
    const subs = catSubs[category] || []
    if ("family" in patch && patch.family && !subs.includes(String(patch.family)))
      throw new Error(`"${patch.family}" isn't a subcategory of ${category}. Pick one from the list.`)
    if (!("family" in patch) && "category" in patch && current && !subs.includes(current)) patch.family = null
  }
  const typeKey = (v: unknown) => {
    const t = String(v ?? "").trim().toLowerCase()
    return t ? (Object.keys(TYPES).find((k) => k === t || TYPES[k].toLowerCase() === t) ?? "") : null
  }
  const results = []
  for (const r of rows.slice(0, 500)) {
    try {
      // Build the patch from whatever columns the sheet sent.
      const patch: Record<string, unknown> = {}
      for (const f of TEXT_FIELDS) if (f in r) patch[f] = String(r[f] ?? "").trim() || null
      for (const f of NUM_FIELDS) if (f in r) {
        const n = num(r[f]); if (Number.isNaN(n)) throw new Error(`${f === "unit_cost" ? "Unit cost" : "Reorder at"} must be a number.`)
        patch[f] = n
      }
      for (const f of BOOL_FIELDS) if (f in r) patch[f] = bool(r[f])
      if ("type" in r) {
        const t = typeKey(r.type); if (t === "") throw new Error("Type must be Material, Tool, Equipment, Consumable, or Asset.")
        if (t) patch.type = t; else delete patch.type
      }
      if ("category" in patch && !catKind[String(patch.category ?? "")])
        throw new Error("Pick a category from the dropdown.")
      const onHand = "on_hand" in r ? num(r.on_hand) : null
      if (Number.isNaN(onHand)) throw new Error("On hand must be a number.")
      if (onHand != null && onHand < 0) throw new Error("On hand can't be negative.")

      let item: Record<string, any> | null = null
      const sku = String(r.sku ?? "").trim()
      if (sku) {
        const { data: found } = await db.from("inv_items").select("*").eq("sku", sku).maybeSingle()
        if (!found) throw new Error(`SKU ${sku} isn't in the hub. Clear the SKU cell to add this as a new item.`)
        if (patch.name === null) throw new Error("Item name can't be blank.")
        fitSub(patch, String(patch.category ?? found.category), found.family)
        const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => (found[k] ?? null) !== v && !(typeof v === "number" && Number(found[k]) === v)))
        if (Object.keys(changed).length) {
          const { data: upd, error } = await db.from("inv_items").update(changed).eq("id", found.id).select("*").single()
          if (error) throw error
          item = upd
        } else item = found
      } else {
        if (!patch.name) throw new Error("Add an item name.")
        if (!patch.category) throw new Error("Pick a category, then the item is added to the hub.")
        fitSub(patch, String(patch.category), null)
        const { data: nextSku, error: sErr } = await db.rpc("inv_next_sku", { p_category: patch.category })
        if (sErr || !nextSku) throw new Error("Couldn't assign a SKU.")
        // A brand-new row's checkboxes start unchecked, so new items are always active, and billable
        // follows the category (materials and consumables bill) unless the sheet ticked it.
        const kind = catKind[patch.category as string] || "material"
        const given = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== null && k !== "active" && k !== "billable"))
        const row = { unit: "each", type: kind, ...given, billable: patch.billable === true || ["material", "consumable"].includes(String(given.type || kind)), active: true, stocked: true, sku: nextSku }
        const { data: made, error } = await db.from("inv_items").insert(row).select("*").single()
        if (error) throw new Error(/duplicate/i.test(error.message) ? "SKU clash, try again." : error.message)
        item = made
      }

      // On-hand change at Main Shop → a count in the ledger.
      if (onHand != null) {
        const { data: cur } = await db.from("inv_stock").select("qty").eq("item_id", item!.id).eq("location_id", shopId).maybeSingle()
        const delta = round(onHand - Number(cur?.qty || 0))
        if (delta !== 0) {
          const note = `Google Sheet${editor ? ` · ${editor}` : ""}`
          const tx = delta > 0
            ? { item_id: item!.id, type: "count", qty: delta, to_location_id: shopId, note }
            : { item_id: item!.id, type: "count", qty: -delta, from_location_id: shopId, note }
          const { error } = await db.from("inv_transactions").insert(tx)
          if (error) throw error
        }
      }
      const st = await stockFor([item!.id], shopId)
      results.push({ row: r.row, ok: true, sku: item!.sku, item: toRow(item!, st[item!.id]) })
    } catch (e) {
      results.push({ row: r.row, ok: false, error: (e as Error).message || "Couldn't save this row." })
    }
  }
  return { results }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405)
  const key = req.headers.get("x-sync-key") || ""
  if (!key.startsWith("ehsync_")) return json({ error: "Missing or invalid sync key." }, 401)
  const { data: k } = await db.from("inv_sync_keys").select("id,revoked_at").eq("key_hash", await sha256(key)).maybeSingle()
  if (!k || k.revoked_at) return json({ error: "This sync key isn't valid. Create a new one in Empire Hub → Inventory → Google Sheet." }, 401)
  await db.from("inv_sync_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id)

  let body: Record<string, any>
  try { body = await req.json() } catch { return json({ error: "Bad request." }, 400) }
  try {
    if (body.action === "snapshot") return json(await snapshot(Array.isArray(body.skus) ? body.skus.map(String) : []))
    if (body.action === "push") return json(await push(Array.isArray(body.rows) ? body.rows : [], String(body.editor || "").slice(0, 120)))
    return json({ error: "Unknown action." }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: "Hub error. Try again in a minute." }, 500)
  }
})
