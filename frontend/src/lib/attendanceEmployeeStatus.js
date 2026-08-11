/** Canonical AMS employee statuses shown in the attendance grid Status column. */
export const EMPLOYEE_STATUS_LABELS = [
  'Active',
  'New Joiner',
  'Abscond',
  'Inactive',
  'Resigned',
  'Termination'
];

/** Chip/select Tailwind classes + option list colors (Present-style fills). */
const EMPLOYEE_STATUS_STYLES = {
  Active: {
    className: 'bg-emerald-50 text-emerald-900',
    optionBg: '#ecfdf5',
    optionText: '#064e3b'
  },
  'New Joiner': {
    className: 'bg-sky-50 text-sky-900',
    optionBg: '#f0f9ff',
    optionText: '#0c4a6e'
  },
  Abscond: {
    className: 'bg-red-100 text-red-800',
    optionBg: '#fee2e2',
    optionText: '#991b1b'
  },
  Inactive: {
    className: 'bg-slate-100 text-slate-700',
    optionBg: '#f1f5f9',
    optionText: '#334155'
  },
  Resigned: {
    className: 'bg-amber-100 text-amber-900',
    optionBg: '#fef3c7',
    optionText: '#78350f'
  },
  Termination: {
    className: 'bg-rose-100 text-rose-900',
    optionBg: '#ffe4e6',
    optionText: '#881337'
  }
};

function statusStyle(statusLabel) {
  return EMPLOYEE_STATUS_STYLES[String(statusLabel ?? '').trim()] ?? null;
}

/** Soft fill on the status control/chip only (not the whole table cell). */
export function employeeStatusCellClass(statusLabel) {
  return statusStyle(statusLabel)?.className ?? '';
}

/** Inline colors for native <option> rows in the status dropdown. */
export function employeeStatusOptionStyle(statusLabel) {
  const style = statusStyle(statusLabel);
  if (!style) return undefined;
  return { backgroundColor: style.optionBg, color: style.optionText };
}
