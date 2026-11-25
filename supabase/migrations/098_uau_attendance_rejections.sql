-- Explicit ERP validation refusals are distinct from unknown delivery outcomes.
alter table public.uau_attendance_submissions drop constraint uau_attendance_submissions_state_check;
alter table public.uau_attendance_submissions add constraint uau_attendance_submissions_state_check
  check (state in ('pending','succeeded','uncertain','rejected'));
