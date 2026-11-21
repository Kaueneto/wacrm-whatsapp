-- Separate transaction: PostgreSQL must commit a new enum value before use.
ALTER TYPE public.account_role_enum ADD VALUE IF NOT EXISTS 'supervisor' AFTER 'admin';
