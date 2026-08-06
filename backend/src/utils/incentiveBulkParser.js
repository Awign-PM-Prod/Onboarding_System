import Papa from 'papaparse';

function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function pickCol(row, headerMap, ...aliases) {
  for (const alias of aliases) {
    const key = headerMap.get(normalizeHeader(alias));
    if (key != null && row[key] != null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return null;
}

function numOrNull(raw) {
  if (raw == null || String(raw).trim() === '' || String(raw).trim() === '-') return null;
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function strOrNull(raw) {
  const s = String(raw ?? '').trim();
  return s || null;
}

/**
 * Parse a slim incentives CSV (Emp Code + Add-on Incentive / Incentive + optional Remarks).
 * Matches the shape of the incentive export so PM/PL can export → fill → re-import.
 */
export function parseIncentiveBulkCsv(text) {
  const parsed = Papa.parse(String(text ?? ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => String(h ?? '').trim()
  });

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type === 'Delimiter' || e.type === 'Quotes');
    if (fatal) {
      return {
        rows: [],
        errors: [{ row: fatal.row != null ? fatal.row + 1 : null, error: fatal.message }]
      };
    }
  }

  const fields = parsed.meta?.fields ?? [];
  const headerMap = new Map();
  for (const f of fields) {
    headerMap.set(normalizeHeader(f), f);
  }

  const hasEmpCode = [...headerMap.keys()].some((k) =>
    ['emp code', 'empcode', 'employee code', 'employee id', 'emp id'].includes(k)
  );
  if (!hasEmpCode) {
    return {
      rows: [],
      errors: [{ error: 'CSV must include an Emp Code column' }]
    };
  }

  const rows = [];
  const errors = [];

  (parsed.data ?? []).forEach((row, idx) => {
    const empCode = strOrNull(
      pickCol(row, headerMap, 'Emp Code', 'EmpCode', 'Employee Code', 'Employee ID', 'Emp ID')
    );
    if (!empCode) {
      // Skip blank trailing rows silently
      const anyValue = Object.values(row ?? {}).some((v) => String(v ?? '').trim());
      if (anyValue) {
        errors.push({ row: idx + 2, error: 'Missing Emp Code' });
      }
      return;
    }

    // Ignore totals / summary rows
    const name = strOrNull(
      pickCol(row, headerMap, 'Employee Name', 'Name', 'Emp Name')
    );
    if (String(name ?? '').toLowerCase() === 'total') return;

    const addonRaw = pickCol(
      row,
      headerMap,
      'Add-on Incentive',
      'Add-on Incentives',
      'Addon Incentive',
      'Addon Incentives',
      'Add on Incentive'
    );
    // Fallback: bare "Incentive" column is treated as add-on for bulk upload
    // (policy incentive remains computed and is not overwritten).
    const incentiveFallback = pickCol(row, headerMap, 'Incentive', 'Incentives');
    if (addonRaw == null && incentiveFallback == null) {
      // Skip rows with no incentive value (e.g. re-import of export template)
      return;
    }
    const addon_incentive =
      addonRaw != null ? numOrNull(addonRaw) : numOrNull(incentiveFallback);

    if (addon_incentive == null || addon_incentive < 0) {
      errors.push({
        emp_code: empCode,
        employee_name: name,
        row: idx + 2,
        error: 'Invalid Add-on Incentive value'
      });
      return;
    }

    const remarksRaw = pickCol(row, headerMap, 'Remarks', 'Remark');
    rows.push({
      emp_code: empCode,
      employee_name: name,
      addon_incentive,
      remarks: remarksRaw != null ? strOrNull(remarksRaw) : undefined
    });
  });

  return { rows, errors };
}
