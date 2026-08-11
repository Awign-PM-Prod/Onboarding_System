-- Staff account invites (PM sets own password) and SA-mediated password reset requests.

create table if not exists public.staff_account_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  invited_by uuid null references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists staff_account_invites_one_pending_per_user
  on public.staff_account_invites (user_id)
  where consumed_at is null;

create index if not exists staff_account_invites_token_hash_idx
  on public.staff_account_invites (token_hash)
  where consumed_at is null;

comment on table public.staff_account_invites is
  'One-time invite tokens for Program Managers to set name and password after SA/PL invite.';

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'FULFILLED', 'CANCELLED')),
  requested_at timestamptz not null default now(),
  fulfilled_by uuid null references public.users (id) on delete set null,
  fulfilled_at timestamptz null
);

create unique index if not exists password_reset_requests_one_pending_per_user
  on public.password_reset_requests (user_id)
  where status = 'PENDING';

create index if not exists password_reset_requests_status_requested_idx
  on public.password_reset_requests (status, requested_at desc);

comment on table public.password_reset_requests is
  'PM/PL forgot-password requests for Super Admin to fulfill and email a new password.';
