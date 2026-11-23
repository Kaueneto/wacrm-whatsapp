create table public.uau_connections (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  base_url text not null,
  api_version text not null,
  session_header text not null,
  bearer boolean not null default false,
  credentials_encrypted text not null,
  session_encrypted text,
  session_expires_at timestamptz,
  revision uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.uau_connections enable row level security;
revoke all on public.uau_connections from public, anon, authenticated;
grant select, insert, update, delete on public.uau_connections to service_role;
