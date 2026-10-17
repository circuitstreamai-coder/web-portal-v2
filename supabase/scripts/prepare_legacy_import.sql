-- Run only against a newly migrated Supabase project, immediately before
-- restoring a Railway data-only dump. This removes migration-seeded roles so
-- the dump can restore the original role IDs referenced by user_roles.
do $$
begin
  if exists (select 1 from portal.users)
     or exists (select 1 from ticket.customers)
     or exists (select 1 from ticket.tickets) then
    raise exception 'Legacy import target is not empty; refusing to modify seeded roles';
  end if;
end
$$;

delete from portal.roles
where author = 'supabase_migration';
