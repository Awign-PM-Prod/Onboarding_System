# Common Search & Mobile Number Correction — Design

## 1. Common search

**Who:** Program Manager, Payroll Lead, Super Admin. Payroll Head is excluded.

**Where:** A `GlobalSearch` box under the page title on the Dashboard and Clients list pages:

- PM: `/pm-dashboard/dashboard`, `/pm-dashboard/clients`
- PL: `/dashboard/dashboard`, `/dashboard/clients`
- Super Admin: `/super-admin/dashboard`, `/super-admin/clients`

**Behaviour:** Google-style. Results are fetched after a 250 ms typing pause, need at least 2 characters, and appear in a dropdown grouped into "Clients" and "Employees". Matching text is highlighted, and the dropdown supports ↑/↓, Enter and Esc.

**API:** `GET /api/search?q=...` returns `{ clients: [...], employees: [...] }`.

- Results are scoped with `listAccessibleClientIds`: a PM sees assigned clients only; PL and Super Admin see all clients.
- Clients match on `client_name` or `contract_code` (max 8 results).
- Employees match on `name`, `mobile`, `email`, `emp_code` or `reference_id` (max 15 results). Each employee result includes `client_name` and the review status fields.

**Where a click goes:**

- **Client:**
  - PM: `/pm-dashboard/client/:id/dashboard`
  - PL: `/dashboard/client/:id/dashboard`
  - Super Admin: `/super-admin/client/:id/dashboard`
- **Employee:**
  - PM: `/pm-dashboard/client/:cid/in-progress?employee=:eid`
  - Super Admin: `/super-admin/client/:cid/onboarding/in-progress?employee=:eid`
  - PL: depends on the employee's stage:
    - PM approved and pending PL → `approved-employees`
    - Payroll approved → `pl-approved-employees`
    - Rejected by PM or PL → `rejected-employees`
    - Otherwise → the client dashboard

  Each of these links carries `?employee=:eid`.
- **Target pages:** When `?employee=` is present, the page filters its list to that employee and shows a banner with a "Clear filter" action.

## 2. Mobile number correction

**Who:** A PM (for their own clients) or a Super Admin.

**When:** Only before the employee submits the onboarding form (`job_app_form.submission_status !== 'Submitted'`).

**API:** `PUT /api/employees/:id/mobile` with body `{ mobile }`.

- The number is normalised to 10 digits; anything else returns 400.
- Returns 409 if the form is already submitted or if another employee has the number.
- Updates `employees.mobile`, and `job_app_form.mobile` if that row exists.
- Logs an `EMPLOYEE_MOBILE_UPDATED` activity entry with the old and new numbers.
- If `onboarding_initiated` is set, it resends the WhatsApp onboarding link to the new number. A failed send does not fail the update; the result is returned as `whatsapp: { status }`.

**UI:**

- A pencil icon appears beside the mobile number in `EmployeeTable`. It is shown only when the viewer is a PM or Super Admin and the form has not been submitted.
- The icon opens an `EditMobileModal`. After saving, a toast reports the outcome, including whether the link was resent.
