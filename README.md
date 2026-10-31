# Empire TimeCard

Time clock, jobs, T&M work orders, timecards, and crew map for **Empire Electric**.
React + Vite on Vercel, Supabase for auth and data.

## Stack
- `src/` React app. Branding lives in `src/brand.js` and `src/theme.js`.
- `public/brand/` logo and icons (logo text is outlined, no font dependency).
- `supabase/schema.sql` tables, Row Level Security, helper functions.
- `supabase/functions/admin-users` Edge Function for creating logins, resetting
  passwords, and changing login emails (uses the service role, never the browser).

## Access model
| Who | Can |
|---|---|
| Field crew | Clock in/out, see and sign their own time, submit T&M sheets, read jobs/customers |
| Admins | Everything, including the Team page, crew map, exports, approvals |
| Owner (`is_owner`) | Admin access, hidden from crew lists, no time clock |

Signed-out visitors can't read anything.

## Environment variables (Vercel → Settings → Environment Variables)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable key)
- `VITE_GOOGLE_MAPS_KEY`

## Local dev
```bash
cp .env.example .env   # fill in values
npm install
npm run dev
```

Pushing to `main` deploys automatically.
