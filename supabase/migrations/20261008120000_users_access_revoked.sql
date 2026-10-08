-- Super Admin can revoke (and restore) portal access for Program Managers and Payroll Leads.
-- Revoked users keep their profile row so client/employee history stays intact.

alter table public.users
  add column if not exists access_revoked_at timestamptz null,
  add column if not exists access_revoked_by uuid null references public.users (id) on delete set null;

comment on column public.users.access_revoked_at is
  'When set, the user is blocked from signing in and from all authenticated API calls.';
comment on column public.users.access_revoked_by is
  'Super Admin who revoked access (null when access is active).';
