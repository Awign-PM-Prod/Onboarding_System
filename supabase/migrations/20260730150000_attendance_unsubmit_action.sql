-- Allow undo-submit activity logging (Attendance "Undo" toast after submit/resubmit)

alter table public.attendance_activity_logs
  drop constraint if exists attendance_activity_logs_action_check;

alter table public.attendance_activity_logs
  add constraint attendance_activity_logs_action_check
  check (action in (
    'SUBMIT',
    'RESUBMIT',
    'UNSUBMIT',
    'LOCK',
    'UNLOCK',
    'REQUEST_EDIT',
    'UPLOAD',
    'CELL_CHANGE',
    'ROW_FIELD_CHANGE',
    'RECOMPUTE'
  ));
