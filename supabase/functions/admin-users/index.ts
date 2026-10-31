// admin-users: account actions that need the service role key.
//   create          { employee: {...} }        → { id, temp_password }
//   reset_password  { id }                     → { temp_password }
//   update_email    { id, email }              → { ok: true }
// Caller must be a signed-in, active admin. The owner account can only be
// changed by the owner.
import { createClient } from "npm:@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

// Readable temp password, no look-alike characters: e.g. K7MP-Q4XR-9TWD
function tempPassword() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join("")).join("-")
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMPLOYEE_FIELDS = [
  "name", "phone", "role", "is_admin", "gps_required", "photo_url", "address", "city", "state", "zip",
  "emergency_contact", "emergency_phone", "hire_date", "pay_rate", "license_number", "notes",
]

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405)

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
  const { data: authData } = await admin.auth.getUser(jwt)
  const caller = authData?.user
  if (!caller) return json({ error: "Please sign in again." }, 401)

  const { data: me } = await admin.from("employees").select("id,is_admin,is_owner,active").eq("id", caller.id).maybeSingle()
  if (!me?.active || !me.is_admin) return json({ error: "Only admins can do that." }, 403)

  let body: Record<string, any>
  try { body = await req.json() } catch { return json({ error: "Bad request." }, 400) }

  // Owner account is off-limits to everyone but the owner.
  const guardTarget = async (id: string) => {
    if (!id) return "Missing employee id."
    const { data: target } = await admin.from("employees").select("id,is_owner").eq("id", id).maybeSingle()
    if (!target) return "Employee not found."
    if (target.is_owner && !me.is_owner) return "That account can't be changed here."
    return null
  }

  switch (body.action) {
    case "create": {
      const e = body.employee || {}
      const email = String(e.email || "").toLowerCase().trim()
      const name = String(e.name || "").trim()
      if (!name) return json({ error: "Name is required." }, 400)
      if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email." }, 400)

      const temp = tempPassword()
      const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password: temp, email_confirm: true })
      if (cErr || !created?.user) {
        const taken = /already|registered|exists/i.test(cErr?.message || "")
        return json({ error: taken ? "That email already has a login." : "Couldn't create the login." }, 400)
      }

      const row: Record<string, unknown> = { id: created.user.id, email, name, active: true, is_owner: false, must_change_password: true }
      for (const k of EMPLOYEE_FIELDS) if (k in e && k !== "name") row[k] = e[k]
      const { error: iErr } = await admin.from("employees").insert(row)
      if (iErr) {
        await admin.auth.admin.deleteUser(created.user.id)
        return json({ error: "Couldn't save the employee profile." }, 400)
      }
      return json({ id: created.user.id, temp_password: temp })
    }

    case "reset_password": {
      const bad = await guardTarget(body.id)
      if (bad) return json({ error: bad }, 400)
      const temp = tempPassword()
      const { error } = await admin.auth.admin.updateUserById(body.id, { password: temp })
      if (error) return json({ error: "Couldn't reset the password." }, 400)
      await admin.from("employees").update({ must_change_password: true }).eq("id", body.id)
      return json({ temp_password: temp })
    }

    case "update_email": {
      const bad = await guardTarget(body.id)
      if (bad) return json({ error: bad }, 400)
      const email = String(body.email || "").toLowerCase().trim()
      if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email." }, 400)
      const { error } = await admin.auth.admin.updateUserById(body.id, { email, email_confirm: true })
      if (error) return json({ error: /already|registered|exists/i.test(error.message) ? "That email already has a login." : "Couldn't change the email." }, 400)
      await admin.from("employees").update({ email }).eq("id", body.id)
      return json({ ok: true })
    }

    default:
      return json({ error: "Unknown action." }, 400)
  }
})
