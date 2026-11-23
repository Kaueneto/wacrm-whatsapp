import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const caller = '00000000-0000-0000-0000-000000000001';
const previous = '00000000-0000-0000-0000-000000000010';
const target = '00000000-0000-0000-0000-000000000020';
const sql = readFileSync('supabase/migrations/094_invitation_guard_integration_data.sql', 'utf8');

beforeAll(async () => {
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${caller}'::uuid $$;
    create table accounts(id uuid primary key, owner_user_id uuid);
    create table profiles(user_id uuid primary key, account_id uuid references accounts(id), account_role text);
    create table account_invitations(id uuid primary key, token_hash text, account_id uuid references accounts(id), role text, expires_at timestamptz, accepted_at timestamptz, accepted_by_user_id uuid);
  `);
  const tables = new Set([...sql.matchAll(/UNION ALL SELECT 1 FROM (\w+) WHERE account_id/g)].map(match => match[1]));
  tables.add('contacts');
  for (const table of tables) await db.exec(`create table ${table}(account_id uuid references accounts(id) on delete cascade)`);
  await db.exec(sql);
}, 30000);

beforeEach(async () => {
  await db.exec(`truncate accounts cascade;
    insert into accounts values ('${previous}', '${caller}'), ('${target}', '${target}');
    insert into profiles values ('${caller}', '${previous}', 'admin');
    insert into account_invitations(id,token_hash,account_id,role,expires_at)
      values ('${caller}', 'token', '${target}', 'agent', now() + interval '1 day');
  `);
});
afterAll(() => db.close());

describe('invitation preserves integration data', () => {
  it.each(['uau_connections', 'whatsapp_webhook_events'])('refuses to discard an account containing %s', async table => {
    await db.exec(`insert into ${table} values ('${previous}')`);
    await expect(db.query("select redeem_invitation('token')")).rejects.toThrow('already contains data');
    expect((await db.query<{account_id:string}>('select account_id from profiles')).rows[0].account_id).toBe(previous);
    expect((await db.query(`select * from ${table}`)).rows).toHaveLength(1);
    expect((await db.query('select * from accounts')).rows).toHaveLength(2);
  });
  it('still allows the owner of an empty account to join', async () => {
    expect((await db.query<{id:string}>("select redeem_invitation('token') as id")).rows[0].id).toBe(target);
    expect((await db.query('select * from accounts')).rows).toHaveLength(1);
    expect((await db.query<{account_id:string}>('select account_id from profiles')).rows[0].account_id).toBe(target);
  });
});
