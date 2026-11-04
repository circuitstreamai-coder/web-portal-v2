-- Role-specific usernames for canonical email-based portal identities.
create table if not exists portal.login_aliases (
  id text primary key,
  username text not null,
  user_id text not null references portal.users(id) on delete cascade on update cascade,
  role_id text not null references portal.roles(id) on delete cascade on update cascade,
  author text,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists login_aliases_username_lower_unique
  on portal.login_aliases(lower(username));
create index if not exists login_aliases_user_id_idx
  on portal.login_aliases(user_id);

alter table portal.login_aliases enable row level security;
revoke all on portal.login_aliases from anon, authenticated;
grant all privileges on portal.login_aliases to service_role;
