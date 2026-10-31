# Empire Hub

One sign-in, then a suite of crew tools for **Empire Electric**: TimeCard, Jobs (progress feed),
Announcements, and Resources. React + Vite on Vercel, Supabase for auth and data.

## Stack
- `src/App.jsx` sign-in + routing (`#/tool/...`). `src/Shell.jsx` home screen and tool frame.
- `src/tools/registry.js` the list of tools. **To add a tool:** build it in `src/tools/<name>/`, add one entry there.
- `src/tools/timecard`, `jobs`, `announcements`, `resources` the tools. Shared UI in `src/ui.jsx`.
- Branding lives in `src/brand.js` and `src/theme.js`.
- `public/brand/` logo and icons (logo text is outlined, no font dependency).
- `supabase/schema.sql` core tables, Row Level Security, helper functions. `supabase/hub.sql` announcements, resources, job feed.
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
