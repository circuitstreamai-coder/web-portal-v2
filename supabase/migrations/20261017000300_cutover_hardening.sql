-- Seed the application roles required before the first Auth user is invited.
insert into portal.roles (id, name, author)
select gen_random_uuid()::text, role_name, 'supabase_migration'
from unnest(array[
  'super_admin', 'national_head', 'noc', 'state_planner', 'project_head',
  'engineer', 'l2_engineer', 'l3_engineer', 'customer', 'asset_manager', 'vendor'
]) as seed(role_name)
where not exists (
  select 1 from portal.roles where roles.name = seed.role_name and roles.deleted = false
);

-- Role names are authorization identifiers. Keeping active names unique also
-- makes the Edge Function role lookup deterministic after a legacy import.
create unique index if not exists roles_active_name_unique
  on portal.roles (lower(name)) where deleted = false;

-- Purchase-order uploads now live in private Supabase Storage, not bytea tables.
alter table inventory.purchase_orders
  drop constraint if exists purchase_orders_attachment_file_id_files_id_fk;
-- The replacement FK is intentionally deferred until legacy bytea files have
-- been copied to Storage and their numeric IDs mapped into portal.storage_files.

create table if not exists inventory.config_records (
  id text primary key,
  device_name text not null,
  device_type text not null,
  serial_number text,
  location text,
  ip_address text,
  firmware_version text,
  config_state text not null default 'configured'
    check (config_state in ('configured', 'pending', 'needs_update', 'decommissioned')),
  notes text,
  last_updated timestamptz not null default now(),
  created_by text references portal.users(id) on delete set null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table inventory.config_records enable row level security;
revoke all on inventory.config_records from anon, authenticated;

create index if not exists tickets_assigned_engineer_idx
  on ticket.tickets(assigned_engineer_id) where deleted = false;
create index if not exists tickets_project_idx
  on ticket.tickets(project_id) where deleted = false;
create index if not exists tickets_status_idx
  on ticket.tickets(status) where deleted = false;
create index if not exists notifications_user_idx
  on portal.notifications(user_id, created_at desc) where deleted = false;
create index if not exists storage_files_owner_idx
  on portal.storage_files(owner_user_id) where deleted = false;
