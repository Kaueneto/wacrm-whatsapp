-- Login-only preferences. The attendance request deliberately omits numccm_atd.
-- Preserve any previously stored channel values for compatibility; they are no longer used.
alter table public.uau_attendance_user_settings alter column channel_code drop not null;
