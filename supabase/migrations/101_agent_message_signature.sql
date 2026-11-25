ALTER TABLE public.profiles
  ADD COLUMN message_signature_enabled boolean NOT NULL DEFAULT false;
