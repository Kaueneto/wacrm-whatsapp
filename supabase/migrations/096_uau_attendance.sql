-- User defaults are scoped to the account and connection revision, never to a password.
create table public.uau_attendance_user_settings (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_revision uuid not null,
  uau_login text not null check (length(uau_login) between 1 and 256),
  channel_code integer not null check (channel_code > 0),
  primary key (account_id, user_id)
);
-- Reserve before sending to the ERP. Unknown outcomes remain reserved for manual reconciliation.
create table public.uau_attendance_submissions (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  state text not null default 'pending' check (state in ('pending','succeeded','uncertain')),
  created_at timestamptz not null default now(),
  foreign key (contact_id,account_id) references public.contacts(id,account_id) on delete cascade
);
alter table public.uau_attendance_user_settings enable row level security;
alter table public.uau_attendance_submissions enable row level security;
revoke all on public.uau_attendance_user_settings, public.uau_attendance_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.uau_attendance_user_settings to service_role;
grant select, insert, update on public.uau_attendance_submissions to service_role;
