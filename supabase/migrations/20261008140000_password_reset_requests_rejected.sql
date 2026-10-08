-- Super Admin can reject a PM/PL password reset request instead of fulfilling it.

alter table public.password_reset_requests
  drop constraint if exists password_reset_requests_status_check;

alter table public.password_reset_requests
  add constraint password_reset_requests_status_check
  check (status in ('PENDING', 'FULFILLED', 'CANCELLED', 'REJECTED'));

alter table public.password_reset_requests
  add column if not exists rejected_by uuid null references public.users (id) on delete set null,
  add column if not exists rejected_at timestamptz null;
