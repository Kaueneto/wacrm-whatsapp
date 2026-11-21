-- Keep reading shared canned replies, but only administrators can manage them.
CREATE POLICY support_quick_replies_insert ON public.quick_replies AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY support_quick_replies_update ON public.quick_replies AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_account_member(account_id, 'admin')) WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY support_quick_replies_delete ON public.quick_replies AS RESTRICTIVE FOR DELETE TO authenticated USING (is_account_member(account_id, 'admin'));

-- Do not let account-wide Storage listings reveal attachments from other
-- attendants. Public attachment URLs remain bearer links in this application;
-- making old URLs private requires a separate signed-media migration.
CREATE POLICY support_media_select ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (
  bucket_id NOT IN ('chat-media','flow-media') OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND (
      (public.is_account_member(p.account_id, 'admin') AND (
        split_part(name,'/',1) = 'account-' || p.account_id::text OR split_part(name,'/',1) = p.user_id::text
      )) OR (bucket_id = 'chat-media' AND (
        starts_with(name, 'account-' || p.account_id::text || '/users/' || p.user_id::text || '/') OR EXISTS (
          SELECT 1 FROM public.messages m WHERE right(m.media_url, length('/storage/v1/object/public/chat-media/' || name)) = '/storage/v1/object/public/chat-media/' || name
        )
      ))
    )
  )
);
CREATE POLICY support_media_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  bucket_id NOT IN ('chat-media','flow-media') OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND (
      public.is_account_member(p.account_id, 'admin') OR
      (bucket_id = 'chat-media' AND starts_with(name, 'account-' || p.account_id::text || '/users/' || p.user_id::text || '/'))
    )
  )
);
CREATE POLICY support_media_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (
  bucket_id NOT IN ('chat-media','flow-media') OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND (
      public.is_account_member(p.account_id, 'admin') OR
      (bucket_id = 'chat-media' AND starts_with(name, 'account-' || p.account_id::text || '/users/' || p.user_id::text || '/'))
    )
  )
) WITH CHECK (
  bucket_id NOT IN ('chat-media','flow-media') OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND (
      public.is_account_member(p.account_id, 'admin') OR
      (bucket_id = 'chat-media' AND starts_with(name, 'account-' || p.account_id::text || '/users/' || p.user_id::text || '/'))
    )
  )
);
CREATE POLICY support_media_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (
  bucket_id NOT IN ('chat-media','flow-media') OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND (
      public.is_account_member(p.account_id, 'admin') OR
      (bucket_id = 'chat-media' AND starts_with(name, 'account-' || p.account_id::text || '/users/' || p.user_id::text || '/'))
    )
  )
);
