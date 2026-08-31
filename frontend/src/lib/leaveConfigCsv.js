import Papa from 'papaparse';
import { INDIAN_STATES } from './indianStates';
import {
  LEAVE_TYPE_LABELS,
  formatAccrualString,
  normalizeLeaveType,
  parseAccrualString,
  parseApplicableFlag
} from './leaveConfig';

export const LEAVE_CONFIG_CSV_HEADERS = [
  'state',
  'leave_type',
  'applicable',
  'accrual',
  'fixed_days',
  'accumulation_limit'
];

const STATE_LOOKUP = new Map(INDIAN_STATES.map((s) => [s.toLowerCase(), s]));

function normalizeStateName(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return null;
  return STATE_LOOKUP.get(key) ?? null;
}

function isBlank(raw) {
  return raw === undefined || raw === null || String(raw).trim() === '';
}

function parseOptionalNumber(raw) {
  if (isBlank(raw)) return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function normalizeHeader(h) {
  const raw = String(h ?? '').trim().toLowerCase();
  if (raw === 'leave type' || raw === 'leavetype' || raw === 'type' || raw === 'criteria' || raw === 'criterial') {
    return 'leave_type';
  }
  if (raw === 'applicable' || raw === 'not_applicable' || raw === 'not applicable' || raw === 'n/a') {
    return 'applicable';
  }
  if (raw === 'accrual' || raw === 'accrual_rules' || raw === 'accrual rules') return 'accrual';
  if (raw === 'fixed days' || raw === 'fixeddays' || raw === 'annual_days' || raw === 'annual days') {
    return 'fixed_days';
  }
  if (
    raw === 'accumulation_limit'
    || raw === 'accumulation limit'
    || raw === 'accumulation'
    || raw === 'cap'
  ) {
    return 'accumulation_limit';
  }
  if (raw === 'state') return 'state';
  return raw.replace(/\s+/g, '_');
}

export function buildLeaveConfigTemplateCsv() {
  return Papa.unparse({
    fields: LEAVE_CONFIG_CSV_HEADERS,
    data: [
      ['Maharashtra', 'earned_privileged', 'Yes', '5/60;18/240', '', '45'],
      ['Maharashtra', 'casual', 'Yes', '', '12', ''],
      ['Maharashtra', 'sick', 'No', '', '', '']
    ]
  });
}

export function buildLeaveConfigCsv(rows) {
  return Papa.unparse({
    fields: LEAVE_CONFIG_CSV_HEADERS,
    data: (rows ?? []).map((r) => [
      r.state ?? '',
      r.leave_type ?? '',
      r.not_applicable ? 'No' : 'Yes',
      formatAccrualString(r.accrual_rules ?? []),
      r.fixed_days == null || r.fixed_days === '' ? '' : String(r.fixed_days),
      r.accumulation_limit == null || r.accumulation_limit === '' ? '' : String(r.accumulation_limit)
    ])
  });
}

export function parseLeaveConfigCsvText(text) {
  const parsed = Papa.parse(String(text ?? ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader
  });

  if (parsed.errors?.length) {
    throw new Error(parsed.errors[0]?.message || 'Could not parse CSV.');
  }

  const items = [];
  const errors = [];
  const seen = new Set();

  for (let i = 0; i < (parsed.data ?? []).length; i += 1) {
    const row = parsed.data[i];
    const line = i + 2;
    if (
      isBlank(row.state)
      && isBlank(row.leave_type)
      && isBlank(row.applicable)
      && isBlank(row.accrual)
      && isBlank(row.fixed_days)
      && isBlank(row.accumulation_limit)
    ) {
      continue;
    }

    const state = normalizeStateName(row.state);
    if (!state) {
      errors.push(`Row ${line}: invalid state "${row.state ?? ''}".`);
      continue;
    }
    const leave_type = normalizeLeaveType(row.leave_type);
    if (!leave_type) {
      errors.push(`Row ${line}: invalid leave type "${row.leave_type ?? ''}".`);
      continue;
    }
    const applicable = parseApplicableFlag(row.applicable);
    if (applicable === null) {
      errors.push(`Row ${line}: applicable must be Yes or No.`);
      continue;
    }
    const not_applicable = applicable === false;
    let accrual_rules = [];
    if (!isBlank(row.accrual)) {
      const parsedAccrual = parseAccrualString(row.accrual);
      if (parsedAccrual == null) {
        errors.push(`Row ${line}: invalid accrual "${row.accrual}". Use 5/60 or 5/60;18/240.`);
        continue;
      }
      accrual_rules = parsedAccrual;
    }
    const fixed_days = parseOptionalNumber(row.fixed_days);
    if (fixed_days === undefined) {
      errors.push(`Row ${line}: invalid fixed_days "${row.fixed_days}".`);
      continue;
    }
    const accumulation_limit = parseOptionalNumber(row.accumulation_limit);
    if (accumulation_limit === undefined) {
      errors.push(`Row ${line}: invalid accumulation_limit "${row.accumulation_limit}".`);
      continue;
    }

    const key = `${state}|${leave_type}`;
    if (seen.has(key)) {
      errors.push(`Row ${line}: duplicate ${state} ${leave_type}.`);
      continue;
    }
    seen.add(key);
    items.push({
      state,
      leave_type,
      not_applicable,
      accrual_rules: not_applicable ? [] : accrual_rules,
      fixed_days: not_applicable ? null : fixed_days,
      accumulation_limit: not_applicable ? null : accumulation_limit
    });
  }

  return { items, errors };
}

export function buildLeaveConfigImportSummary(items) {
  const byState = new Map();
  for (const item of items ?? []) {
    if (!byState.has(item.state)) {
      byState.set(item.state, { state: item.state, count: 0, types: [] });
    }
    const entry = byState.get(item.state);
    entry.count += 1;
    const label = LEAVE_TYPE_LABELS[item.leave_type] || item.leave_type;
    entry.types.push(item.not_applicable ? `${label} (N/A)` : label);
  }
  return [...byState.values()];
}
