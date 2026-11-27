import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const db = new PGlite();
const account = '00000000-0000-0000-0000-000000000001',
  other = '00000000-0000-0000-0000-000000000002',
  owner = '00000000-0000-0000-0000-000000000011',
  outsider = '00000000-0000-0000-0000-000000000012',
  agent = '00000000-0000-0000-0000-000000000013',
  revision = '00000000-0000-0000-0000-000000000099';
interface Job {
  id: string;
  lease_token: string;
}
const begin = async () =>
  (
    await db.query<Job>(
      "select * from start_collection_sync($1,$2,'2026-11-27T00:00:00Z',$3)",
      [account, revision, owner]
    )
  ).rows[0];
async function stage(job: Job) {
  await db.query(
    'insert into collection_sync_records(account_id,run_id,contract_key,data,events) values($1,$2,$3,$4,$5)',
    [
      account,
      job.id,
      '900_00001_1',
      JSON.stringify({
        referenceDate: '2026-11-27',
        overdueCents: 31443,
        openCents: 16848568,
        state: 'overdue',
      }),
      JSON.stringify([
        { key: 'first', kind: 'first_seen', detail: { state: 'overdue' } },
      ]),
    ]
  );
}
async function apply(job: Job, count = 1) {
  return db.query('select apply_collection_sync($1,$2,$3) as total', [
    job.id,
    job.lease_token,
    count,
  ]);
}
async function asUser(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
describe('durable portfolio import', () => {
  beforeAll(async () => {
    await db.exec(
      `create role authenticated;create role anon;create role service_role bypassrls;create schema auth;create table accounts(id uuid primary key);create table auth.users(id uuid primary key);create table profiles(user_id uuid,account_id uuid,role text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function is_account_member(target uuid,minimum text) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where user_id=auth.uid() and account_id=target and role in ('owner','admin'))$$;grant usage on schema public,auth to authenticated,service_role;insert into accounts values('${account}'),('${other}');insert into auth.users values('${owner}'),('${outsider}'),('${agent}');insert into profiles values('${owner}','${account}','owner'),('${outsider}','${other}','owner'),('${agent}','${account}','agent');create table uau_connections(account_id uuid primary key,revision uuid);insert into uau_connections values('${account}','${revision}');`
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/106_collection_portfolio_setup.sql',
        'utf8'
      )
    );
    await db.query(
      "insert into collection_portfolio_settings(account_id,setup,updated_by,updated_at) values($1,'{}',$2,'2026-11-27T00:00:00Z')",
      [account, owner]
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/108_collection_portfolio_sync.sql',
        'utf8'
      )
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/110_collection_sync_schedule.sql',
        'utf8'
      )
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec(
      'reset role; truncate collection_sync_records,collection_daily_positions,collection_contract_events,collection_contracts,collection_sync_runs cascade'
    );
    await db.query('update uau_connections set revision=$1', [revision]);
    await db.exec(
      "update collection_portfolio_settings set setup='{}',schedule_next_at=null,schedule_lease=null,schedule_lease_until=null"
    );
  });
  afterAll(() => db.close());
  it('claims a due automatic sync only once and never claims manual settings', async () => {
    await db.exec(
      "update collection_portfolio_settings set schedule_next_at=now()-interval '1 minute'"
    );
    expect(
      (await db.query('select * from claim_collection_schedule()')).rows
    ).toEqual([]);
    await db.exec(
      `update collection_portfolio_settings set setup='{"schedule":{"enabled":true}}'`
    );
    const claimed = (
      await db.query<{ schedule_lease: string }>(
        'select * from claim_collection_schedule()'
      )
    ).rows;
    expect(claimed).toHaveLength(1);
    expect(claimed[0].schedule_lease).toBeTruthy();
    expect(
      (await db.query('select * from claim_collection_schedule()')).rows
    ).toEqual([]);
  });
  it('does not schedule another import while a live run is processing', async () => {
    await begin();
    await db.exec(
      `update collection_portfolio_settings set setup='{"schedule":{"enabled":true}}',schedule_next_at=now()-interval '1 minute'`
    );
    expect(
      (await db.query('select * from claim_collection_schedule()')).rows
    ).toEqual([]);
  });
  it('does not allow browser clients to claim scheduled work', async () => {
    await asUser(owner);
    await expect(
      db.query('select * from claim_collection_schedule()')
    ).rejects.toThrow();
  });
  it('does not allow two concurrent imports for the same organization', async () => {
    await begin();
    await expect(begin()).rejects.toThrow('andamento');
  });
  it('does not expose staged financial data or publish an incomplete response', async () => {
    const job = await begin();
    await stage(job);
    await expect(apply(job, 2)).rejects.toThrow('incompleto');
    expect((await db.query('select * from collection_contracts')).rows).toEqual(
      []
    );
    expect(
      (await db.query('select * from collection_contract_events')).rows
    ).toEqual([]);
  });
  it('publishes a complete run atomically and does not duplicate events on retry', async () => {
    const job = await begin();
    await stage(job);
    expect((await apply(job)).rows).toEqual([{ total: 1 }]);
    expect((await apply(job)).rows).toEqual([{ total: 1 }]);
    expect(
      (
        await db.query(
          'select count(*)::int as total from collection_contract_events'
        )
      ).rows
    ).toEqual([{ total: 1 }]);
    expect(
      (
        await db.query(
          'select count(*)::int as total from collection_daily_positions'
        )
      ).rows
    ).toEqual([{ total: 1 }]);
    expect(
      (await db.query('select * from collection_sync_records')).rows
    ).toEqual([]);
  });
  it('rejects a changed ERP connection before touching the live portfolio', async () => {
    const job = await begin();
    await stage(job);
    await db.query('update uau_connections set revision=$1', [other]);
    await expect(apply(job)).rejects.toThrow('Conexão alterada');
    expect((await db.query('select * from collection_contracts')).rows).toEqual(
      []
    );
  });
  it('restricts financial reads to administrators of the owning organization', async () => {
    const job = await begin();
    await stage(job);
    await apply(job);
    await asUser(outsider);
    expect((await db.query('select * from collection_contracts')).rows).toEqual(
      []
    );
    await asUser(agent);
    expect((await db.query('select * from collection_contracts')).rows).toEqual(
      []
    );
    await asUser(owner);
    expect(
      (await db.query('select * from collection_contracts')).rows
    ).toHaveLength(1);
    await expect(
      db.exec("update collection_contracts set data='{}'")
    ).rejects.toThrow();
    await expect(
      db.query('select apply_collection_sync($1,$2,1)', [
        job.id,
        job.lease_token,
      ])
    ).rejects.toThrow();
  });
});
