# Attendance Manual QA Checklist

Reference: [attendance-calculation-dependencies.md](attendance-calculation-dependencies.md) for field dependency map and paid_days edit deltas.

Run before release. Roles: **PL** (Payroll Lead / HR ops), **PM** (Program Manager).

## A. Policy setup (PL)

- [ ] **P1** First-time policy save creates audit log; only sheets from Effective from month onward recalculate
- [ ] **P2** Effective from `2026-06` + week-off change: Jan–May unchanged; Jun+ uses new week-offs
- [ ] **P3** Add NH holiday effective `2026-04`: April sheet gets NH; March unchanged
- [ ] **P4** Raise EL allowance effective `2026-07`: Jul+ `EL_left` updates; Jun and earlier unchanged
- [ ] **P5** Incentive rule change effective next month: prior months keep old incentive
- [ ] **P6** Policy history shows actor, timestamp, and change summary with effective month

## B. Upload & grid (PL + PM)

- [ ] **U1** CSV upload creates DRAFT sheet with defaults and summaries
- [ ] **U2** Partial upload failures show skip/failure modal
- [ ] **U3** Month picker loads correct sheet or empty state
- [ ] **U4** Search and leave-type filter work; footer totals update
- [ ] **U5** Grid always shows the sheet's calendar month (1st–last day); payroll cycle (e.g. 25–24) is header metadata only and does not change columns or paid days

## C. Inline editing + auto-save (PL + PM)

- [ ] **E1** Day cell change auto-saves; paid days, LOP, leave summary, incentive update
- [ ] **E2** Add-on incentive auto-saves without changing computed incentive
- [ ] **E3** Remarks auto-save without affecting paid days
- [ ] **E4** Rapid edits on same row debounce to one save
- [ ] **E5** Two rows save independently
- [ ] **E6** Locked sheet blocks edits
- [ ] **E7** Scoped unlock allows only granted PM
- [ ] **E8** Network failure shows error; retry on next edit
- [ ] **E9** March EL edit updates April–Dec YTD leave columns for that employee
- [ ] **E10** Submit blocked while auto-save pending; works after save completes

## D. Workflow & permissions

- [ ] **W1–W8** Submit, lock, unlock, request edit, resubmit, 403 on wrong client, activity log

## E. Export

- [ ] **X1–X3** Data, incentive, leave, and template exports match grid

## F. Edge cases

- [ ] **G1–G7** DOJ/LWD, HD, P-NH comp-off, empty cells, old month uses that month's policy version, Recompute uses versioned policy
