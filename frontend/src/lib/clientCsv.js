import Papa from 'papaparse';
import {
  DEFAULT_ATTENDANCE_POLICY,
  normalizeAttendancePolicyForForm
} from './clientPolicy';

export const CLIENT_CSV_HEADERS = [
  'client_name',
  'contract_code',
  'entity',
  'state',
  'contract_start_date',
  'contract_end_date',
  'open_ended_contract',
  'program_manager_email',
  'insurance_applicable',
  'insurance_name',
  'insurance_amount',
  'designations',
  'require_license_upload',
  'require_qualification_certificate_upload',
  'payroll_cycle_start_day',
  'payroll_cycle_end_day',
  'week_off_presets',
  'week_off_weekdays',
  'comp_off_applicable',
  'comp_off_types',
  'comp_off_rule',
  'paid_comp_off_rule',
  'nh_comp_off_applicable',
  'nh_off_rule',
  'nh_pay_rule',
  'fh_comp_off_applicable',
  'fh_off_rule',
  'fh_pay_rule',
  'incentive_applicable',
  'incentive_min_days',
  'incentive_value',
  'leave_sick_days',
  'leave_paid_days',
  'leave_maternity_days',
  'leave_paternity_days',
  'leave_earned_days',
  'leave_allowances_detail',
  'holidays'
];

function boolStr(v) {
  return v ? 'true' : 'false';
}

function joinList(value, sep = ';') {
  if (Array.isArray(value)) return value.filter(Boolean).join(sep);
  return String(value ?? '').trim();
}

function encodeLeaveAllowancesDetail(leaveAllowances) {
  return (leaveAllowances ?? [])
    .map((a) => {
      const role = String(a?.designation ?? '').trim();
      if (!role) return null;
      return `${role}:${[
        a.sick_days ?? 0,
        a.paid_days ?? 0,
        a.maternity_days ?? 0,
        a.paternity_days ?? 0,
        a.earned_days ?? 0
      ].join('|')}`;
    })
    .filter(Boolean)
    .join(';');
}

function encodeHolidays(holidays) {
  return (holidays ?? [])
    .map((h) => {
      const date = String(h?.holiday_date ?? '').slice(0, 10);
      if (!date) return null;
      const type = h?.holiday_type === 'FH' ? 'FH' : 'NH';
      return `${date}:${type}`;
    })
    .filter(Boolean)
    .join(';');
}

function firstLeaveValue(leaveAllowances, key, fallback = '') {
  const first = (leaveAllowances ?? [])[0];
  if (first && first[key] != null && first[key] !== '') return first[key];
  return fallback;
}

function cell(row, key) {
  const v = row?.[key];
  if (v == null) return '';
  return String(v).trim();
}

function parseBool(raw, defaultValue = false) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return defaultValue;
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return defaultValue;
}

function parseNumber(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function splitList(raw, sep = ';') {
  return String(raw ?? '')
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseHolidays(raw) {
  return splitList(raw, ';')
    .map((part) => {
      const [datePart, typePart] = part.split(':').map((s) => s.trim());
      if (!datePart) return null;
      return {
        holiday_date: datePart.slice(0, 10),
        holiday_type: typePart === 'FH' ? 'FH' : 'NH'
      };
    })
    .filter(Boolean);
}

function parseLeaveAllowancesDetail(raw) {
  const map = new Map();
  for (const part of splitList(raw, ';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const role = part.slice(0, colon).trim();
    const nums = part.slice(colon + 1).split('|').map((s) => s.trim());
    if (!role) continue;
    map.set(role.toLowerCase(), {
      designation: role,
      sick_days: parseNumber(nums[0], 6),
      paid_days: parseNumber(nums[1], 12),
      maternity_days: parseNumber(nums[2], 180),
      paternity_days: parseNumber(nums[3], 15),
      earned_days: parseNumber(nums[4], 18)
    });
  }
  return map;
}

function buildLeaveAllowances(designations, row) {
  const detailMap = parseLeaveAllowancesDetail(cell(row, 'leave_allowances_detail'));
  const defaults = {
    sick_days: parseNumber(cell(row, 'leave_sick_days'), 6),
    paid_days: parseNumber(cell(row, 'leave_paid_days'), 12),
    maternity_days: parseNumber(cell(row, 'leave_maternity_days'), 180),
    paternity_days: parseNumber(cell(row, 'leave_paternity_days'), 15),
    earned_days: parseNumber(cell(row, 'leave_earned_days'), 18)
  };
  return designations.map((designation) => {
    const fromDetail = detailMap.get(designation.toLowerCase());
    if (fromDetail) return { ...fromDetail, designation };
    return { designation, ...defaults };
  });
}

export function normalizeCsvHeaderKey(k) {
  return String(k ?? '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function parseClientCsvText(text) {
  const { data, errors } = Papa.parse(String(text ?? ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => normalizeCsvHeaderKey(h)
  });
  const fatal = (errors || []).find((e) => e.type === 'Quotes' || e.type === 'FieldMismatch');
  if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);
  return (data || []).map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (!k) continue;
      out[k] = v ?? '';
    }
    return out;
  });
}

/** Convert one CSV row into ClientForm state shape. Resolves PM via programManagers list. */
export function csvRowToClientForm(row, programManagers = []) {
  const designations = splitList(cell(row, 'designations'), ';');
  const openEnded = parseBool(cell(row, 'open_ended_contract'), false);
  const insuranceApplicable = parseBool(cell(row, 'insurance_applicable'), false);
  const email = cell(row, 'program_manager_email').toLowerCase();
  const pm = (programManagers ?? []).find(
    (p) => String(p.email ?? '').trim().toLowerCase() === email
  );

  const attendance_policy = normalizeAttendancePolicyForForm({
    ...DEFAULT_ATTENDANCE_POLICY,
    payroll_cycle_start_day: parseNumber(
      cell(row, 'payroll_cycle_start_day'),
      DEFAULT_ATTENDANCE_POLICY.payroll_cycle_start_day
    ),
    payroll_cycle_end_day: parseNumber(
      cell(row, 'payroll_cycle_end_day'),
      DEFAULT_ATTENDANCE_POLICY.payroll_cycle_end_day
    ),
    week_off_config: {
      presets: splitList(cell(row, 'week_off_presets'), ';'),
      weekdays: splitList(cell(row, 'week_off_weekdays'), ';').map((d) => d.toLowerCase())
    },
    comp_off_applicable: parseBool(cell(row, 'comp_off_applicable'), true),
    comp_off_types: splitList(cell(row, 'comp_off_types'), ';'),
    comp_off_rule: parseNumber(cell(row, 'comp_off_rule'), 1),
    paid_comp_off_rule: parseNumber(cell(row, 'paid_comp_off_rule'), 1),
    nh_comp_off_applicable: parseBool(cell(row, 'nh_comp_off_applicable'), true),
    nh_off_rule: parseNumber(cell(row, 'nh_off_rule'), 2),
    nh_pay_rule: parseNumber(cell(row, 'nh_pay_rule'), 1),
    fh_comp_off_applicable: parseBool(cell(row, 'fh_comp_off_applicable'), false),
    fh_off_rule: parseNumber(cell(row, 'fh_off_rule'), 1),
    fh_pay_rule: parseNumber(cell(row, 'fh_pay_rule'), 1),
    incentive_applicable: parseBool(cell(row, 'incentive_applicable'), false),
    incentive_min_days: parseNumber(cell(row, 'incentive_min_days'), 26),
    incentive_value: parseNumber(cell(row, 'incentive_value'), 0)
  });

  return {
    client_name: cell(row, 'client_name'),
    contract_code: cell(row, 'contract_code'),
    entity: cell(row, 'entity'),
    state: cell(row, 'state'),
    contract_start_date: cell(row, 'contract_start_date'),
    contract_end_date: openEnded ? '' : cell(row, 'contract_end_date'),
    open_ended_contract: openEnded,
    program_manager_id: pm?.id ?? '',
    program_manager_email: email,
    insurance_applicable: insuranceApplicable,
    insurance_name: insuranceApplicable ? cell(row, 'insurance_name') : '',
    insurance_amount: insuranceApplicable ? cell(row, 'insurance_amount') : '',
    require_license_upload: parseBool(cell(row, 'require_license_upload'), true),
    require_qualification_certificate_upload: parseBool(
      cell(row, 'require_qualification_certificate_upload'),
      true
    ),
    designations,
    attendance_policy,
    leave_allowances: buildLeaveAllowances(designations, row),
    holidays: parseHolidays(cell(row, 'holidays'))
  };
}

export function buildClientTemplateCsv() {
  const demo = {
    client_name: 'Acme Manufacturing Pvt Ltd',
    contract_code: 'CTR-2026-001',
    entity: 'Acme Group',
    state: 'Maharashtra',
    contract_start_date: '2026-04-01',
    contract_end_date: '2027-03-31',
    open_ended_contract: 'false',
    program_manager_email: 'pm@example.com',
    insurance_applicable: 'false',
    insurance_name: '',
    insurance_amount: '',
    designations: 'Technician;Supervisor',
    require_license_upload: 'true',
    require_qualification_certificate_upload: 'true',
    payroll_cycle_start_day: '25',
    payroll_cycle_end_day: '24',
    week_off_presets: 'all_sundays',
    week_off_weekdays: '',
    comp_off_applicable: 'true',
    comp_off_types: 'CO',
    comp_off_rule: '1',
    paid_comp_off_rule: '1',
    nh_comp_off_applicable: 'true',
    nh_off_rule: '2',
    nh_pay_rule: '1',
    fh_comp_off_applicable: 'false',
    fh_off_rule: '1',
    fh_pay_rule: '1',
    incentive_applicable: 'false',
    incentive_min_days: '26',
    incentive_value: '0',
    leave_sick_days: '6',
    leave_paid_days: '12',
    leave_maternity_days: '180',
    leave_paternity_days: '15',
    leave_earned_days: '18',
    leave_allowances_detail: 'Technician:6|12|180|15|18;Supervisor:6|12|180|15|18',
    holidays: '2026-01-26:NH;2026-08-15:NH;2026-10-02:FH'
  };
  return Papa.unparse({
    fields: CLIENT_CSV_HEADERS,
    data: [CLIENT_CSV_HEADERS.map((h) => demo[h] ?? '')]
  });
}

export function clientToExportRow(client, programManagerEmail = '') {
  const openEnded = Boolean(client?.open_ended_contract);
  const policy = client?.attendance_policy ?? {};
  const weekOff = policy.week_off_config ?? {};
  const leaveAllowances = client?.leave_allowances ?? [];
  const holidays = client?.holidays ?? [];

  return {
    client_id: client?.id ?? '',
    client_name: client?.client_name ?? '',
    contract_code: client?.contract_code ?? '',
    entity: client?.entity ?? '',
    state: client?.state ?? '',
    contract_start_date: client?.contract_start_date ?? '',
    contract_end_date: openEnded ? '' : (client?.contract_end_date ?? ''),
    open_ended_contract: boolStr(openEnded),
    program_manager_email:
      programManagerEmail
      || client?.program_manager?.email
      || client?.program_manager_email
      || '',
    program_manager_name:
      client?.program_manager?.name
      || client?.program_manager_name
      || '',
    insurance_applicable: boolStr(client?.insurance_applicable),
    insurance_name: client?.insurance_name ?? '',
    insurance_amount: client?.insurance_amount ?? '',
    designations: Array.isArray(client?.designations)
      ? client.designations.join(';')
      : '',
    require_license_upload: boolStr(client?.require_license_upload !== false),
    require_qualification_certificate_upload:
      boolStr(client?.require_qualification_certificate_upload !== false),
    payroll_cycle_start_day: policy.payroll_cycle_start_day ?? '',
    payroll_cycle_end_day: policy.payroll_cycle_end_day ?? '',
    week_off_presets: joinList(weekOff.presets),
    week_off_weekdays: joinList(weekOff.weekdays),
    comp_off_applicable: boolStr(policy.comp_off_applicable),
    comp_off_types: joinList(policy.comp_off_types),
    comp_off_rule: policy.comp_off_rule ?? '',
    paid_comp_off_rule: policy.paid_comp_off_rule ?? '',
    nh_comp_off_applicable: boolStr(policy.nh_comp_off_applicable),
    nh_off_rule: policy.nh_off_rule ?? '',
    nh_pay_rule: policy.nh_pay_rule ?? '',
    fh_comp_off_applicable: boolStr(policy.fh_comp_off_applicable),
    fh_off_rule: policy.fh_off_rule ?? '',
    fh_pay_rule: policy.fh_pay_rule ?? '',
    incentive_applicable: boolStr(policy.incentive_applicable),
    incentive_min_days: policy.incentive_min_days ?? '',
    incentive_value: policy.incentive_value ?? '',
    leave_sick_days: firstLeaveValue(leaveAllowances, 'sick_days'),
    leave_paid_days: firstLeaveValue(leaveAllowances, 'paid_days'),
    leave_maternity_days: firstLeaveValue(leaveAllowances, 'maternity_days'),
    leave_paternity_days: firstLeaveValue(leaveAllowances, 'paternity_days'),
    leave_earned_days: firstLeaveValue(leaveAllowances, 'earned_days'),
    leave_allowances_detail: encodeLeaveAllowancesDetail(leaveAllowances),
    holidays: encodeHolidays(holidays),
    created_at: client?.created_at ?? ''
  };
}

export function buildClientExportCsv(client, programManagerEmail = '') {
  return Papa.unparse([clientToExportRow(client, programManagerEmail)]);
}

export function triggerCsvDownload(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatContractPeriod(start, end, openEnded = false) {
  const fmt = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };
  if (openEnded || !end) {
    return `${fmt(start)} – Open-ended`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}
