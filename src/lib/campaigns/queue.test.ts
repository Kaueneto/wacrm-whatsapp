import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real PostgreSQL execution, isolated from the configured Supabase and Meta.
// Fixture models the existing columns/functions consumed by migration 061.
const db = new PGlite();
const account = '00000000-0000-0000-0000-000000000001';
const user = '00000000-0000-0000-0000-000000000002';
const contact = '00000000-0000-0000-0000-000000000003';
async function scalar(sql: string, params: unknown[] = []) {
  const result = await db.query<{ value: unknown }>(sql, params);
  return result.rows[0]?.value;
}
async function enqueue(
  name = 'Test',
  request: string | null = null,
  campaign: string | null = null
) {
  return scalar(
    `select enqueue_broadcast($1,$2,$3,$4,'phone','waba',$5,'{}','{}',null,$6,null,null,null,$7) as value`,
    [
      account,
      user,
      name,
      JSON.stringify({ name: 'test', language: 'pt_BR' }),
      JSON.stringify([
        {
          contact_id: contact,
          phone: '5562111111111',
          name: 'Test',
          params: [],
        },
      ]),
      campaign,
      request,
    ]
  ) as Promise<string>;
}
async function claim() {
  return scalar('select claim_broadcast_recipient() as value') as Promise<{
    lease: string;
    recipient: { id: string };
    job: { broadcast_id: string };
  } | null>;
}
describe('Postgres campaign queue', () => {
  beforeAll(async () => {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create table accounts(id uuid primary key);create table contacts(id uuid primary key,account_id uuid,phone text,name text,
        phone_normalized text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored);
      create function public.is_account_member(uuid) returns boolean language sql as 'select false';
      create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
      create table broadcasts(id uuid primary key default gen_random_uuid(),account_id uuid,user_id uuid,name text,template_name text,
       template_language text,status text constraint broadcasts_status_check check(status in ('draft','scheduled','sending','sent','failed')),
       total_recipients integer,sent_count integer default 0,failed_count integer default 0,audience_filter jsonb,template_variables jsonb,
       created_at timestamptz default now(),updated_at timestamptz default now(),scheduled_at timestamptz);
      create table broadcast_recipients(id uuid primary key default gen_random_uuid(),broadcast_id uuid references broadcasts(id) on delete cascade,
       contact_id uuid,status text,template_params jsonb,whatsapp_message_id text,error_message text,sent_at timestamptz,delivered_at timestamptz,read_at timestamptz,replied_at timestamptz,created_at timestamptz default now());
      insert into accounts values ('${account}');insert into auth.users values ('${user}');insert into contacts values ('${contact}','${account}','+5562111111111','Test');`);
    await db.exec(
      readFileSync('supabase/migrations/061_campaign_queue.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/063_campaign_progress.sql', 'utf8')
    );
    await db.exec(readFileSync('supabase/migrations/064_campaign_schedule_audit.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/084_broadcast_execution_and_replies.sql','utf8'));
  }, 30000);
  beforeEach(async () => {
    await db.exec(
      'truncate broadcasts,broadcast_jobs,broadcast_recipients,broadcast_sender_slots,broadcast_status_events,campaigns cascade'
    );
  });
  afterAll(async () => {
    await db.close();
  });
  it('is independent of any HTTP callback and prevents duplicate claims on one sender', async () => {
    const id = await enqueue();
    expect(await scalar('select started_at as value from broadcasts where id=$1', [id])).toBeNull();
    const first = await claim();
    expect(first?.job.broadcast_id).toBe(id);
    expect(await scalar('select started_at is not null as value from broadcasts where id=$1', [id])).toBe(true);
    expect(await claim()).toBeNull();
    expect(
      await scalar('select dispatch_state as value from broadcast_recipients')
    ).toBe('sending');
  });
  it('attributes a customer reply across phone formats only on the sender and after an accepted send', async () => {
    const id = await enqueue();
    const first = (await claim())!;
    await db.query("select finish_broadcast_recipient($1,$2,'accepted','reply-test')", [first.recipient.id, first.lease]);
    await enqueue('Queued after send');
    const recordedAt = 'select record_broadcast_reply($1,$2,now(),$3,$4,$5) as value';
    const args = [account, user, ['5562111111111']];
    expect(await scalar(recordedAt, [...args, 'another-sender', null])).toBeNull();
    expect(await scalar(recordedAt, [...args, 'phone', 'another-message'])).toBeNull();
    expect(await scalar(recordedAt, [...args, 'phone', null])).toBe(first.recipient.id);
    expect(await scalar(recordedAt, [...args, 'phone', null])).toBeNull();
    expect(await scalar('select status as value from broadcast_recipients where broadcast_id=$1', [id])).toBe('replied');
  });
  it('deduplicates repeated queue requests', async () => {
    const key = '00000000-0000-0000-0000-000000000005';
    expect(await enqueue('a', key)).toBe(await enqueue('a', key));
    expect(await scalar('select count(*)::int as value from broadcasts')).toBe(
      1
    );
  });
  it('does not send paused or cancelled work', async () => {
    const id = await enqueue();
    await db.query("select control_broadcast_job($1,$2,'pause')", [
      id,
      account,
    ]);
    expect(await claim()).toBeNull();
    await db.query("select control_broadcast_job($1,$2,'resume')", [
      id,
      account,
    ]);
    expect(await claim()).not.toBeNull();
  });
  it('cancels only unclaimed recipients', async () => {
    const id = await enqueue();
    await db.query("select control_broadcast_job($1,$2,'cancel')", [
      id,
      account,
    ]);
    expect(await claim()).toBeNull();
    expect(
      await scalar('select dispatch_state as value from broadcast_recipients')
    ).toBe('cancelled');
  });
  it('marks interrupted sends unknown instead of repeating them after restart', async () => {
    await enqueue();
    await claim();
    await db.exec(
      "update broadcast_recipients set dispatch_lease_until=now()-interval '1 second';update broadcast_sender_slots set lease_until=now()-interval '1 second'"
    );
    expect(await claim()).toBeNull();
    expect(
      await scalar('select dispatch_state as value from broadcast_recipients')
    ).toBe('unknown');
  });
  it('replays early delivery events and ignores duplicate/out-of-order statuses', async () => {
    await enqueue();
    const item = (await claim())!;
    await db.exec(
      "select record_broadcast_status('wamid','delivered',now());select record_broadcast_status('wamid','delivered',now())"
    );
    await db.query(
      "select finish_broadcast_recipient($1,$2,'accepted','wamid')",
      [item.recipient.id, item.lease]
    );
    await db.exec("select record_broadcast_status('wamid','sent',now())");
    expect(
      await scalar('select status as value from broadcast_recipients')
    ).toBe('delivered');
    expect(
      await scalar('select count(*)::int as value from broadcast_status_events')
    ).toBe(2);
    expect(
      await scalar('select processed_count as value from broadcasts')
    ).toBe(1);
  });
  it('fences stale completion tokens and retains throttled items until due', async () => {
    await enqueue();
    const item = (await claim())!;
    expect(
      await scalar(
        "select finish_broadcast_recipient($1,'00000000-0000-0000-0000-000000000099','accepted','bad') as value",
        [item.recipient.id]
      )
    ).toBe(false);
    await db.query(
      "select finish_broadcast_recipient($1,$2,'queued',null,'rate limit',60)",
      [item.recipient.id, item.lease]
    );
    expect(await claim()).toBeNull();
    expect(
      await scalar('select dispatch_state as value from broadcast_recipients')
    ).toBe('queued');
  });
  it('shares the sender slot across two campaigns and rejects cross-account recipients', async () => {
    await enqueue('a');
    await enqueue('b');
    expect(await claim()).not.toBeNull();
    expect(await claim()).toBeNull();
    await expect(
      db.query(
        `select enqueue_broadcast($1,$2,'bad','{"name":"x","language":"pt_BR"}','other','waba',
      '[{"contact_id":"00000000-0000-0000-0000-000000000099","phone":"1","params":[]}]')`,
        [account, user]
      )
    ).rejects.toThrow('outside account');
  });
  it('restricts worker capabilities and catalog visibility for browser roles', async () => {
    await enqueue();
    await db.exec('set role authenticated');
    try {
      await expect(
        db.query('select claim_broadcast_recipient()')
      ).rejects.toThrow('permission denied');
      expect(
        await scalar('select count(*)::int as value from broadcast_jobs')
      ).toBe(0);
    } finally {
      await db.exec('reset role');
    }
  });
  it('does not allow browser writes to frozen queue fields', async () => {
    const id = await enqueue();
    await db.exec(
      "grant select,update on broadcast_recipients to authenticated;set request.jwt.claim.role='authenticated';set role authenticated"
    );
    try {
      await expect(
        db.query(
          "update broadcast_recipients set phone_snapshot='999' where broadcast_id=$1",
          [id]
        )
      ).rejects.toThrow('managed by the server');
    } finally {
      await db.exec('reset role;reset request.jwt.claim.role');
    }
  });
  it('reports processing independently of delivery and worker availability', async () => {
    const id = await enqueue();
    const p = (await scalar('select broadcast_queue_progress($1,$2) as value', [
      id,
      account,
    ])) as { processed: number; worker_online: boolean };
    expect(p.processed).toBe(0);
    expect(p.worker_online).toBe(false);
  });
  it('blocks overlapping campaign executions and atomically advances a claimed schedule', async () => {
    const campaign = '00000000-0000-0000-0000-000000000010';
    await db.query(
      `insert into campaigns(id,account_id,user_id,name,definition,schedule,active,next_run_at)
      values($1,$2,$3,'Recurring','{}','{}',true,now()-interval '1 day')`,
      [campaign, account, user]
    );
    await enqueue('First', null, campaign);
    await expect(enqueue('Duplicate', null, campaign)).rejects.toThrow(
      'unfinished'
    );
    expect(await scalar('select claim_due_campaign() as value')).toBeNull();
    const item = (await claim())!;
    await db.query(
      "select finish_broadcast_recipient($1,$2,'accepted','recurring-message')",
      [item.recipient.id, item.lease]
    );
    await claim(); // finalizes the completed job
    const c = (await scalar('select claim_due_campaign() as value')) as {
      scheduler_lease: string;
    };
    expect(c.scheduler_lease).toBeTruthy();
    await db.query(
      `select enqueue_broadcast($1,$2,'Next',$3,'phone','waba',$4,'{}','{}',null,$5,null,$6,now()+interval '3 days')`,
      [
        account,
        user,
        JSON.stringify({ name: 'test', language: 'pt_BR' }),
        JSON.stringify([
          {
            contact_id: contact,
            phone: '+5562111111111',
            name: 'Test',
            params: [],
          },
        ]),
        campaign,
        c.scheduler_lease,
      ]
    );
    expect(
      await scalar('select (next_run_at>now()) as value from campaigns')
    ).toBe(true);
    expect(
      await scalar('select scheduler_lease as value from campaigns')
    ).toBeNull();
    expect(await scalar('select count(*)::int as value from broadcasts')).toBe(
      2
    );
    expect(await scalar("select scheduled_at<created_at as value from broadcasts where name='Next'")).toBe(true);
  });
});
