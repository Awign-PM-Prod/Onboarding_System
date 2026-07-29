import { payrollCycleLabel } from './clientPolicyCore.js';

function formatBool(on) {
  return on ? 'enabled' : 'disabled';
}

function formatCompOffRule(applicable, offRule, payRule) {
  if (!applicable) return 'disabled';
  return `enabled (off=${offRule}, pay=${payRule})`;
}

function formatWeekOff(config) {
  const presets = (config?.presets ?? []).join(', ') || 'none';
  const weekdays = (config?.weekdays ?? []).join(', ') || 'none';
  return `presets: ${presets}; weekdays: ${weekdays}`;
}

function formatIncentive(policy) {
  if (!policy?.incentive_applicable) return 'disabled';
  return `₹${policy.incentive_value} at ${policy.incentive_min_days}+ consecutive present days`;
}

function holidayKeys(holidays) {
  return new Set(
    (holidays ?? [])
      .map((h) => {
        const date = String(h.holiday_date ?? '').slice(0, 10);
        if (!date) return null;
        const type = h.holiday_type === 'FH' ? 'FH' : 'NH';
        return `${date}:${type}`;
      })
      .filter(Boolean)
  );
}

const ALLOWANCE_FIELDS = [
  ['earned_days', 'earned days'],
  ['sick_days', 'sick days'],
  ['paid_days', 'CL days'],
  ['maternity_days', 'maternity days'],
  ['paternity_days', 'paternity days']
];

function allowancesByDesignation(allowances) {
  const map = new Map();
  for (const row of allowances ?? []) {
    const key = String(row.designation ?? '').trim().toLowerCase();
    if (key) map.set(key, row);
  }
  return map;
}

/**
 * Compare two policy bundles and return human-readable change lines.
 */
export function diffClientPolicyBundles(before, after) {
  const changes = [];
  const bPolicy = before?.attendance_policy ?? {};
  const aPolicy = after?.attendance_policy ?? {};

  const bCycle = payrollCycleLabel(bPolicy);
  const aCycle = payrollCycleLabel(aPolicy);
  if (bCycle !== aCycle) {
    changes.push(`Payroll cycle: ${bCycle} → ${aCycle}`);
  }

  const bWeekOff = formatWeekOff(bPolicy.week_off_config);
  const aWeekOff = formatWeekOff(aPolicy.week_off_config);
  if (bWeekOff !== aWeekOff) {
    changes.push(`Week off: ${bWeekOff} → ${aWeekOff}`);
  }

  if (Boolean(bPolicy.comp_off_applicable) !== Boolean(aPolicy.comp_off_applicable)) {
    changes.push(`Comp off: ${formatBool(bPolicy.comp_off_applicable)} → ${formatBool(aPolicy.comp_off_applicable)}`);
  } else if (aPolicy.comp_off_applicable) {
    const bTypes = (bPolicy.comp_off_types ?? []).sort().join(',');
    const aTypes = (aPolicy.comp_off_types ?? []).sort().join(',');
    if (bTypes !== aTypes) {
      changes.push(`Comp off types: ${bTypes || 'none'} → ${aTypes || 'none'}`);
    }
    if (Number(bPolicy.comp_off_rule) !== Number(aPolicy.comp_off_rule)) {
      changes.push(`Comp off rule: ${bPolicy.comp_off_rule} → ${aPolicy.comp_off_rule}`);
    }
    if (Number(bPolicy.paid_comp_off_rule) !== Number(aPolicy.paid_comp_off_rule)) {
      changes.push(`Paid comp off rule: ${bPolicy.paid_comp_off_rule} → ${aPolicy.paid_comp_off_rule}`);
    }
  }

  const bNh = formatCompOffRule(bPolicy.nh_comp_off_applicable, bPolicy.nh_off_rule, bPolicy.nh_pay_rule);
  const aNh = formatCompOffRule(aPolicy.nh_comp_off_applicable, aPolicy.nh_off_rule, aPolicy.nh_pay_rule);
  if (bNh !== aNh) {
    changes.push(`NH comp off: ${bNh} → ${aNh}`);
  }

  const bFh = formatCompOffRule(bPolicy.fh_comp_off_applicable, bPolicy.fh_off_rule, bPolicy.fh_pay_rule);
  const aFh = formatCompOffRule(aPolicy.fh_comp_off_applicable, aPolicy.fh_off_rule, aPolicy.fh_pay_rule);
  if (bFh !== aFh) {
    changes.push(`FH comp off: ${bFh} → ${aFh}`);
  }

  const bIncentive = formatIncentive(bPolicy);
  const aIncentive = formatIncentive(aPolicy);
  if (bIncentive !== aIncentive) {
    changes.push(`Incentive: ${bIncentive} → ${aIncentive}`);
  }

  const bHolidays = holidayKeys(before?.holidays);
  const aHolidays = holidayKeys(after?.holidays);
  for (const key of aHolidays) {
    if (!bHolidays.has(key)) {
      const [date, type] = key.split(':');
      changes.push(`Holiday added: ${date} (${type})`);
    }
  }
  for (const key of bHolidays) {
    if (!aHolidays.has(key)) {
      const [date, type] = key.split(':');
      changes.push(`Holiday removed: ${date} (${type})`);
    }
  }

  const bAllow = allowancesByDesignation(before?.leave_allowances);
  const aAllow = allowancesByDesignation(after?.leave_allowances);
  const allDesigs = new Set([...bAllow.keys(), ...aAllow.keys()]);
  for (const desigKey of allDesigs) {
    const bRow = bAllow.get(desigKey);
    const aRow = aAllow.get(desigKey);
    const label = aRow?.designation || bRow?.designation || desigKey;
    if (!bRow && aRow) {
      changes.push(`Leave allowance added (${label})`);
      continue;
    }
    if (bRow && !aRow) {
      changes.push(`Leave allowance removed (${label})`);
      continue;
    }
    for (const [field, labelText] of ALLOWANCE_FIELDS) {
      const bVal = Number(bRow?.[field]) || 0;
      const aVal = Number(aRow?.[field]) || 0;
      if (bVal !== aVal) {
        changes.push(`Leave allowance (${label}): ${labelText} ${bVal} → ${aVal}`);
      }
    }
  }

  return changes;
}

export function summarizePolicyChanges(changes, effectiveFromMonth = null) {
  const prefix = effectiveFromMonth
    ? `Effective from ${effectiveFromMonth}: `
    : '';
  if (!changes?.length) return `${prefix}Policy saved (no changes detected)`;
  return `${prefix}${changes.join('; ')}`;
}
