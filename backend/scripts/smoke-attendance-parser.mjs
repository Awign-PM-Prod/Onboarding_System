import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAmsAttendanceCsv,
  parseDayHeaderToDate,
  toSqlDate,
  normalizeEmployeeStatus
} from '../src/utils/amsAttendanceParser.js';
import { computeLegendTotals, normalizeAttendanceCode } from '../src/utils/attendanceLegend.js';
import { buildAttendanceExportCsv } from '../src/utils/attendanceExport.js';

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(here, '../../demo-attendance-ams-sample.csv');
const text = readFileSync(samplePath, 'utf8');

assert.equal(normalizeAttendanceCode('oc'), null);
assert.equal(normalizeAttendanceCode('NH'), 'NH');
assert.equal(normalizeAttendanceCode('FH'), 'FH');
assert.equal(normalizeAttendanceCode('P-NH'), 'P-NH');
assert.equal(normalizeAttendanceCode('pnh'), 'P-NH');
assert.equal(normalizeAttendanceCode('P_FH'), 'P-FH');
assert.equal(normalizeAttendanceCode('a'), 'A');
assert.equal(normalizeAttendanceCode('AB'), 'AB');
assert.equal(normalizeAttendanceCode('absconded'), 'AB');
assert.equal(normalizeAttendanceCode('terminated'), 'T');

assert.equal(normalizeEmployeeStatus('active'), 'Active');
assert.equal(normalizeEmployeeStatus('New Joinee'), 'New Joiner');
assert.equal(normalizeEmployeeStatus('Absconded'), 'Abscond');
assert.equal(normalizeEmployeeStatus('Terminated'), 'Termination');
assert.equal(normalizeEmployeeStatus('bogus'), null);

assert.equal(toSqlDate('1st of E.M', '2026-07-01'), '2026-07-01');
assert.equal(toSqlDate('1st of every month', '2026-07-15'), '2026-07-01');
assert.equal(toSqlDate('2026-07-15'), '2026-07-15');
assert.equal(toSqlDate('not-a-date', '2026-07-01'), null);

assert.equal(parseDayHeaderToDate('1-Apr-26'), '2026-04-01');
assert.equal(parseDayHeaderToDate('1-Jul', '2026-07-01'), '2026-07-01');
assert.equal(parseDayHeaderToDate('15', '2026-07-01'), '2026-07-15');
assert.equal(parseDayHeaderToDate('01/07/2026'), '2026-07-01');
assert.equal(parseDayHeaderToDate('Jul-5-26'), '2026-07-05');

const { sheetMeta, rows, errors } = parseAmsAttendanceCsv(text);
assert.ok(sheetMeta?.attendance_month, 'attendance_month detected');
assert.equal(rows.length, 6, 'six data rows in demo sample');
assert.ok(rows[0].day_marks.length >= 7, 'day marks present');
assert.equal(rows[0].emp_code, 'ATT001');
assert.equal(rows[0].status_label, 'Active');
assert.equal(rows[0].legend_totals.P, 3);
assert.equal(rows[0].legend_totals.NH, 1);
assert.equal(rows[0].legend_totals.A, 1);
assert.equal(rows[0].legend_totals.W, 2);
assert.equal(rows[1].legend_totals.NH, 1);
assert.equal(rows[1].legend_totals.HD, 1);
assert.equal(rows[4].emp_code, 'T016394');

const totals = computeLegendTotals(['P', 'P', 'A', 'NH']);
assert.deepEqual(
  { P: totals.P, A: totals.A, NH: totals.NH },
  { P: 2, A: 1, NH: 1 }
);

const ocCsv = `Emp Code,Employee Name,Amt. Type,1-Apr-26\nT1,Test,MONTHLY,OC\n`;
const ocParsed = parseAmsAttendanceCsv(ocCsv);
assert.ok(
  ocParsed.errors.some((e) => /OC is not allowed/i.test(e.error)),
  'OC should produce parse error'
);

const emCsv = [
  'Emp Code,Employee Name,Amt. Type,Payroll Month,Salary Payout Date,1-Jul-26',
  'T1,Test,MONTHLY,Jul-26,1st of E.M,P'
].join('\n');
const emParsed = parseAmsAttendanceCsv(emCsv);
assert.equal(emParsed.sheetMeta.attendance_month, '2026-07-01');
assert.equal(emParsed.sheetMeta.salary_payout_date, '2026-07-01');
assert.equal(emParsed.rows[0].day_marks.length, 1);

// Bare day numbers with payroll month + UI month hint
const bareDays = [
  'Emp Code,Employee Name,Amt. Type,Payroll Month,1,2,3,Paid Days',
  'T9,Bare,MONTHLY,Jul-26,P,W,A,1'
].join('\n');
const bareParsed = parseAmsAttendanceCsv(bareDays, { attendanceMonthHint: '2026-07-01' });
assert.equal(bareParsed.rows[0].day_marks.length, 3);
assert.equal(bareParsed.rows[0].day_marks[0].mark_date, '2026-07-01');
assert.equal(bareParsed.rows[0].day_marks[2].code, 'A');

// StaffingGo-style "Employee Status" header (not plain "Status")
const empStatusCsv = [
  'Emp Code,Employee Name,DOJ,LWD,Employee Status,Amt. Type,1-Apr-26,2-Apr-26,3-Apr-26',
  'T1,Alice,2026-01-01,,New Joinee,CTC,P,W,A',
  'T2,Bob,2026-01-02,,Absconded,CTC,P,P,P'
].join('\n');
const empStatusParsed = parseAmsAttendanceCsv(empStatusCsv);
assert.equal(empStatusParsed.rows[0].status_label, 'New Joiner');
assert.equal(empStatusParsed.rows[1].status_label, 'Abscond');

// LWD month: blank days after LWD; LWD day T sets Termination
const lwdCsv = [
  'Emp Code,Employee Name,DOJ,LWD,Status,Amt. Type,1-Apr-26,2-Apr-26,3-Apr-26,4-Apr-26,5-Apr-26',
  'T20,Leaver,2026-01-01,2026-04-03,Active,MONTHLY,P,W,T,P,NH'
].join('\n');
const lwdParsed = parseAmsAttendanceCsv(lwdCsv);
assert.equal(lwdParsed.errors.length, 0);
assert.equal(lwdParsed.rows[0].lwd, '2026-04-03');
assert.equal(lwdParsed.rows[0].status_label, 'Termination');
assert.deepEqual(
  lwdParsed.rows[0].day_marks.map((m) => `${m.mark_date}:${m.code}`),
  ['2026-04-01:P', '2026-04-02:W', '2026-04-03:T']
);
const lwdExport = buildAttendanceExportCsv({
  sheet: { attendance_month: '2026-04-01' },
  rows: lwdParsed.rows,
  type: 'data'
});
assert.match(lwdExport, /LWD/);
assert.match(lwdExport, /2026-04-03/);
assert.doesNotMatch(lwdExport, /4-Apr-26,NH/);

const lwdFromStatusCsv = [
  'Emp Code,Employee Name,LWD,Status,Amt. Type,1-Apr-26,2-Apr-26,3-Apr-26',
  'T21,Absconder,2026-04-02,Absconded,MONTHLY,P,,P'
].join('\n');
const lwdFromStatus = parseAmsAttendanceCsv(lwdFromStatusCsv);
assert.equal(lwdFromStatus.rows[0].status_label, 'Abscond');
assert.equal(
  lwdFromStatus.rows[0].day_marks.find((m) => m.mark_date === '2026-04-02')?.code,
  'AB'
);
assert.ok(!lwdFromStatus.rows[0].day_marks.some((m) => m.mark_date === '2026-04-03'));

const lwdMissingReasonCsv = [
  'Emp Code,Employee Name,LWD,Status,Amt. Type,1-Apr-26,2-Apr-26',
  'T22,NoReason,2026-04-01,Active,MONTHLY,,P'
].join('\n');
const lwdMissingReason = parseAmsAttendanceCsv(lwdMissingReasonCsv);
assert.ok(
  lwdMissingReason.errors.some((e) => /LWD date must be AB, R, or T/i.test(e.error)),
  'LWD without exit reason should error'
);
assert.equal(lwdMissingReason.rows.length, 0);

// Template-style rows often omit Amt. Type — still import every emp_code row.
const noAmtTypeCsv = [
  'Emp Code,Employee Name,Amt. Type,1-Apr-26,2-Apr-26',
  'T10,One,,P,W',
  'T11,Two,,A,P',
  ',,,'
].join('\n');
const noAmtParsed = parseAmsAttendanceCsv(noAmtTypeCsv);
assert.equal(noAmtParsed.rows.length, 2, 'rows without Amt. Type still import');
assert.equal(noAmtParsed.rows[0].emp_code, 'T10');
assert.equal(noAmtParsed.rows[1].emp_code, 'T11');
assert.equal(noAmtParsed.rows[0].amt_type, null);

console.log('attendance parser smoke OK', {
  month: sheetMeta.attendance_month,
  rows: rows.length,
  dayMarks: rows[0].day_marks.length,
  parseErrors: errors.length,
  emPayout: emParsed.sheetMeta.salary_payout_date
});
