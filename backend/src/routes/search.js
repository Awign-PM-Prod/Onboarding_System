import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { isSuperAdminRole, loadUserRole } from '../utils/roleAccess.js';
import { listClientIdsForProgramManager } from '../utils/clientProgramManagers.js';

const router = Router();

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const CLIENT_LIMIT = 8;
const EMPLOYEE_LIMIT = 15;
const SEARCH_ROLES = new Set(['PROGRAM_MANAGER', 'PAYROLL_LEAD', 'SUPER_ADMIN']);

/** Strip characters that would break a PostgREST `or=(...)` filter or act as wildcards. */
function sanitizeTerm(raw) {
  return String(raw ?? '')
    .replace(/[,()*%\\"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

/** "98765 43210" / "+91-98765-43210" -> "9876543210" so phone-style input matches stored mobiles. */
function phoneDigits(term) {
  if (!/^[\d\s+-]+$/.test(term)) return null;
  const digits = term.replace(/\D/g, '');
  if (digits.length < MIN_QUERY_LENGTH) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function ilikeAny(columns, term) {
  return columns.map((col) => `${col}.ilike.%${term}%`).join(',');
}

/** null = unrestricted (PL / Super Admin); array = only these client ids (PM). */
async function resolveClientScope(user) {
  if (isSuperAdminRole(user.role) || user.role === 'PAYROLL_LEAD') return null;
  return listClientIdsForProgramManager(user.id);
}

router.get('/', async (req, res, next) => {
  try {
    const user = await loadUserRole(req.user.id);
    if (!user) return res.status(403).json({ error: 'User profile not found' });
    if (!SEARCH_ROLES.has(user.role)) {
      return res.status(403).json({ error: 'Search is not available for your role' });
    }

    const term = sanitizeTerm(req.query.q);
    if (term.length < MIN_QUERY_LENGTH) {
      return res.json({ query: term, clients: [], employees: [] });
    }

    const scope = await resolveClientScope(user);
    if (Array.isArray(scope) && scope.length === 0) {
      return res.json({ query: term, clients: [], employees: [] });
    }

    let clientsQuery = supabaseAdmin
      .from('clients')
      .select('id, client_name, contract_code, state, is_active')
      .or(ilikeAny(['client_name', 'contract_code'], term))
      .order('client_name', { ascending: true })
      .limit(CLIENT_LIMIT);
    if (scope) clientsQuery = clientsQuery.in('id', scope);

    const digits = phoneDigits(term);
    const employeeFilters = [ilikeAny(['name', 'email', 'emp_code', 'reference_id', 'mobile'], term)];
    if (digits && digits !== term) employeeFilters.push(`mobile.ilike.%${digits}%`);

    let employeesQuery = supabaseAdmin
      .from('employees')
      .select('id, client_id, name, mobile, email, emp_code, reference_id, onboarding_status, joining_status')
      .or(employeeFilters.join(','))
      .order('created_at', { ascending: false })
      .limit(EMPLOYEE_LIMIT);
    if (scope) employeesQuery = employeesQuery.in('client_id', scope);

    const [
      { data: clients, error: clientsErr },
      { data: employees, error: employeesErr }
    ] = await Promise.all([clientsQuery, employeesQuery]);
    if (clientsErr) throw clientsErr;
    if (employeesErr) throw employeesErr;

    const employeeRows = employees ?? [];
    const employeeIds = employeeRows.map((e) => e.id);
    const employeeClientIds = [...new Set(employeeRows.map((e) => e.client_id).filter(Boolean))];

    const [formsResult, employeeClientsResult] = await Promise.all([
      employeeIds.length
        ? supabaseAdmin
            .from('job_app_form')
            .select('employee_id, submission_status, review_status, payroll_review_status')
            .in('employee_id', employeeIds)
        : Promise.resolve({ data: [], error: null }),
      employeeClientIds.length
        ? supabaseAdmin.from('clients').select('id, client_name').in('id', employeeClientIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (formsResult.error) throw formsResult.error;
    if (employeeClientsResult.error) throw employeeClientsResult.error;

    const formByEmployee = new Map((formsResult.data ?? []).map((f) => [f.employee_id, f]));
    const clientNameById = new Map((employeeClientsResult.data ?? []).map((c) => [c.id, c.client_name]));

    res.json({
      query: term,
      clients: clients ?? [],
      employees: employeeRows.map((e) => {
        const form = formByEmployee.get(e.id);
        return {
          ...e,
          client_name: clientNameById.get(e.client_id) ?? null,
          form_submission_status: form?.submission_status ?? null,
          form_review_status: form?.review_status ?? null,
          form_payroll_review_status: form?.payroll_review_status ?? null
        };
      })
    });
  } catch (err) {
    next(err);
  }
});

export default router;
