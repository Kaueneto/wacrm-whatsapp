import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
const db = new PGlite();
const account = '00000000-0000-0000-0000-000000000001';
const contact = '00000000-0000-0000-0000-000000000002';
const user = '00000000-0000-0000-0000-000000000003';
const other = '00000000-0000-0000-0000-000000000004';
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.accounts(id uuid primary key);
    create table public.contacts(id uuid primary key, account_id uuid, unique(id,account_id));
    insert into accounts values('${account}'),('${other}');
    insert into auth.users values('${user}');
    insert into contacts values('${contact}','${account}');`);
  await db.exec(
    readFileSync('supabase/migrations/096_uau_attendance.sql', 'utf8')
  );
  await db.exec(
    readFileSync(
      'supabase/migrations/097_uau_attendance_optional_channel.sql',
      'utf8'
    )
  );
  await db.exec(
    readFileSync(
      'supabase/migrations/098_uau_attendance_rejections.sql',
      'utf8'
    )
  );
  await db.exec(
    readFileSync('supabase/migrations/099_uau_attendance_result_id.sql', 'utf8')
  );
}, 30000);
afterAll(() => db.close());
it('stores the generated ERP number and rejects invalid identifiers', async () => {
  await db.query(
    'insert into uau_attendance_submissions(id,account_id,contact_id,user_id,request_hash,state,attendance_id) values($1,$2,$3,$4,$5,$6,$7)',
    [other, account, contact, user, 'result-hash', 'succeeded', 22701]
  );
  expect(
    (
      await db.query(
        'select attendance_id from uau_attendance_submissions where id=$1',
        [other]
      )
    ).rows
  ).toEqual([{ attendance_id: 22701 }]);
  await expect(
    db.query(
      'update uau_attendance_submissions set attendance_id=0 where id=$1',
      [other]
    )
  ).rejects.toMatchObject({ code: '23514' });
  await db.query('delete from uau_attendance_submissions where id=$1', [other]);
});
it('saves a login without any channel after migration 097', async () => {
  await db.query(
    'insert into uau_attendance_user_settings(account_id,user_id,connection_revision,uau_login) values($1,$2,$3,$4)',
    [account, user, other, 'TEST_LOGIN']
  );
  expect(
    (
      await db.query(
        'select uau_login,channel_code from uau_attendance_user_settings'
      )
    ).rows
  ).toEqual([{ uau_login: 'TEST_LOGIN', channel_code: null }]);
});
it('reserves each submission once and refuses a contact in a different account', async () => {
  const insert = (accountId: string) =>
    db.query(
      'insert into uau_attendance_submissions(id,account_id,contact_id,user_id,request_hash) values($1,$2,$3,$4,$5)',
      [contact, accountId, contact, user, 'test-hash']
    );
  await expect(insert(other)).rejects.toMatchObject({ code: '23503' });
  await insert(account);
  await expect(insert(account)).rejects.toMatchObject({ code: '23505' });
});
it('does not expose user mappings or submission history directly to browser roles', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of [
      'uau_attendance_user_settings',
      'uau_attendance_submissions',
    ])
      await expect(db.query(`select * from ${table}`)).rejects.toThrow(
        'permission denied'
      );
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  expect(
    (await db.query('select * from uau_attendance_submissions')).rows
  ).toHaveLength(1);
  await db.exec('reset role');
});

it('stores explicit rejection separately from an unknown outcome', async () => {
  await db.query('update uau_attendance_submissions set state=$1 where id=$2', [
    'rejected',
    contact,
  ]);
  expect(
    (
      await db.query(
        'select state from uau_attendance_submissions where id=$1',
        [contact]
      )
    ).rows
  ).toEqual([{ state: 'rejected' }]);
});
