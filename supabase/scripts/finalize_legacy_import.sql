-- Complete a Railway data import. Supabase Auth owns passwords, so legacy
-- bcrypt hashes are discarded. Any application roles absent from the source
-- database are then added without changing imported role IDs.
update portal.users set password = null where password is not null;

insert into portal.roles (id, name, author)
select gen_random_uuid()::text, role_name, 'supabase_import'
from unnest(array[
  'super_admin', 'national_head', 'noc', 'state_planner', 'project_head',
  'engineer', 'l2_engineer', 'l3_engineer', 'customer', 'asset_manager', 'vendor'
]) as required(role_name)
where not exists (
  select 1
  from portal.roles
  where lower(roles.name) = lower(required.role_name)
    and roles.deleted = false
);

-- The original backfill migration may have run before imported customers were
-- present. Ensure every imported customer still receives a default project.
insert into ticket.projects (id, customer_id, name, author, deleted, created_at)
select
  gen_random_uuid()::text,
  customer.id,
  coalesce(nullif(btrim(customer.company_name), ''), 'Customer') || ' - General Support',
  'supabase_import',
  false,
  now()
from ticket.customers as customer
where customer.deleted = false
  and not exists (
    select 1 from ticket.projects as project
    where project.customer_id = customer.id
      and project.deleted = false
  );

analyze portal.users;
analyze portal.roles;
analyze portal.user_roles;
analyze ticket.customers;
analyze ticket.projects;
analyze ticket.tickets;
