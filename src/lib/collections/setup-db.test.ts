import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const account = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const admin = '00000000-0000-0000-0000-000000000011';
const colleague = '00000000-0000-0000-0000-000000000012';
const outsider = '00000000-0000-0000-0000-000000000013';
const agent = '00000000-0000-0000-0000-000000000014';
async function asUser(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
describe('organization collection settings isolation', () => {
  beforeAll(async () => {
    await db.exec(`create role authenticated; create role service_role bypassrls; create schema auth;
      create table accounts(id uuid primary key); create table auth.users(id uuid primary key);
      create table profiles(user_id uuid,account_id uuid,account_role text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function is_account_member(target uuid, minimum text) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where user_id=auth.uid() and account_id=target and account_role in ('admin','owner'))$$;
      grant usage on schema public,auth to authenticated,service_role;
      insert into accounts values ('${account}'),('${other}');
      insert into auth.users values ('${admin}'),('${colleague}'),('${outsider}'),('${agent}');
      insert into profiles values ('${admin}','${account}','admin'),('${colleague}','${account}','admin'),('${outsider}','${other}','admin'),('${agent}','${account}','agent');`);
    await db.exec(
      readFileSync(
        'supabase/migrations/106_collection_portfolio_setup.sql',
        'utf8'
      )
    );
  }, 30000);
  afterAll(() => db.close());
  it('shares one draft among administrators of the same organization', async () => {
    await asUser(admin);
    await db.query(
      'insert into collection_portfolio_settings(account_id,setup,updated_by) values ($1,$2,$3)',
      [account, '{}', admin]
    );
    await asUser(colleague);
    expect(
      (
        await db.query(
          'select account_id,status from collection_portfolio_settings'
        )
      ).rows
    ).toEqual([{ account_id: account, status: 'draft' }]);
    await db.query(
      'update collection_portfolio_settings set setup=$1,updated_by=$2 where account_id=$3',
      ['{"version":1}', colleague, account]
    );
  });
  it('never exposes another organization draft or lets its administrator overwrite it', async () => {
    await asUser(outsider);
    expect(
      (await db.query('select * from collection_portfolio_settings')).rows
    ).toEqual([]);
    await expect(
      db.query(
        'insert into collection_portfolio_settings(account_id,setup,updated_by) values ($1,$2,$3)',
        [account, '{}', outsider]
      )
    ).rejects.toThrow();
  });
  it('does not allow attendants to read or edit administrative query settings', async () => {
    await asUser(agent);
    expect(
      (await db.query('select * from collection_portfolio_settings')).rows
    ).toEqual([]);
    await expect(
      db.query(
        'insert into collection_portfolio_settings(account_id,setup,updated_by) values ($1,$2,$3)',
        [account, '{}', agent]
      )
    ).rejects.toThrow();
  });
  it('cannot activate scheduling or forge the author through direct database access', async () => {
    await asUser(admin);
    await expect(
      db.query(
        "update collection_portfolio_settings set status='active' where account_id=$1",
        [account]
      )
    ).rejects.toThrow();
    await expect(
      db.query(
        'update collection_portfolio_settings set updated_by=$1 where account_id=$2',
        [outsider, account]
      )
    ).rejects.toThrow();
  });
});
