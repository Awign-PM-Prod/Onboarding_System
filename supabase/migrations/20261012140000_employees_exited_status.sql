-- Document EXITED onboarding_status for the exit / rehire flow.
-- Employees marked EXITED have no ACTIVE project assignment and keep KYC on job_app_form.

comment on column public.employees.onboarding_status is
  'Onboarding lifecycle status (e.g. AVAILABLE, ROLE_ASSIGNED, FORM_SENT, Form Submitted, EXITED). EXITED means left project with no active assignment; eligible for rehire.';
