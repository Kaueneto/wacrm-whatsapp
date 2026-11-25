import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
const db = new PGlite();
const user = '00000000-0000-0000-0000-000000000001';
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_change text);
    create table profiles(user_id uuid primary key, email text not null, full_name text);
    insert into auth.users values('${user}', 'confirmed@example.com', null);
    insert into profiles values('${user}', 'stale@example.com', 'Attendant');`);
  await db.exec(
    readFileSync('supabase/migrations/100_sync_profile_auth_email.sql', 'utf8')
  );
  await db.exec(
    readFileSync('supabase/migrations/101_agent_message_signature.sql', 'utf8')
  );
  await db.exec(
    readFileSync('supabase/migrations/102_agent_signature_name.sql', 'utf8')
  );
}, 30000);
afterAll(() => db.close());
it('defaults the signature name to null and validates its stored length', async () => {
  expect(
    (await db.query('select message_signature_name from profiles')).rows
  ).toEqual([{ message_signature_name: null }]);
  await expect(
    db.query('update profiles set message_signature_name = $1', [' '])
  ).rejects.toThrow();
  await expect(
    db.query('update profiles set message_signature_name = $1', [
      'a'.repeat(121),
    ])
  ).rejects.toThrow();
});
it('repairs stale profile email from Auth and defaults signatures to disabled', async () => {
  expect(
    (
      await db.query(
        'select email, full_name, message_signature_enabled from profiles'
      )
    ).rows
  ).toEqual([
    {
      email: 'confirmed@example.com',
      full_name: 'Attendant',
      message_signature_enabled: false,
    },
  ]);
});
it('keeps the confirmed email during a pending request and synchronizes only after confirmation', async () => {
  await db.exec(
    `update auth.users set email_change = 'new@example.com' where id = '${user}';`
  );
  expect((await db.query('select email from profiles')).rows).toEqual([
    { email: 'confirmed@example.com' },
  ]);
  await db.exec(
    `update auth.users set email = 'new@example.com', email_change = null where id = '${user}';`
  );
  expect((await db.query('select email from profiles')).rows).toEqual([
    { email: 'new@example.com' },
  ]);
});
