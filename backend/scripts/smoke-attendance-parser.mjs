import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAmsAttendanceCsv,
  parseDayHeaderToDate,
  toSqlDate
} from '../src/utils/amsAttendanceParser.js';
import { computeLegendTotals, normalizeAttendanceCode } from '../src/utils/attendanceLegend.js';

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(here, '../../demo-attendance-ams-sample.csv');
const text = readFileSync(samplePath, 'utf8');

assert.equal(normalizeAttendanceCode('oc'), null);
assert.equal(normalizeAttendanceCode('NH'), 'NH');
assert.equal(normalizeAttendanceCode('FH'), 'FH');
assert.equal(normalizeAttendanceCode('a'), 'A');

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
assert.equal(rows.length, 2, 'two data rows');
assert.ok(rows[0].day_marks.length >= 7, 'day marks present');
assert.equal(rows[0].emp_code, 'T016394');
assert.equal(rows[0].legend_totals.P, 3);
assert.equal(rows[0].legend_totals.NH, 1);
assert.equal(rows[0].legend_totals.A, 1);
assert.equal(rows[0].legend_totals.W, 2);
assert.equal(rows[1].legend_totals.FH, 1);
assert.equal(rows[1].legend_totals.HD, 1);

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

console.log('attendance parser smoke OK', {
  month: sheetMeta.attendance_month,
  rows: rows.length,
  dayMarks: rows[0].day_marks.length,
  parseErrors: errors.length,
  emPayout: emParsed.sheetMeta.salary_payout_date
});
