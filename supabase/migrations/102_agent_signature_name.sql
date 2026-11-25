ALTER TABLE public.profiles
  ADD COLUMN message_signature_name text
  CHECK (message_signature_name IS NULL OR length(btrim(message_signature_name)) BETWEEN 1 AND 120);
