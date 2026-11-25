import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const db = new PGlite();
const account='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const contact='00000000-0000-0000-0000-000000000010';
const sql=readFileSync('supabase/migrations/095_contact_uau_finance_links.sql','utf8');
beforeAll(async()=>{
  await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table accounts(id uuid primary key,owner_user_id uuid);
    create table profiles(user_id uuid,account_id uuid references accounts(id),account_role text);
    create table account_invitations(id uuid,account_id uuid references accounts(id),token_hash text,accepted_at timestamptz,expires_at timestamptz,accepted_by_user_id uuid,role text);
    create table contacts(id uuid primary key,account_id uuid references accounts(id) on delete cascade);
  `);
  for(const table of new Set([...sql.matchAll(/UNION ALL SELECT 1 FROM (\w+) WHERE account_id/g)].map(match=>match[1]))) {
    if(table!=='contact_uau_links')await db.exec(`create table ${table}(account_id uuid references accounts(id) on delete cascade)`);
  }
  await db.exec(sql);
},30000);
beforeEach(async()=>{
  await db.exec(`reset role;truncate accounts cascade;insert into accounts(id)values('${account}'),('${other}');insert into contacts values('${contact}','${account}')`);
});
afterAll(()=>db.close());
async function link(accountId=account){
  return db.query('insert into contact_uau_links(contact_id,account_id,document_encrypted,person_id,person_name,connection_revision) values($1,$2,$3,7,$4,$5)',[contact,accountId,'encrypted-test-value','Cliente',other]);
}
describe('contact UAU identity storage',()=>{
  it('prevents a contact from being linked under a different account',async()=>{
    await expect(link(other)).rejects.toThrow();
    await link();
    expect((await db.query('select * from contact_uau_links')).rows).toHaveLength(1);
  });
  it('does not expose encrypted CPF or allow direct edits to browser roles',async()=>{
    await link();
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);
      await expect(db.query('select * from contact_uau_links')).rejects.toThrow('permission denied');
      await expect(db.query("update contact_uau_links set person_name='changed'")).rejects.toThrow('permission denied');
      await db.exec('reset role');
    }
  });
  it('allows the backend service and cascades contact deletion',async()=>{
    await db.exec('set role service_role');
    await link();
    expect((await db.query('select * from contact_uau_links')).rows).toHaveLength(1);
    await db.exec('reset role');
    await db.query('delete from contacts where id=$1',[contact]);
    expect((await db.query('select * from contact_uau_links')).rows).toHaveLength(0);
  });
});
