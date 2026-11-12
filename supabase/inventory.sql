-- ════════════════════════════════════════════════════════════════════════════
--  Empire Hub: Inventory (phase 1). Applied 2026-11-05 as migrations
--  inventory_phase1_schema + inv_stock_security_invoker. Saved here for the record.
-- ════════════════════════════════════════════════════════════════════════════

-- Locations: shop (with bins), vehicles, jobs-as-locations, suppliers
create table if not exists public.inv_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('shop','vehicle','job','supplier')),
  bin text,
  job_id uuid references public.jobs(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Item master: both stocked items and the catalog pick-list
create table if not exists public.inv_items (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  category text,
  family text,
  name text not null,
  size_rating text,
  configuration text,
  unit text default 'each',
  mfr_part_number text,
  barcode text,
  type text not null default 'material' check (type in ('material','tool','equipment','consumable','asset')),
  billable boolean not null default true,
  unit_cost numeric,
  pricing_basis text,
  min_qty numeric,
  photo_location text,
  photo_url text,
  notes text,
  stocked boolean not null default true,  -- true = we carry it; false = catalog candidate
  active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists inv_items_category_idx on public.inv_items (category);
create index if not exists inv_items_family_idx on public.inv_items (family);
create index if not exists inv_items_barcode_idx on public.inv_items (barcode);

-- Ledger: every movement is one row; stock on hand is the sum of this table
create table if not exists public.inv_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inv_items(id) on delete cascade,
  type text not null check (type in ('receive','issue','transfer','return','adjust','count')),
  qty numeric not null,
  from_location_id uuid references public.inv_locations(id) on delete set null,
  to_location_id uuid references public.inv_locations(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  tm_sheet_id uuid references public.tm_sheets(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  unit_cost numeric,
  po_id uuid,
  note text,
  created_at timestamptz default now()
);
create index if not exists inv_tx_item_idx on public.inv_transactions (item_id);
create index if not exists inv_tx_job_idx on public.inv_transactions (job_id);
create index if not exists inv_tx_created_idx on public.inv_transactions (created_at);

-- Purchase orders (scaffold for phase 3 receiving)
create table if not exists public.inv_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text,
  supplier text,
  status text default 'draft',
  needed_by date,
  created_by uuid references public.employees(id) on delete set null,
  notes text,
  created_at timestamptz default now()
);
create table if not exists public.inv_po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.inv_purchase_orders(id) on delete cascade,
  item_id uuid references public.inv_items(id) on delete set null,
  description text,
  qty numeric,
  unit_cost numeric,
  received_qty numeric default 0
);
alter table public.inv_transactions
  add constraint inv_tx_po_fk foreign key (po_id)
  references public.inv_purchase_orders(id) on delete set null;

-- On-hand view: signed sum of the ledger per item per location
create or replace view public.inv_stock as
select item_id, location_id, sum(delta) as qty
from (
  select item_id, to_location_id   as location_id,  qty as delta
  from public.inv_transactions where to_location_id is not null
  union all
  select item_id, from_location_id as location_id, -qty as delta
  from public.inv_transactions where from_location_id is not null
) t
group by item_id, location_id;
alter view public.inv_stock set (security_invoker = on);

-- RLS: same is_admin() / is_active_employee() pattern as the rest of the hub
alter table public.inv_locations        enable row level security;
alter table public.inv_items            enable row level security;
alter table public.inv_transactions     enable row level security;
alter table public.inv_purchase_orders  enable row level security;
alter table public.inv_po_lines         enable row level security;

create policy inv_loc_select  on public.inv_locations       for select to authenticated using (is_active_employee());
create policy inv_item_select on public.inv_items           for select to authenticated using (is_active_employee());
create policy inv_tx_select   on public.inv_transactions    for select to authenticated using (is_active_employee());
create policy inv_po_select   on public.inv_purchase_orders for select to authenticated using (is_active_employee());
create policy inv_pol_select  on public.inv_po_lines        for select to authenticated using (is_active_employee());

create policy inv_loc_write  on public.inv_locations       for all to authenticated using (is_admin()) with check (is_admin());
create policy inv_item_write on public.inv_items           for all to authenticated using (is_admin()) with check (is_admin());
create policy inv_po_write   on public.inv_purchase_orders for all to authenticated using (is_admin()) with check (is_admin());
create policy inv_pol_write  on public.inv_po_lines        for all to authenticated using (is_admin()) with check (is_admin());

-- Transactions: admins do anything; field crew may only issue / return / transfer / count under their own name
create policy inv_tx_insert on public.inv_transactions for insert to authenticated
  with check (
    is_admin() or (
      is_active_employee()
      and employee_id = auth.uid()
      and type in ('issue','return','transfer','count')
    )
  );
create policy inv_tx_update on public.inv_transactions for update to authenticated using (is_admin()) with check (is_admin());
create policy inv_tx_delete on public.inv_transactions for delete to authenticated using (is_admin());

-- ── 2026-11-07: standard categories, SKU numbering, field-crew movement rules ──
-- (migration inventory_categories_and_field_rules; stocked items were remapped into these categories)
create table if not exists public.inv_categories (
  name text primary key,
  sort int not null,
  prefix text not null unique,
  kind text not null default 'material' check (kind in ('material','tool','equipment','consumable','asset'))
);
insert into public.inv_categories (name, sort, prefix, kind) values
  ('Wire & Cable', 10, 'WIR', 'material'), ('Conduit, Raceway & Fittings', 20, 'CON', 'material'),
  ('Boxes & Enclosures', 30, 'BOX', 'material'), ('Wiring Devices & Plates', 40, 'DEV', 'material'),
  ('Distribution & Circuit Protection', 50, 'DST', 'material'), ('Lighting & Controls', 60, 'LTG', 'material'),
  ('Connectors, Grounding & Terminations', 70, 'CGT', 'material'), ('Strut, Supports & Fasteners', 80, 'SUP', 'material'),
  ('Low Voltage & Data', 90, 'LVD', 'material'), ('Motor Controls & Industrial', 100, 'MCI', 'material'),
  ('Tape, Labels & Consumables', 110, 'CNS', 'consumable'), ('Tools & Test Equipment', 120, 'TLS', 'tool'),
  ('Safety & PPE', 130, 'SAF', 'equipment'), ('Shop & Office', 140, 'SHP', 'asset')
on conflict (name) do nothing;
alter table public.inv_categories enable row level security;
revoke all on public.inv_categories from anon;
create policy inv_cat_select on public.inv_categories for select to authenticated using (public.is_active_employee());
create policy inv_cat_write on public.inv_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.inv_next_sku(p_category text) returns text
language sql stable security definer set search_path = '' as $$
  select c.prefix || '-' || lpad((coalesce(max(nullif(regexp_replace(i.sku, '^' || c.prefix || '-', ''), i.sku)::int), 0) + 1)::text, 3, '0')
  from public.inv_categories c
  left join public.inv_items i on i.sku ~ ('^' || c.prefix || '-[0-9]+$')
  where c.name = p_category
  group by c.prefix
$$;
revoke all on function public.inv_next_sku(text) from public, anon;
grant execute on function public.inv_next_sku(text) to authenticated;

alter table public.inv_items add column if not exists updated_at timestamptz not null default now();
create or replace function public.inv_touch_item() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists inv_items_touch on public.inv_items;
create trigger inv_items_touch before update on public.inv_items for each row execute function public.inv_touch_item();
revoke all on function public.inv_touch_item() from public, anon, authenticated;

drop policy if exists inv_tx_insert on public.inv_transactions;
create policy inv_tx_insert on public.inv_transactions for insert to authenticated
  with check (
    public.is_admin() or (
      public.is_active_employee() and employee_id = auth.uid() and qty > 0 and (
        (type = 'issue'    and from_location_id is not null and to_location_id is null and job_id is not null) or
        (type = 'transfer' and from_location_id is not null and to_location_id is not null and from_location_id <> to_location_id) or
        (type = 'return'   and to_location_id is not null and from_location_id is null and job_id is not null)
      )
    )
  );

-- ── 2026-11-07: Google Sheet sync keys (migration inventory_sheet_sync_keys) ──
-- Used by supabase/functions/sheets-sync (verify_jwt off; it checks x-sync-key against these hashes)
-- and public/empire-hub-sheet-sync.gs (the Apps Script that runs inside the Google Sheet).
create table if not exists public.inv_sync_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Google Sheet',
  key_hash text not null unique,
  key_hint text not null,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.inv_sync_keys enable row level security;
revoke all on public.inv_sync_keys from anon;
create policy inv_sync_keys_admin_select on public.inv_sync_keys for select to authenticated using (public.is_admin());
create policy inv_sync_keys_admin_revoke on public.inv_sync_keys for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.inv_create_sync_key(p_label text default 'Google Sheet') returns text
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if not public.is_admin() then raise exception 'Only admins can create sync keys'; end if;
  k := 'ehsync_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.inv_sync_keys (label, key_hash, key_hint, created_by)
  values (coalesce(nullif(trim(p_label), ''), 'Google Sheet'), encode(extensions.digest(k, 'sha256'), 'hex'), right(k, 4), auth.uid());
  return k;
end $$;
revoke all on function public.inv_create_sync_key(text) from public, anon;
grant execute on function public.inv_create_sync_key(text) to authenticated;
grant execute on function public.inv_next_sku(text) to service_role;
create extension if not exists pg_net;

-- ── 2026-11-07 (later): DigiKey-based naming ──
-- inv_categories was rebuilt with 29 categories: DigiKey's exact names where DigiKey has the category,
-- trade names in DigiKey's style where it doesn't (source = 'Trade'). Each lists its subcategories, which
-- inv_items.family must match. Item names were rewritten noun-first; the original photo description is in notes.
-- The full mapping (and the SQL it generates) lives in supabase/inventory_naming.py.
alter table public.inv_categories add column if not exists source text not null default 'DigiKey' check (source in ('DigiKey','Trade'));
alter table public.inv_categories add column if not exists subcategories jsonb not null default '[]'::jsonb;

-- ─── Migration: inventory_category_admin_functions ───────────────────────────
-- Used by Inventory › Manage & export › Categories. Renames carry every item along atomically.
-- inv_rename_category(p_old, p_new): admin only; refuses a name already in use; updates inv_categories.name and inv_items.category.
-- inv_rename_subcategory(p_category, p_old, p_new): admin only; renames in place in inv_categories.subcategories (order kept) and inv_items.family.
-- Both: security definer, search_path '', execute granted to authenticated only.

-- ─── 2026-11-11 (Jacob): building wire added, "Hook-Up Wire" renamed "Electrical Wire" ─────────
-- Cables, Wires subcategories now: Electrical Wire, THHN (Copper); Electrical Wire, XHHW (Aluminum);
--   NM-B Cable (Romex); MC Cable (Metal-Clad); Single Conductor Cables (Electrical Wire); Multiple Conductor
--   Cables; Coaxial Cables (RF); Fiber Optic Cables.
-- WIR-001..072  THHN copper  #18,#14,#12,#10,#8,#6,#4,#2 x Black,Red,Blue,Green,White,Grey,Brown,Orange,Yellow (ft)
-- WIR-073..144  XHHW aluminum, same gauges x colors (ft)
-- WIR-145..154  NM-B (Romex) 12/2,12/3,14/2,14/3,10/2,10/3,8/2,8/3,6/2,6/3 w/ ground (ft)
-- WIR-155..164  MC, same sizes (ft)
-- On hand was zeroed the same day for a fresh count (backup.inv_transactions_20261111).
