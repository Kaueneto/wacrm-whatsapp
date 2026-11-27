import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const account = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const conversation = '00000000-0000-0000-0000-000000000010';
async function enqueue(key = 'one', partition = 'sender') {
  return db.query('select enqueue_whatsapp_webhooks($1) as added', [
    JSON.stringify([
      {
        key,
        partition,
        phone_id: '123',
        waba_id: '456',
        payload: { entry: [] },
      },
    ]),
  ]);
}
async function claim() {
  return (
    await db.query<Record<string, unknown>>(
      'select * from claim_whatsapp_webhook()'
    )
  ).rows[0];
}
function message(wamid = 'wamid.1', at = new Date().toISOString()) {
  return {
    conversation_id: conversation,
    sender_type: 'customer',
    content_type: 'text',
    content_text: 'Olá',
    message_id: wamid,
    status: 'delivered',
    created_at: at,
  };
}
async function store(job: Record<string, unknown>, row = message()) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      'select store_whatsapp_inbound_event($1,$2,$3) as result',
      [job.id, job.lease_token, JSON.stringify(row)]
    )
  ).rows[0].result;
}
describe('durable WhatsApp webhook inbox in PostgreSQL', () => {
  beforeAll(async () => {
    await db.exec(`
      create role authenticated; create role anon; create role service_role bypassrls;
      create table accounts(id uuid primary key);
      create table whatsapp_config(account_id uuid references accounts(id),phone_number_id text,waba_id text);
      create table conversations(id uuid primary key,account_id uuid references accounts(id),unread_count integer default 0,
        first_inbound_at timestamptz,last_inbound_at timestamptz,last_message_at timestamptz,last_message_text text,status text default 'open',updated_at timestamptz default now(),
        assigned_agent_id uuid,team_queue_enabled boolean default false,ai_autoreply_disabled boolean default false,ai_flow_context jsonb,ai_reply_count integer default 0);
      create table messages(id uuid primary key default gen_random_uuid(),conversation_id uuid references conversations(id),sender_type text,content_type text,content_text text,
        media_url text,media_type text,message_id text,status text,created_at timestamptz,reply_to_message_id uuid,interactive_reply_id text,error_code integer,error_title text,error_details text,
        unique(conversation_id,message_id));
    `);
    await db.exec(
      readFileSync(
        'supabase/migrations/092_durable_whatsapp_webhooks.sql',
        'utf8'
      )
    );
    await db.exec(
      readFileSync('supabase/migrations/093_late_webhook_recovery.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/105_inbound_attendance_lifecycle.sql', 'utf8')
    );
  });
  beforeEach(async () => {
    await db.exec('reset role');
    await db.exec(
      `truncate accounts cascade; insert into accounts values ('${account}'),('${other}'); insert into whatsapp_config values ('${account}','123','456'); insert into conversations(id,account_id) values ('${conversation}','${account}');`
    );
  });
  afterAll(() => db.close());

  it('commits receipts and deduplicates repeated Meta deliveries', async () => {
    expect((await enqueue()).rows).toEqual([{ added: 1 }]);
    expect((await enqueue()).rows).toEqual([{ added: 0 }]);
    expect(
      (
        await db.query(
          'select account_id,state,payload from whatsapp_webhook_events'
        )
      ).rows
    ).toEqual([
      { account_id: account, state: 'pending', payload: { entry: [] } },
    ]);
  });
  it('serializes one sender while allowing other conversations to progress', async () => {
    await enqueue('a', 'sender1');
    await enqueue('b', 'sender1');
    await enqueue('c', 'sender2');
    const first = await claim(),
      second = await claim();
    expect(first.event_key).toBe('a');
    expect(second.event_key).toBe('c');
    expect(await claim()).toBeUndefined();
    await db.query(
      "update whatsapp_webhook_events set state='done' where id=$1",
      [first.id]
    );
    expect((await claim()).event_key).toBe('b');
  });
  it('recovers an expired lease with a new fencing token', async () => {
    await enqueue();
    const first = await claim();
    await db.query(
      "update whatsapp_webhook_events set lease_until=now()-interval '1 second' where id=$1",
      [first.id]
    );
    const next = await claim();
    expect(next.lease_token).not.toBe(first.lease_token);
    expect(next.attempts).toBe(2);
    await expect(store(first)).rejects.toMatchObject({ code: '40001' });
    expect((await store(next)).inserted).toBe(true);
  });
  it('atomically stores the message, unread count and recoverable checkpoint', async () => {
    await enqueue();
    const job = await claim();
    expect(await store(job)).toMatchObject({
      inserted: true,
      first_inbound: true,
      history_only: false,
    });
    expect(await store(job)).toMatchObject({ inserted: false, resume: true });
    expect(
      (
        await db.query(
          'select unread_count,last_message_text from conversations'
        )
      ).rows
    ).toEqual([{ unread_count: 1, last_message_text: 'Olá' }]);
    expect(
      (
        await db.query(
          'select phase,conversation_id from whatsapp_webhook_events'
        )
      ).rows
    ).toEqual([{ phase: 'stored', conversation_id: conversation }]);
    expect(
      (
        await db.query(
          'select begin_whatsapp_webhook_effects($1,$2) as advanced',
          [job.id, job.lease_token]
        )
      ).rows
    ).toEqual([{ advanced: true }]);
    expect(
      (
        await db.query(
          'select begin_whatsapp_webhook_effects($1,$2) as advanced',
          [job.id, job.lease_token]
        )
      ).rows
    ).toEqual([{ advanced: false }]);
  });
  it.each(['open', 'pending'])('preserves human ownership on inbound during %s support', async (status) => {
    await db.query(`update conversations set status=$1,assigned_agent_id=$2,
      team_queue_enabled=true,ai_autoreply_disabled=true,ai_reply_count=3`, [status, other]);
    await enqueue();
    await store(await claim());
    expect((await db.query(`select status,assigned_agent_id,team_queue_enabled,
      ai_autoreply_disabled,ai_reply_count from conversations`)).rows).toEqual([{
      status, assigned_agent_id: other, team_queue_enabled: true,
      ai_autoreply_disabled: true, ai_reply_count: 3,
    }]);
  });

  it('releases previous attendance ownership on a fresh message after closure, including follow-up replies', async () => {
    await db.query(`update conversations set status='closed',assigned_agent_id=$1,
      team_queue_enabled=true,ai_autoreply_disabled=true,ai_reply_count=3,
      ai_flow_context='{"kind":"flow"}',first_inbound_at=now()-interval '1 day'`, [other]);
    await enqueue('reopen');
    expect(await store(await claim())).toMatchObject({ inserted: true, first_inbound: false, history_only: false });
    const expected = {
      status: 'open', assigned_agent_id: null, team_queue_enabled: false,
      ai_autoreply_disabled: false, ai_flow_context: null, ai_reply_count: 0,
    };
    const ownership = () => db.query(`select status,assigned_agent_id,team_queue_enabled,
      ai_autoreply_disabled,ai_flow_context,ai_reply_count from conversations`);
    expect((await ownership()).rows).toEqual([expected]);
    await enqueue('reply', 'another-partition');
    await store(await claim(), message('wamid.reply'));
    expect((await ownership()).rows).toEqual([expected]);
  });

  it('does not release previous ownership for a delayed message after closure', async () => {
    await db.query(`update conversations set status='closed',assigned_agent_id=$1,
      ai_autoreply_disabled=true,team_queue_enabled=true`, [other]);
    await enqueue();
    expect(await store(await claim(), message('wamid.late', new Date(Date.now() - 3600000).toISOString())))
      .toMatchObject({ history_only: true });
    expect((await db.query(`select assigned_agent_id,ai_autoreply_disabled,team_queue_enabled from conversations`)).rows)
      .toEqual([{ assigned_agent_id: other, ai_autoreply_disabled: true, team_queue_enabled: true }]);
  });

  it('does not release a new human owner when retrying a stored receipt', async () => {
    await db.exec("update conversations set status='closed'");
    await enqueue();
    const job = await claim();
    const inbound = message();
    await store(job, inbound);
    await db.query(`update conversations set status='pending',assigned_agent_id=$1,
      ai_autoreply_disabled=true`, [other]);
    expect(await store(job, inbound)).toMatchObject({ inserted: false, resume: true });
    expect((await db.query('select status,assigned_agent_id,ai_autoreply_disabled from conversations')).rows)
      .toEqual([{ status: 'pending', assigned_agent_id: other, ai_autoreply_disabled: true }]);
  });

  it('stores late messages without moving the last-message summary backwards', async () => {
    const current = new Date().toISOString();
    await db.query(
      'update conversations set last_message_at=$1,last_inbound_at=$1,last_message_text=$2',
      [current, 'Mensagem mais recente']
    );
    await enqueue();
    const job = await claim();
    expect(
      await store(
        job,
        message('wamid.old', new Date(Date.now() - 3600000).toISOString())
      )
    ).toMatchObject({ history_only: true });
    expect(
      (
        await db.query(
          'select last_message_text,unread_count from conversations'
        )
      ).rows
    ).toEqual([
      { last_message_text: 'Mensagem mais recente', unread_count: 1 },
    ]);
  });
  it('re-evaluates old messages when resuming a stored checkpoint', async () => {
    await enqueue();
    const job = await claim();
    const old = message(
      'wamid.old',
      new Date(Date.now() - 3600000).toISOString()
    );
    await store(job, old);
    await db.query(
      'update whatsapp_webhook_events set history_only=false where id=$1',
      [job.id]
    );
    expect(await store(job, old)).toMatchObject({
      resume: true,
      history_only: true,
    });
  });
  it('preserves a newer human reply when an older customer message arrives', async () => {
    await db.query(
      'update conversations set last_message_at=$1,last_message_text=$2',
      [new Date().toISOString(), 'Resposta humana mais recente']
    );
    await enqueue();
    expect(
      await store(
        await claim(),
        message('wamid.before-human', new Date(Date.now() - 3000).toISOString())
      )
    ).toMatchObject({ history_only: true });
  });
  it('never repeats the unread increment for a separately queued duplicate', async () => {
    await enqueue();
    await store(await claim());
    await db.exec("update whatsapp_webhook_events set state='done'");
    await enqueue('duplicate');
    expect(await store(await claim())).toMatchObject({
      inserted: false,
      resume: false,
    });
    expect(
      (await db.query('select unread_count from conversations')).rows
    ).toEqual([{ unread_count: 1 }]);
  });
  it('rolls back storage when the event belongs to another account', async () => {
    await enqueue();
    const job = await claim();
    await db.query('update conversations set account_id=$1', [other]);
    await expect(store(job)).rejects.toMatchObject({ code: '42501' });
    expect((await db.query('select * from messages')).rows).toEqual([]);
  });
  it('scrubs temporary completed payloads without deleting chat history or failed receipts', async () => {
    await enqueue();
    const job = await claim();
    await store(job);
    await db.query(
      "update whatsapp_webhook_events set state='done',finished_at=now()-interval '8 days' where id=$1",
      [job.id]
    );
    await enqueue('failed', 'other');
    await db.exec(
      "update whatsapp_webhook_events set state='failed' where event_key='failed'; select cleanup_whatsapp_webhooks()"
    );
    expect(
      (
        await db.query(
          'select payload from whatsapp_webhook_events where id=$1',
          [job.id]
        )
      ).rows
    ).toEqual([{ payload: null }]);
    expect(
      (await db.query('select count(*)::int as total from messages')).rows
    ).toEqual([{ total: 1 }]);
    expect(
      (
        await db.query(
          "select state from whatsapp_webhook_events where event_key='failed'"
        )
      ).rows
    ).toEqual([{ state: 'failed' }]);
  });
  it('blocks browser roles from reading payloads or claiming receipts', async () => {
    await enqueue();
    await db.exec('set role authenticated');
    await expect(
      db.query('select payload from whatsapp_webhook_events')
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.query('select * from claim_whatsapp_webhook()')
    ).rejects.toMatchObject({ code: '42501' });
    await db.exec('reset role; set role service_role');
    expect((await claim()).account_id).toBe(account);
  });
});
