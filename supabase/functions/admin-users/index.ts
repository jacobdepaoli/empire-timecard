// admin-users: login management. Super admin only (employees.is_super; Jacob).
//   list            {}                         → { users: [{ ...employee, last_sign_in_at, login_disabled }] }
//   create          { employee: {...} }        → { id, temp_password }
//   reset_password  { id }                     → { temp_password }
//   update_email    { id, email }              → { ok: true }
//   set_access      { id, enabled }            → { ok: true }   (off = can't sign in; sessions end within the hour)
//   set_admin       { id, is_admin }           → { ok: true }
// The super admin can't turn off their own access or admin rights (no lockout).
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
const FOREVER = "876000h" // ~100 years

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

  const { data: me } = await admin.from("employees").select("id,is_admin,is_super,active").eq("id", caller.id).maybeSingle()
  if (!me?.active || !me.is_super) return json({ error: "Only the super admin can manage logins." }, 403)

  let body: Record<string, any>
  try { body = await req.json() } catch { return json({ error: "Bad request." }, 400) }

  const target = async (id: string) => {
    if (!id) return { error: "Missing employee id." }
    const { data } = await admin.from("employees").select("id,name,is_owner,is_super").eq("id", id).maybeSingle()
    return data ? { emp: data } : { error: "Employee not found." }
  }

  switch (body.action) {
    case "list": {
      const { data: emps, error } = await admin.from("employees").select("id,name,email,role,is_admin,is_owner,is_super,active,must_change_password,photo_url,created_at").order("name")
      if (error) return json({ error: "Couldn't load accounts." }, 500)
      const auth: Record<string, any> = {}
      for (let page = 1; page < 20; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
        for (const u of data?.users || []) auth[u.id] = u
        if (!data || data.users.length < 200) break
      }
      const users = (emps || []).map((e) => {
        const u = auth[e.id]
        const banned = u?.banned_until && new Date(u.banned_until) > new Date()
        return { ...e, last_sign_in_at: u?.last_sign_in_at || null, has_login: !!u, login_disabled: !!banned || !e.active }
      })
      return json({ users })
    }

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

      const row: Record<string, unknown> = { id: created.user.id, email, name, active: true, is_owner: !!e.is_owner, is_super: false, must_change_password: true }
      for (const k of EMPLOYEE_FIELDS) if (k in e && k !== "name") row[k] = e[k]
      if (e.is_owner) row.is_admin = true
      const { error: iErr } = await admin.from("employees").insert(row)
      if (iErr) {
        await admin.auth.admin.deleteUser(created.user.id)
        return json({ error: "Couldn't save the employee profile." }, 400)
      }
      return json({ id: created.user.id, temp_password: temp })
    }

    case "reset_password": {
      const t = await target(body.id); if (t.error) return json({ error: t.error }, 400)
      const temp = tempPassword()
      const { error } = await admin.auth.admin.updateUserById(body.id, { password: temp })
      if (error) return json({ error: "Couldn't reset the password." }, 400)
      await admin.from("employees").update({ must_change_password: true }).eq("id", body.id)
      return json({ temp_password: temp })
    }

    case "update_email": {
      const t = await target(body.id); if (t.error) return json({ error: t.error }, 400)
      const email = String(body.email || "").toLowerCase().trim()
      if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email." }, 400)
      const { error } = await admin.auth.admin.updateUserById(body.id, { email, email_confirm: true })
      if (error) return json({ error: /already|registered|exists/i.test(error.message) ? "That email already has a login." : "Couldn't change the email." }, 400)
      await admin.from("employees").update({ email }).eq("id", body.id)
      return json({ ok: true })
    }

    case "set_access": {
      const t = await target(body.id); if (t.error) return json({ error: t.error }, 400)
      if (body.id === me.id) return json({ error: "You can't turn off your own access." }, 400)
      const enabled = !!body.enabled
      const { error } = await admin.auth.admin.updateUserById(body.id, { ban_duration: enabled ? "none" : FOREVER })
      if (error) return json({ error: "Couldn't change access." }, 400)
      await admin.from("employees").update({ active: enabled }).eq("id", body.id)
      return json({ ok: true })
    }

    case "set_admin": {
      const t = await target(body.id); if (t.error) return json({ error: t.error }, 400)
      if (body.id === me.id) return json({ error: "You can't change your own admin rights." }, 400)
      await admin.from("employees").update({ is_admin: !!body.is_admin }).eq("id", body.id)
      return json({ ok: true })
    }

    default:
      return json({ error: "Unknown action." }, 400)
  }
})
