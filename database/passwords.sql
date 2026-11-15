-- Append-only credentials migration for existing installations.
create table public.app_credentials (
 role text primary key check(role in ('admin','terminal')),
 password_hash text not null,
 version uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now()
);
alter table public.app_credentials enable row level security;
revoke all on public.app_credentials from public,anon,authenticated;
grant select,insert,update,delete on public.app_credentials to service_role;
