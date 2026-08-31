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

function formatHolidayChange(key) {
  const pipe = String(key).indexOf('|');
  const rest = pipe >= 0 ? key.slice(pipe + 1) : key;
  const stateLabel = pipe >= 0 ? `${key.slice(0, pipe)} ` : '';
  const [date, type] = rest.split(':');
  return `${stateLabel}${date} (${type})`;
}

function holidayKeys(holidays) {
  return new Set(
    (holidays ?? [])
      .map((h) => {
        const date = String(h.holiday_date ?? '').slice(0, 10);
        if (!date) return null;
        const type = h.holiday_type === 'FH' ? 'FH' : 'NH';
        const state = String(h.state ?? '').trim();
        return state ? `${state}|${date}:${type}` : `${date}:${type}`;
      })
      .filter(Boolean)
  );
}

function leaveRuleKeys(rules) {
  const map = new Map();
  for (const r of rules ?? []) {
    const state = String(r.state ?? '').trim();
    const type = String(r.leave_type ?? '').trim();
    if (!state || !type) continue;
    const key = `${state} ${type}`;
    const accrual = Array.isArray(r.accrual_rules)
      ? r.accrual_rules.map((c) => `${c.days}/${c.per_days_worked}`).join(';')
      : '';
    const value = r.not_applicable
      ? 'N/A'
      : [accrual, r.fixed_days != null ? `fixed:${r.fixed_days}` : '', r.accumulation_limit != null ? `cap:${r.accumulation_limit}` : '']
        .filter(Boolean)
        .join(' ');
    map.set(key, value);
  }
  return map;
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

function fmtDate(value) {
  if (value == null || value === '') return 'none';
  return String(value).slice(0, 10);
}

function fmtMoney(value) {
  if (value == null || value === '') return 'none';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}

function designationKey(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Compare core client fields (identity, contract, insurance, flags, designations).
 * Used for the PL activity log on client create/edit.
 */
export function diffClientCoreFields(before, after) {
  const changes = [];
  const push = (label, from, to) => {
    if (from === to) return;
    changes.push(`${label}: ${from} → ${to}`);
  };

  push('Client name', String(before?.client_name ?? ''), String(after?.client_name ?? ''));
  push('Contract code', String(before?.contract_code ?? ''), String(after?.contract_code ?? ''));
  push('Entity', String(before?.entity ?? ''), String(after?.entity ?? ''));
  push('State', String(before?.state ?? ''), String(after?.state ?? ''));
  const fmtClientType = (v) => {
    const raw = String(v ?? '').trim().toUpperCase();
    if (raw === 'NON_COMPLIANCE') return 'Non-compliance';
    return 'Compliance';
  };
  push('Client type', fmtClientType(before?.client_type), fmtClientType(after?.client_type));
  push('Contract start', fmtDate(before?.contract_start_date), fmtDate(after?.contract_start_date));

  const bOpen = Boolean(before?.open_ended_contract);
  const aOpen = Boolean(after?.open_ended_contract);
  if (bOpen !== aOpen) {
    changes.push(`Open-ended contract: ${formatBool(bOpen)} → ${formatBool(aOpen)}`);
  }
  if (!aOpen || !bOpen) {
    push('Contract end', fmtDate(before?.contract_end_date), fmtDate(after?.contract_end_date));
  }

  const bPmIds = Array.isArray(before?.program_manager_ids) && before.program_manager_ids.length
    ? [...before.program_manager_ids].map(String).sort().join(',')
    : String(before?.program_manager_id ?? '');
  const aPmIds = Array.isArray(after?.program_manager_ids) && after.program_manager_ids.length
    ? [...after.program_manager_ids].map(String).sort().join(',')
    : String(after?.program_manager_id ?? '');
  if (bPmIds !== aPmIds) {
    const bLabel = before?.program_manager_name
      || before?.program_manager?.name
      || before?.program_manager_id
      || 'none';
    const aLabel = after?.program_manager_name
      || after?.program_manager?.name
      || after?.program_manager_id
      || 'none';
    changes.push(`Program manager: ${bLabel} → ${aLabel}`);
  }

  const bIns = Boolean(before?.insurance_applicable);
  const aIns = Boolean(after?.insurance_applicable);
  if (bIns !== aIns) {
    changes.push(`Insurance: ${formatBool(bIns)} → ${formatBool(aIns)}`);
  }
  if (aIns || bIns) {
    push('Insurance name', String(before?.insurance_name ?? '') || 'none', String(after?.insurance_name ?? '') || 'none');
    push('Insurance amount', fmtMoney(before?.insurance_amount), fmtMoney(after?.insurance_amount));
  }

  const bLic = before?.require_license_upload !== false;
  const aLic = after?.require_license_upload !== false;
  if (bLic !== aLic) {
    changes.push(`License upload required: ${formatBool(bLic)} → ${formatBool(aLic)}`);
  }

  const bQual = before?.require_qualification_certificate_upload !== false;
  const aQual = after?.require_qualification_certificate_upload !== false;
  if (bQual !== aQual) {
    changes.push(`Qualification upload required: ${formatBool(bQual)} → ${formatBool(aQual)}`);
  }

  const bZoneDep = Boolean(before?.zone_dependency);
  const aZoneDep = Boolean(after?.zone_dependency);
  if (bZoneDep !== aZoneDep) {
    changes.push(`Zone dependency: ${formatBool(bZoneDep)} → ${formatBool(aZoneDep)}`);
  }

  const fmtCushion = (type, value) => {
    if (!type || value == null || value === '') return 'none';
    if (String(type).toUpperCase() === 'PERCENTAGE') return `${value}% of min CTC`;
    return `₹${value} absolute`;
  };
  const bCushion = fmtCushion(before?.cushion_type, before?.cushion_value);
  const aCushion = fmtCushion(after?.cushion_type, after?.cushion_value);
  if (bCushion !== aCushion) {
    changes.push(`CTC cushion: ${bCushion} → ${aCushion}`);
  }

  const designationLabel = (d) => {
    if (d && typeof d === 'object') {
      const name = String(d.name ?? '').trim();
      const skill = String(d.skill_level ?? '').trim();
      return skill ? `${name} (${skill})` : name;
    }
    return String(d ?? '').trim();
  };
  const bDesigs = (before?.designations ?? []).map(designationLabel).filter(Boolean);
  const aDesigs = (after?.designations ?? []).map(designationLabel).filter(Boolean);
  const bKeys = new Map(bDesigs.map((d) => [designationKey(d.split(' (')[0]), d]));
  const aKeys = new Map(aDesigs.map((d) => [designationKey(d.split(' (')[0]), d]));
  for (const [key, name] of aKeys) {
    if (!bKeys.has(key)) changes.push(`Designation added: ${name}`);
    else if (bKeys.get(key) !== name) changes.push(`Designation updated: ${bKeys.get(key)} → ${name}`);
  }
  for (const [key, name] of bKeys) {
    if (!aKeys.has(key)) changes.push(`Designation removed: ${name}`);
  }

  return changes;
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

  const bCal = String(before?.holiday_calendar_id ?? '').trim() || null;
  const aCal = String(after?.holiday_calendar_id ?? '').trim() || null;
  const bCalName = String(before?.holiday_calendar_name ?? '').trim()
    || (bCal ? 'named calendar' : 'Default');
  const aCalName = String(after?.holiday_calendar_name ?? '').trim()
    || (aCal ? 'named calendar' : 'Default');
  if (bCal !== aCal) {
    changes.push(`Holiday calendar: ${bCalName} → ${aCalName}`);
  } else {
    const bSource = String(before?.holiday_source ?? 'custom').toLowerCase() === 'default' ? 'default' : 'custom';
    const aSource = String(after?.holiday_source ?? 'custom').toLowerCase() === 'default' ? 'default' : 'custom';
    if (bSource !== aSource) {
      changes.push(`Holiday calendar: ${bSource} → ${aSource}`);
    }
  }

  const bLeave = String(before?.leave_config_id ?? '').trim() || null;
  const aLeave = String(after?.leave_config_id ?? '').trim() || null;
  const bLeaveName = String(before?.leave_config_name ?? '').trim()
    || (bLeave ? 'named leave config' : 'Default');
  const aLeaveName = String(after?.leave_config_name ?? '').trim()
    || (aLeave ? 'named leave config' : 'Default');
  if (bLeave !== aLeave) {
    changes.push(`Leave configuration: ${bLeaveName} → ${aLeaveName}`);
  } else {
    const bLeaveSource = String(before?.leave_source ?? 'custom').toLowerCase() === 'default' ? 'default' : 'custom';
    const aLeaveSource = String(after?.leave_source ?? 'custom').toLowerCase() === 'default' ? 'default' : 'custom';
    if (bLeaveSource !== aLeaveSource) {
      changes.push(`Leave configuration: ${bLeaveSource} → ${aLeaveSource}`);
    }
  }

  const bRules = leaveRuleKeys(before?.leave_rules);
  const aRules = leaveRuleKeys(after?.leave_rules);
  for (const key of aRules) {
    if (!bRules.has(key)) {
      changes.push(`Leave rule added: ${key}`);
    } else if (bRules.get(key) !== aRules.get(key)) {
      changes.push(`Leave rule updated: ${key}`);
    }
  }
  for (const key of bRules.keys()) {
    if (!aRules.has(key)) {
      changes.push(`Leave rule removed: ${key}`);
    }
  }

  const bHolidays = holidayKeys(before?.holidays);
  const aHolidays = holidayKeys(after?.holidays);
  for (const key of aHolidays) {
    if (!bHolidays.has(key)) {
      changes.push(`Holiday added: ${formatHolidayChange(key)}`);
    }
  }
  for (const key of bHolidays) {
    if (!aHolidays.has(key)) {
      changes.push(`Holiday removed: ${formatHolidayChange(key)}`);
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
  if (!changes?.length) return `${prefix}Saved (no changes detected)`;
  return `${prefix}${changes.join('; ')}`;
}
