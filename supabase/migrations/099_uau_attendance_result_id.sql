-- Return the same ERP record number after a successful idempotent replay.
alter table public.uau_attendance_submissions add column attendance_id integer check (attendance_id > 0);
