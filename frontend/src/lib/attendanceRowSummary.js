import { computeRowSummary } from '@obs/backend/utils/attendanceCalculator.js';

function emptyYtd() {
  return { EL: 0, SL: 0, CL: 0, PL: 0, ML: 0, RH: 0, CO: 0, NH: 0, FH: 0 };
}

/** Prior-month YTD legend totals inferred from stored leave_summary + current legend_totals. */
export function ytdTakenBeforeCurrentPeriod(row) {
  const ls = row?.leave_summary ?? {};
  const lt = row?.legend_totals ?? {};
  const ytd = emptyYtd();
  for (const k of ['EL', 'SL', 'CL', 'PL', 'ML', 'RH', 'CO']) {
    ytd[k] = Math.max(0, Number(ls[`${k}_taken`] ?? 0) - Number(lt[k] ?? 0));
  }
  ytd.NH = Math.max(0, Number(ls.NH_taken_ytd ?? 0) - Number(lt.NH ?? 0));
  ytd.FH = Math.max(0, Number(ls.FH_taken_ytd ?? 0) - Number(lt.FH ?? 0));
  return ytd;
}

/**
 * Client-side row summary preview (same rules as backend computeRowSummary).
 * Used for immediate paid_days / LOP updates when PL edits a cell.
 */
export function previewRowSummary(row, clientPolicy, monthYm) {
  const month = String(monthYm ?? '').slice(0, 7);
  if (!month) return null;
  return computeRowSummary({
    dayMarks: row.day_marks ?? [],
    policyBundle: clientPolicy ?? {},
    employee: {
      designation: row.designation,
      gender: row.gender,
      doj: row.doj,
      lwd: row.lwd,
      state: row.state
    },
    monthYm: month,
    ytdTaken: ytdTakenBeforeCurrentPeriod(row)
  });
}
