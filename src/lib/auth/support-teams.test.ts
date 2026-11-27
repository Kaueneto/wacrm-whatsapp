import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const id = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const account = id(1),
  otherAccount = id(2),
  admin = id(10),
  supervisor = id(11),
  agent = id(12),
  colleague = id(13),
  outsider = id(14);
const team = id(21),
  otherTeam = id(22),
  conversation = id(31),
  otherConversation = id(32);

async function asUser(user: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user,
  ]);
  await db.exec('set role authenticated');
}
async function rows(sql: string) {
  return (await db.query(sql)).rows;
}

describe('support team authorization in PostgreSQL', () => {
  beforeAll(async () => {
    await db.exec(`
      create role authenticated; create role service_role bypassrls; create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
      create type account_role_enum as enum ('owner','admin','agent','viewer');
      create table accounts(id uuid primary key default gen_random_uuid(), name text, owner_user_id uuid, reply_target_minutes integer);
      create table profiles(user_id uuid primary key references auth.users(id), account_id uuid references accounts(id), account_role account_role_enum, email text, full_name text, avatar_url text);
      create table account_invitations(id uuid primary key);
      create table contacts(id uuid primary key, account_id uuid not null references accounts(id), name text, phone text, avatar_url text);
      create table conversations(id uuid primary key, account_id uuid not null references accounts(id), contact_id uuid references contacts(id), assigned_agent_id uuid, status text default 'open', created_at timestamptz default now(), last_inbound_at timestamptz, last_reply_at timestamptz, last_message_at timestamptz, closed_at timestamptz, last_message_text text, ai_autoreply_disabled boolean, ai_handoff_summary text);
      create table messages(id uuid primary key, conversation_id uuid references conversations(id), media_url text, sender_id uuid, sender_type text, ai_generated boolean default false, status text, created_at timestamptz default now(), content_text text, error_code integer, error_title text, content_type text, template_name text, message_id text);
      create table contact_notes(id uuid primary key, account_id uuid, contact_id uuid references contacts(id));
      create table campaigns(id uuid primary key, account_id uuid, name text);
      create table broadcasts(id uuid primary key, account_id uuid references accounts(id), campaign_id uuid references campaigns(id), parent_broadcast_id uuid references broadcasts(id), name text, status text, scheduled_at timestamptz, created_at timestamptz default now(), total_recipients integer default 0, delivered_count integer default 0, read_count integer default 0, replied_count integer default 0, failed_count integer default 0, template_name text, template_language text);
      create table broadcast_jobs(broadcast_id uuid primary key references broadcasts(id), account_id uuid references accounts(id), state text, phone_number_id text, template_snapshot jsonb);
      create table broadcast_recipients(id uuid primary key, broadcast_id uuid references broadcasts(id), contact_id uuid references contacts(id), status text, delivered_at timestamptz, read_at timestamptz, whatsapp_message_id text);
      create table broadcast_status_events(message_id text, status text, occurred_at timestamptz, primary key(message_id, status));
      create function control_broadcast_job(p_id uuid, p_account uuid, p_action text) returns boolean language sql as $$
        update public.broadcast_jobs set state = case when p_action = 'pause' then 'paused' else 'queued' end
        where broadcast_id = p_id and account_id = p_account returning true
      $$;
      revoke all on function control_broadcast_job(uuid, uuid, text) from public;
      create table quick_replies(id uuid primary key default gen_random_uuid(), account_id uuid);
      alter table quick_replies enable row level security;
      grant select,insert,update,delete on quick_replies to authenticated;
      create policy legacy on quick_replies for all to authenticated using (true) with check (true);
      create schema storage;
      create table storage.objects(name text primary key, bucket_id text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      create policy legacy on storage.objects for all to authenticated using (true) with check (true);
      create table member_presence(user_id uuid primary key references auth.users(id), account_id uuid, status text, last_seen_at timestamptz default now());
      grant select on profiles to authenticated;
      grant select, insert, update, delete on contacts, conversations, messages, contact_notes, campaigns to authenticated;
      alter table contacts enable row level security;
      alter table conversations enable row level security;
      alter table messages enable row level security;
      alter table contact_notes enable row level security;
      alter table campaigns enable row level security;
      create policy legacy on contacts for all to authenticated using (true) with check (true);
      create policy legacy on conversations for all to authenticated using (true) with check (true);
      create policy legacy on messages for all to authenticated using (true) with check (true);
      create policy legacy on contact_notes for all to authenticated using (true) with check (true);
      create policy legacy on campaigns for all to authenticated using (true) with check (true);
    `);
    await db.exec(
      readFileSync('supabase/migrations/065_supervisor_role.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/066_support_teams.sql', 'utf8')
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/067_support_automatic_routing.sql',
        'utf8'
      )
    );
    await db.exec(
      readFileSync('supabase/migrations/068_support_storage_scope.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/070_move_team_member.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/071_pending_users.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/072_active_account_users.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/073_defer_account_user_provision.sql', 'utf8')
    );
    await db.exec(`
      create function dashboard_overview(integer, text) returns jsonb
        language sql as $$ select jsonb_build_object('admin_data', true) $$;
    `);
    await db.exec(
      readFileSync('supabase/migrations/074_dashboard_admin_overview.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/075_department_support_scope.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/076_supervisor_dashboard.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/077_department_broadcasts.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/078_supervisor_dashboard_metrics.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/079_department_broadcast_cost_usage.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/080_broadcast_cost_breakdown.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/081_template_cost_breakdown.sql', 'utf8')
    );
    await db.exec(
      readFileSync('supabase/migrations/085_edit_account_member.sql', 'utf8')
    );
    await db.exec(`
      create table flow_nodes(node_type text constraint flow_nodes_node_type_check check (node_type in ('handoff','end','http_fetch')));
      insert into flow_nodes values ('http_fetch');
      create table ai_configs(account_id uuid references accounts(id) on delete cascade, is_active boolean, api_key text);
      alter table conversations add column if not exists ai_autoreply_disabled boolean default false, add column if not exists ai_reply_count integer default 0, add column if not exists ai_handoff_summary text;
    `);
    await db.exec(readFileSync('supabase/migrations/088_flow_ai_handoff.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/089_preserve_legacy_flow_node_types.sql', 'utf8'));
    await db.exec('create publication supabase_realtime');
    await db.exec(readFileSync('supabase/migrations/027_notifications.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/090_assignment_notification_context.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/091_preserve_ai_handoff_team_queue.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/104_team_self_service_queue.sql', 'utf8'));
    expect((await db.query('select node_type from flow_nodes')).rows).toEqual([{ node_type: 'http_fetch' }]);
  }, 30000);
  beforeEach(async () => {
    await db.exec('reset role');
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec(`truncate accounts, auth.users, campaigns, storage.objects, quick_replies, broadcast_status_events cascade;
      insert into accounts values ('${account}'),('${otherAccount}');
      alter table auth.users disable trigger on_auth_user_created;
      insert into auth.users values ('${admin}'),('${supervisor}'),('${agent}'),('${colleague}'),('${outsider}');
      alter table auth.users enable trigger on_auth_user_created;
      insert into profiles values ('${admin}','${account}','admin'),('${supervisor}','${account}','supervisor'),('${agent}','${account}','agent'),('${colleague}','${account}','agent'),('${outsider}','${otherAccount}','agent');
      insert into member_presence(user_id,account_id,status) values ('${agent}','${account}','online'),('${colleague}','${account}','online');
      insert into departments(id,account_id,name) values ('${id(20)}','${account}','Financeiro'),('${id(24)}','${account}','Comercial'),('${id(23)}','${otherAccount}','Outro');
      insert into teams(id,account_id,department_id,name) values ('${team}','${account}','${id(20)}','Equipe A'),('${otherTeam}','${account}','${id(24)}','Equipe B');
      insert into team_members(team_id,account_id,user_id) values ('${team}','${account}','${supervisor}'),('${team}','${account}','${agent}'),('${team}','${account}','${colleague}'),('${otherTeam}','${account}','${colleague}');
      insert into contacts values ('${id(41)}','${account}'),('${id(42)}','${account}');
      insert into conversations(id,account_id,contact_id,assigned_agent_id,team_id) values ('${conversation}','${account}','${id(41)}','${agent}','${team}'),('${otherConversation}','${account}','${id(42)}','${colleague}','${otherTeam}');
      insert into messages(id,conversation_id) values ('${id(51)}','${conversation}'),('${id(52)}','${otherConversation}');
      insert into contact_notes values ('${id(61)}','${account}','${id(41)}'),('${id(62)}','${account}','${id(42)}');
      insert into campaigns values ('${id(71)}','${account}');
    `);
  });
  afterAll(async () => {
    await db.close();
  });

  it('hands a flow to AI and then distributes to a human within the selected team exactly once', async () => {
    await db.exec(`update conversations set assigned_agent_id = null where id = '${conversation}'; insert into ai_configs values ('${account}', true, 'encrypted-key');`);
    await db.query('update contacts set name = $1 where id = $2', ['Cliente X', id(41)]);
    await db.query('delete from notifications where conversation_id = $1', [conversation]);
    const context = { kind: 'flow', handoff_mode: 'round_robin', note: 'Financeiro', instructions: 'Sem descontos.' };
    expect((await db.query('select start_flow_ai($1,$2,$3,$4::jsonb) as active', [account, conversation, team, JSON.stringify(context)])).rows).toEqual([{ active: true }]);
    expect(await rows(`select team_id, assigned_agent_id, ai_reply_count, ai_autoreply_disabled from conversations where id = '${conversation}'`)).toEqual([{ team_id: team, assigned_agent_id: null, ai_reply_count: 0, ai_autoreply_disabled: false }]);
    expect((await db.query('select finish_flow_ai($1,$2,$3) as transferred', [account, conversation, 'Cliente pede retirada de juros.\nFinanceiro'])).rows).toEqual([{ transferred: true }]);
    expect(await rows(`select team_id, ai_flow_context, ai_autoreply_disabled, status, assigned_agent_id is not null as assigned from conversations where id = '${conversation}'`)).toEqual([{ team_id: team, ai_flow_context: null, ai_autoreply_disabled: true, status: 'pending', assigned: true }]);
    expect((await db.query('select finish_flow_ai($1,$2,$3) as transferred', [account, conversation, 'duplicate'])).rows).toEqual([{ transferred: false }]);
    expect(await rows(`select ai_handoff_summary from conversations where id = '${conversation}'`)).toEqual([{ ai_handoff_summary: 'Cliente pede retirada de juros.\nFinanceiro' }]);
    expect((await db.query(
      'select user_id, assignment_origin, contact_name from notifications where conversation_id = $1',
      [conversation],
    )).rows).toEqual([{ user_id: agent, assignment_origin: 'ai', contact_name: 'Cliente X' }]);
  });

  it('records the AI origin only for the handoff, preserving subsequent assignments and the human owner', async () => {
    await db.query('update contacts set phone = $1 where id = $2', ['+5562999999999', id(41)]);
    await db.query('update profiles set full_name = $1 where user_id = $2', ['Supervisora', supervisor]);
    await db.query('update conversations set assigned_agent_id = null where id = $1', [conversation]);
    await db.query('delete from notifications where conversation_id = $1', [conversation]);

    await db.transaction(async (tx) => {
      await tx.query('select handoff_conversation_from_ai($1,$2,$3,$4)', [account, conversation, agent, 'Resumo']);
      await tx.query('select handoff_conversation_from_ai($1,$2,$3,$4)', [account, conversation, colleague, 'Resumo']);
      expect((await tx.query('select assigned_agent_id from conversations where id = $1', [conversation])).rows)
        .toEqual([{ assigned_agent_id: agent }]);
      await tx.query('update conversations set assigned_agent_id = $1 where id = $2', [colleague, conversation]);
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [supervisor]);
      await tx.query('update conversations set assigned_agent_id = $1 where id = $2', [agent, conversation]);
    });

    expect((await db.query(
      'select user_id, assignment_origin, contact_name, actor_name from notifications where conversation_id = $1',
      [conversation],
    )).rows).toEqual(expect.arrayContaining([
      { user_id: agent, assignment_origin: 'ai', contact_name: '+5562999999999', actor_name: null },
      { user_id: colleague, assignment_origin: null, contact_name: '+5562999999999', actor_name: null },
      { user_id: agent, assignment_origin: 'manual', contact_name: '+5562999999999', actor_name: 'Supervisora' },
    ]));
    expect((await db.query('select id from notifications where conversation_id = $1', [conversation])).rows)
      .toHaveLength(3);
  });

  it('keeps AI failures in the same team queue when nobody is online, and rejects foreign teams', async () => {
    await db.exec(`update conversations set assigned_agent_id = null where id = '${conversation}'; update member_presence set status = 'away';`);
    const context = JSON.stringify({ kind: 'flow', handoff_mode: 'round_robin' });
    await expect(db.query('select start_flow_ai($1,$2,$3,$4)', [otherAccount, conversation, team, context])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select start_flow_ai($1,$2,$3,$4)', [account, conversation, id(99), context])).rejects.toMatchObject({ code: '22023' });
    expect((await db.query('select start_flow_ai($1,$2,$3,$4) as active', [account, conversation, team, context])).rows).toEqual([{ active: false }]);
    await db.query('select finish_flow_ai($1,$2,$3)', [account, conversation, 'IA indisponível']);
    expect(await rows(`select assigned_agent_id, team_id, ai_autoreply_disabled from conversations where id = '${conversation}'`)).toEqual([{ assigned_agent_id: null, team_id: team, ai_autoreply_disabled: true }]);
  });

  it('keeps an account-wide AI handoff in the queue if the configured agent is outside the team', async () => {
    await db.query('update conversations set assigned_agent_id = null where id = $1', [otherConversation]);
    await db.query('delete from notifications where conversation_id = $1', [otherConversation]);
    await db.query('select handoff_conversation_from_ai($1,$2,$3,$4)', [account, otherConversation, agent, 'Resumo']);
    expect((await db.query(
      'select team_id, assigned_agent_id, ai_autoreply_disabled, ai_handoff_summary from conversations where id = $1',
      [otherConversation],
    )).rows).toEqual([{
      team_id: otherTeam, assigned_agent_id: null, ai_autoreply_disabled: true, ai_handoff_summary: 'Resumo',
    }]);
    expect((await db.query('select id from notifications where conversation_id = $1', [otherConversation])).rows)
      .toEqual([]);
  });

  it('protects human ownership and blocks clients from starting AI sessions or calling the service RPCs', async () => {
    const context = JSON.stringify({ kind: 'flow', handoff_mode: 'queue' });
    await expect(db.query('select start_flow_ai($1,$2,$3,$4)', [account, conversation, team, context])).rejects.toMatchObject({ code: '22023' });
    await asUser(admin);
    await expect(db.query('select start_flow_ai($1,$2,$3,$4)', [account, conversation, team, context])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select finish_flow_ai($1,$2,$3)', [account, conversation, 'test'])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select handoff_conversation_from_ai($1,$2,$3,$4)', [account, conversation, agent, 'test'])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('update conversations set ai_flow_context = $1 where id = $2', [context, conversation])).rejects.toMatchObject({ code: '42501' });
  });

  it('edits name, role and multiple teams together, returning removed-team conversations to the queue', async () => {
    await asUser(admin);
    await db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [agent, '  Novo nome  ', 'supervisor', [team, otherTeam]]);
    expect(await rows(`select full_name, account_role from profiles where user_id = '${agent}'`)).toEqual([{ full_name: 'Novo nome', account_role: 'supervisor' }]);
    expect(await rows(`select team_id from team_members where user_id = '${agent}' order by team_id`)).toEqual([{ team_id: team }, { team_id: otherTeam }]);
    await db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [agent, 'Novo nome', 'agent', [otherTeam]]);
    await db.exec('reset role');
    expect(await rows(`select assigned_agent_id from conversations where id = '${conversation}'`)).toEqual([{ assigned_agent_id: null }]);
    await asUser(admin);
    await db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [agent, 'Novo nome', 'agent', []]);
    expect(await rows(`select team_id from team_members where user_id = '${agent}'`)).toEqual([]);
  });

  it('rejects edits by supervisors, outsiders, invalid teams and owner promotion without partial updates', async () => {
    await asUser(supervisor);
    await expect(db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [agent, 'Changed', 'admin', []])).rejects.toMatchObject({ code: '42501' });
    await asUser(admin);
    await expect(db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [outsider, 'Changed', 'agent', []])).rejects.toMatchObject({ code: '42501' });
    await db.exec('reset role');
    await db.query('insert into teams(id, account_id, department_id, name) values ($1, $2, $3, $4)', [id(25), otherAccount, id(23), 'Externa']);
    await asUser(admin);
    await expect(db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [agent, 'Changed', 'admin', [id(25)]])).rejects.toMatchObject({ code: '22023' });
    await expect(db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [agent, 'Changed', 'owner', []])).rejects.toMatchObject({ code: '22023' });
    expect(await rows(`select full_name, account_role from profiles where user_id = '${agent}'`)).toEqual([{ full_name: null, account_role: 'agent' }]);
    expect(await rows(`select team_id from team_members where user_id = '${agent}'`)).toEqual([{ team_id: team }]);
  });

  it('allows editing self and owner details while preserving protected roles', async () => {
    await asUser(admin);
    await expect(db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [admin, 'Eu', 'agent', []])).rejects.toMatchObject({ code: '22023' });
    await db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [admin, 'Eu', 'admin', [team]]);
    await db.exec('reset role');
    await db.query('update profiles set account_role = $1 where user_id = $2', ['owner', colleague]);
    await asUser(admin);
    await expect(db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [colleague, 'Titular', 'admin', []])).rejects.toMatchObject({ code: '22023' });
    await db.query('select edit_account_member($1, $2, $3, $4::uuid[])', [colleague, 'Titular', 'owner', [team]]);
    expect(await rows(`select full_name, account_role from profiles where user_id = '${colleague}'`)).toEqual([{ full_name: 'Titular', account_role: 'owner' }]);
  });

  it('provisions a login in the selected company and team and resolves its pending record', async () => {
    const email = 'new@example.test';
    const newUser = id(81);
    await db.query(
      "insert into pending_account_users(account_id, full_name, email, role, created_by) values ($1, 'Novo', $2, 'agent', $3)",
      [account, email, admin]
    );
    const provision = (creator: string, department: string) => db.transaction(async (tx) => {
      await tx.query('insert into auth.users values ($1, $2, $3::jsonb)', [
        newUser,
        email,
        JSON.stringify({ full_name: 'Novo' }),
      ]);
      await tx.query('update auth.users set raw_app_meta_data = $2::jsonb where id = $1', [
        newUser,
        JSON.stringify({
          crm_provision: {
            account_id: account,
            creator_id: creator,
            role: 'agent',
            team_id: team,
            department_id: department,
          },
        }),
      ]);
    });
    await expect(provision(supervisor, id(20))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(provision(admin, id(23))).rejects.toMatchObject({
      code: '23514',
    });
    expect(
      (await db.query('select id from auth.users where id = $1', [newUser]))
        .rows
    ).toEqual([]);
    await provision(admin, id(20));
    expect(
      (
        await db.query(
          'select account_id, account_role from profiles where user_id = $1',
          [newUser]
        )
      ).rows
    ).toEqual([{ account_id: account, account_role: 'agent' }]);
    expect(
      (
        await db.query('select team_id from team_members where user_id = $1', [
          newUser,
        ])
      ).rows
    ).toEqual([{ team_id: team }]);
    expect(
      (
        await db.query(
          'select activated_user_id from pending_account_users where email = $1',
          [email]
        )
      ).rows
    ).toEqual([{ activated_user_id: newUser }]);
    expect(await rows('select id from accounts')).toHaveLength(2);
  });

  it('keeps the company-wide dashboard data restricted to administrators', async () => {
    await asUser(agent);
    await expect(rows("select dashboard_overview(7)")).rejects.toMatchObject({ code: '42501' });
    await asUser(supervisor);
    await expect(rows("select dashboard_overview(7)")).rejects.toMatchObject({ code: '42501' });
    await expect(rows("select dashboard_admin_overview_data(7, 'UTC')")).rejects.toMatchObject({ code: '42501' });
    await asUser(admin);
    expect(await rows("select dashboard_overview(7)")).toEqual([{ dashboard_overview: { admin_data: true } }]);
  });

  it('keeps standalone signup and ignores company roles in ordinary user metadata', async () => {
    const signup = id(82);
    await db.query('insert into auth.users values ($1, $2, $3::jsonb)', [
      signup,
      'standalone@example.test',
      JSON.stringify({ full_name: 'Standalone', crm_provision: { account_id: account, role: 'admin' } }),
    ]);
    expect((await db.query(
      `select p.account_role, a.owner_user_id
       from profiles p join accounts a on a.id = p.account_id
       where p.user_id = $1`,
      [signup]
    )).rows).toEqual([{ account_role: 'owner', owner_user_id: signup }]);
  });

  it('creates a pending user only as an admin and rejects duplicate email addresses', async () => {
    await db.query('update profiles set email = $1 where user_id = $2', [
      'Colleague@example.test',
      colleague,
    ]);
    const insert = (creator: string, email: string) =>
      db.query(
        "insert into pending_account_users(account_id, full_name, email, role, created_by) values ($1, 'Pessoa de Teste', $2, 'agent', $3) returning activated_at",
        [account, email, creator]
      );
    await asUser(supervisor);
    await expect(insert(supervisor, 'test@example.test')).rejects.toMatchObject(
      { code: '42501' }
    );
    await asUser(admin);
    await expect(insert(admin, 'colleague@example.test')).rejects.toMatchObject(
      { code: '23505' }
    );
    expect((await insert(admin, 'test@example.test')).rows).toEqual([
      { activated_at: null },
    ]);
    await expect(insert(admin, 'TEST@example.test')).rejects.toMatchObject({
      code: '23505',
    });
    await asUser(outsider);
    expect(await rows('select id from pending_account_users')).toEqual([]);
  });

  it('attendants can read only their conversations, contacts, notes and messages', async () => {
    await asUser(agent);
    expect(await rows('select id from conversations')).toEqual([
      { id: conversation },
    ]);
    expect(await rows('select id from contacts')).toEqual([{ id: id(41) }]);
    expect(await rows('select id from messages')).toEqual([{ id: id(51) }]);
    expect(await rows('select id from contact_notes')).toEqual([
      { id: id(61) },
    ]);
    expect(await rows('select id from campaigns')).toEqual([]);
  });
  it('supervisors see unassigned queues within their departments', async () => {
    await db.exec(
      `update conversations set assigned_agent_id = null where id = '${conversation}'`
    );
    await asUser(supervisor);
    expect(await rows('select id from conversations')).toEqual([
      { id: conversation },
    ]);
    expect(await rows('select id from teams')).toEqual([{ id: team }]);
    await expect(
      db.exec(
        `update conversations set team_id = '${otherTeam}' where id = '${conversation}'`
      )
    ).rejects.toThrow();
  });
  it('combines the teams of a supervisor across departments', async () => {
    await db.exec(`
      insert into team_members(team_id, account_id, user_id)
        values ('${otherTeam}', '${account}', '${supervisor}');
    `);
    await asUser(supervisor);
    expect(await rows('select id from conversations order by id')).toEqual([
      { id: conversation },
      { id: otherConversation },
    ]);
    await asUser(agent);
    expect(await rows('select id from conversations')).toEqual([
      { id: conversation },
    ]);
  });
  it('infers the team for a direct assignment and rejects ambiguous manual assignments', async () => {
    const unassigned = id(33);
    await db.exec(`insert into conversations (id, account_id) values ('${unassigned}', '${account}')`);
    await asUser(admin);
    await expect(rows(`update conversations set assigned_agent_id = '${colleague}' where id = '${unassigned}' returning team_id`))
      .rejects.toMatchObject({ code: '23514' });
    expect(await rows(`update conversations set assigned_agent_id = '${agent}' where id = '${unassigned}' returning team_id`))
      .toEqual([{ team_id: team }]);
    await asUser(supervisor);
    expect(await rows(`select id from conversations where id = '${unassigned}'`)).toEqual([{ id: unassigned }]);
  });

  it('shows all teams in the department and scopes the dashboard counts and queue', async () => {
    const siblingTeam = id(25);
    const queue = id(34);
    await db.exec(`
      insert into teams(id, account_id, department_id, name)
        values ('${siblingTeam}', '${account}', '${id(20)}', 'Equipe jurídica');
      insert into conversations(id, account_id, team_id, status, last_inbound_at)
        values ('${queue}', '${account}', '${siblingTeam}', 'pending', now());
    `);
    const sql = `select support_supervisor_overview('${account}') as overview`;
    await asUser(supervisor);
    expect(await rows('select id from conversations order by id')).toEqual([{ id: conversation }, { id: queue }]);
    expect(await rows(sql)).toMatchObject([{
      overview: {
        counts: { open: 1, pending: 1, closed: 0, waiting: 1, unassigned: 1 },
        teams: [{ id: team }, { id: siblingTeam, pending: 1 }],
        attention: [{ id: queue }, { id: conversation }],
      },
    }]);
    await asUser(agent);
    expect(await rows('select id from conversations')).toEqual([{ id: conversation }]);
    await expect(rows(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('isolates analytics and broadcast controls by department', async () => {
    const campaign = id(92), unrelated = id(93), companyWide = id(94);
    const run = id(95), unrelatedRun = id(96), companyWideRun = id(97);
    await db.exec(`
      update conversations set last_inbound_at = now() - interval '12 minutes' where id in ('${conversation}', '${otherConversation}');
      insert into messages(id, conversation_id, sender_type, sender_id, status, created_at) values
        ('${id(101)}', '${conversation}', 'customer', null, 'delivered', now() - interval '12 minutes'),
        ('${id(102)}', '${conversation}', 'agent', '${agent}', 'delivered', now() - interval '8 minutes'),
        ('${id(103)}', '${conversation}', 'agent', '${agent}', 'failed', now() - interval '7 minutes'),
        ('${id(104)}', '${otherConversation}', 'agent', '${colleague}', 'failed', now() - interval '6 minutes');
      insert into campaigns(id, account_id, department_id) values
        ('${campaign}', '${account}', '${id(20)}'),
        ('${unrelated}', '${account}', '${id(24)}'),
        ('${companyWide}', '${account}', null);
      insert into broadcasts(id, account_id, campaign_id, status, delivered_count, read_count) values
        ('${run}', '${account}', '${campaign}', 'sending', 5, 3),
        ('${unrelatedRun}', '${account}', '${unrelated}', 'sending', 99, 99),
        ('${companyWideRun}', '${account}', '${companyWide}', 'sending', 99, 99);
      insert into broadcast_jobs values ('${run}', '${account}', 'queued'),
        ('${unrelatedRun}', '${account}', 'paused'), ('${companyWideRun}', '${account}', 'paused');
    `);
    await expect(db.exec(`insert into broadcast_recipients values ('${id(98)}', '${run}', '${id(42)}')`))
      .rejects.toMatchObject({ code: '23514' });
    await db.exec(`insert into broadcast_recipients values ('${id(99)}', '${run}', '${id(41)}')`);
    await db.exec(`update campaigns set department_id = '${id(24)}' where id = '${campaign}'`);

    await asUser(supervisor);
    const metrics = 'select supervisor_dashboard_metrics(7) as overview';
    expect(await rows(metrics)).toMatchObject([{
      overview: {
        attention: { failed: 1, failedMessages: [{ conversationId: conversation }] },
        kpis: { newConversations: 1, broadcastDelivered: 5, broadcastRead: 3 },
        replies: { averageHuman: 4, team: expect.arrayContaining([
          expect.objectContaining({ userId: agent, memberships: [{ department: 'Financeiro', team: 'Equipe A' }] }),
        ]) },
        queues: [{ id: team }],
        broadcasts: [{ id: run, state: 'queued' }],
      },
    }]);
    expect(await rows(`select control_department_broadcast('${unrelatedRun}', 'resume') as allowed`)).toEqual([{ allowed: false }]);
    expect(await rows(`select control_department_broadcast('${companyWideRun}', 'resume') as allowed`)).toEqual([{ allowed: false }]);
    expect(await rows(`select control_department_broadcast('${run}', 'pause') as allowed`)).toEqual([{ allowed: true }]);
    expect(await rows(`select control_department_broadcast('${run}', 'resume') as allowed`)).toEqual([{ allowed: true }]);
    await asUser(agent);
    await expect(rows(metrics)).rejects.toMatchObject({ code: '42501' });
    expect(await rows(`select control_department_broadcast('${run}', 'pause') as allowed`)).toEqual([{ allowed: false }]);

    await db.exec('reset role');
    const retry = id(105);
    expect(await rows(`insert into broadcasts(id, account_id, campaign_id, parent_broadcast_id)
      values ('${retry}', '${account}', '${campaign}', '${run}') returning department_id`))
      .toEqual([{ department_id: id(20) }]);
    await db.exec(`update broadcast_recipients set contact_id = null where id = '${id(99)}'`);
  });

  it('counts only departmental campaign deliveries with delivery evidence in the requested period', async () => {
    const ownCampaign = id(110), otherCampaign = id(111);
    const ownRun = id(112), otherRun = id(113), companyRun = id(114);
    await db.exec(`
      insert into campaigns(id, account_id, department_id, name) values
        ('${ownCampaign}', '${account}', '${id(20)}', 'Cobrança mensal'),
        ('${otherCampaign}', '${account}', '${id(24)}', 'Comercial');
      insert into broadcasts(id, account_id, campaign_id) values
        ('${ownRun}', '${account}', '${ownCampaign}'),
        ('${otherRun}', '${account}', '${otherCampaign}'),
        ('${companyRun}', '${account}', null);
      insert into broadcast_jobs values
        ('${ownRun}', '${account}', 'completed', 'line', '{"category":"Marketing"}'),
        ('${otherRun}', '${account}', 'completed', 'line', '{"category":"Marketing"}'),
        ('${companyRun}', '${account}', 'completed', 'line', '{"category":"Marketing"}');
      insert into broadcast_recipients values
        ('${id(115)}', '${ownRun}', '${id(41)}', 'read', null, now() - interval '1 hour'),
        ('${id(116)}', '${ownRun}', '${id(41)}', 'delivered', now() - interval '2 hours', null),
        ('${id(117)}', '${ownRun}', '${id(41)}', 'failed', null, null),
        ('${id(118)}', '${ownRun}', '${id(41)}', 'delivered', now() - interval '2 days', null),
        ('${id(119)}', '${otherRun}', '${id(42)}', 'delivered', now() - interval '1 hour', null),
        ('${id(120)}', '${companyRun}', '${id(42)}', 'delivered', now() - interval '1 hour', null);
    `);
    const sql = "select * from department_broadcast_cost_usage(now() - interval '1 day', now())";
    const details = "select broadcast_cost_breakdown(now() - interval '1 day', now(), 'UTC') as breakdown";
    await asUser(supervisor);
    expect(await rows(sql)).toEqual([{ phone_number_id: 'line', category: 'MARKETING', delivered: 2 }]);
    const own = expect.objectContaining({
      campaign_id: ownCampaign, campaign_name: 'Cobrança mensal', department_name: 'Financeiro',
      category: 'MARKETING', phone_number_id: 'line',
    });
    const supervisorDetails = await db.query<{ breakdown: { delivered: number }[] }>(details);
    expect(supervisorDetails.rows[0].breakdown.length).toBeGreaterThan(0);
    for (const row of supervisorDetails.rows[0].breakdown) expect(row).toEqual(own);
    expect(supervisorDetails.rows[0].breakdown.reduce((sum, row) => sum + row.delivered, 0)).toBe(2);
    await asUser(admin);
    expect(await rows(details)).toEqual([{
      breakdown: expect.arrayContaining([
        own, expect.objectContaining({ campaign_id: otherCampaign }),
        expect.objectContaining({ campaign_id: null, department_id: null }),
      ]),
    }]);
    await asUser(agent);
    await expect(rows(sql)).rejects.toMatchObject({ code: '42501' });
    await expect(rows(details)).rejects.toMatchObject({ code: '42501' });
  });

  it('groups template delivery evidence and keeps original department attribution after transfer', async () => {
    const run = id(150);
    await db.exec(`
      insert into campaigns(id, account_id, department_id) values ('${id(151)}', '${account}', '${id(20)}');
      insert into broadcasts(id, account_id, campaign_id, template_name, template_language)
        values ('${run}', '${account}', '${id(151)}', 'retomar', 'pt_BR');
      insert into broadcast_recipients (id, broadcast_id, contact_id, status, delivered_at, whatsapp_message_id)
        values ('${id(152)}', '${run}', '${id(41)}', 'delivered', now() - interval '1 hour', 'wamid.duplicate');
      insert into messages (id, conversation_id, sender_type, status, content_type, template_name, message_id, template_cost_context)
        values ('${id(153)}', '${conversation}', 'agent', 'sent', 'template', 'retomar', 'wamid.inbox',
          '{"phone_number_id":"line","language":"pt_BR","category":"Utility"}'),
        ('${id(154)}', '${conversation}', 'bot', 'read', 'template', 'retomar', 'wamid.duplicate',
          '{"phone_number_id":"line","language":"pt_BR","category":"Utility"}'),
        ('${id(155)}', '${otherConversation}', 'agent', 'delivered', 'template', 'other', 'wamid.other',
          '{"phone_number_id":"line","language":"pt_BR","category":"Marketing"}');
      insert into broadcast_status_events values ('wamid.inbox', 'delivered', now() - interval '1 hour');
      update conversations set assigned_agent_id = null, team_id = '${otherTeam}' where id = '${conversation}';
    `);
    const sql = "select broadcast_cost_breakdown(now() - interval '1 day', now() + interval '1 second', 'UTC') as breakdown";
    await asUser(supervisor);
    expect(await rows(sql)).toEqual([{ breakdown: expect.arrayContaining([
      expect.objectContaining({ department_id: id(20), template_name: 'retomar', template_language: 'pt_BR', source: 'broadcast', delivered: 1 }),
      expect.objectContaining({ department_id: id(20), template_name: 'retomar', template_language: 'pt_BR', source: 'direct', delivered: 1, category: 'UTILITY' }),
    ]) }]);
    const { rows: [result] } = await db.query<{ breakdown: unknown[] }>(sql);
    expect(result.breakdown).toHaveLength(2);
  });
  it('attendants cannot reassign, self-promote routing or delete conversations', async () => {
    await asUser(agent);
    await expect(
      db.exec(
        `update conversations set assigned_agent_id = '${colleague}' where id = '${conversation}'`
      )
    ).rejects.toThrow();
    await expect(
      db.exec(
        `update conversations set team_id = null where id = '${conversation}'`
      )
    ).rejects.toThrow();
    await db.exec(`delete from conversations where id = '${conversation}'`);
    expect(await rows('select id from conversations')).toHaveLength(1);
    await db.exec(
      `update conversations set status = 'closed' where id = '${conversation}'`
    );
    expect(await rows('select status from conversations')).toEqual([
      { status: 'closed' },
    ]);
  });
  it('a supervisor can assign within the team and the previous attendant loses access', async () => {
    await asUser(supervisor);
    await db.exec(
      `update conversations set assigned_agent_id = '${colleague}' where id = '${conversation}'`
    );
    expect(
      await rows(
        'select agent_id, actor_user_id from conversation_assignment_events'
      )
    ).toEqual([{ agent_id: colleague, actor_user_id: supervisor }]);
    await asUser(agent);
    expect(await rows('select id from messages')).toEqual([]);
  });
  it('rejects cross-company members and department references', async () => {
    await asUser(admin);
    await expect(
      db.exec(
        `insert into team_members(team_id,account_id,user_id) values ('${team}','${account}','${outsider}')`
      )
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into teams(account_id,department_id,name) values ('${account}','${id(23)}','Invalid')`
      )
    ).rejects.toThrow();
  });
  it('returns removed members conversations to the team queue', async () => {
    await asUser(admin);
    await db.exec(
      `delete from team_members where team_id = '${team}' and user_id = '${agent}'`
    );
    expect(
      await rows(
        `select assigned_agent_id from conversations where id = '${conversation}'`
      )
    ).toEqual([{ assigned_agent_id: null }]);
    await asUser(agent);
    expect(await rows('select id from conversations')).toEqual([]);
  });
  it('cleans team memberships when a user moves company', async () => {
    await db.exec(
      `update profiles set account_id = '${otherAccount}' where user_id = '${agent}'`
    );
    expect(
      await rows(`select * from team_members where user_id = '${agent}'`)
    ).toEqual([]);
    expect(
      await rows(
        `select assigned_agent_id from conversations where id = '${conversation}'`
      )
    ).toEqual([{ assigned_agent_id: null }]);
  });
  it('administrators retain all company conversations and can supervise all teams', async () => {
    await asUser(admin);
    expect(await rows('select id from conversations')).toHaveLength(2);
    expect(await rows('select id from campaigns')).toHaveLength(1);
    await db.exec(
      `update conversations set team_id = '${otherTeam}', assigned_agent_id = '${colleague}' where id = '${conversation}'`
    );
  });
  it('rotates automatic assignments between online attendants of the selected team', async () => {
    await db.exec(`insert into contacts values ('${id(43)}','${account}'),('${id(44)}','${account}');
      insert into conversations(id,account_id,contact_id) values ('${id(33)}','${account}','${id(43)}'),('${id(34)}','${account}','${id(44)}');`);
    const route = async (contactId: string) =>
      (
        await db.query<{ agent: string }>(
          'select route_support_conversation($1,$2,$3,null,$4) as agent',
          [account, contactId, team, 'round_robin']
        )
      ).rows[0].agent;
    expect(await route(id(43))).toBe(agent);
    expect(await route(id(44))).toBe(colleague);
  });
  it('leaves the conversation in the team queue when everyone is away or offline', async () => {
    await db.exec("update member_presence set status = 'away'");
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [
      account,
      id(41),
      team,
      'round_robin',
    ]);
    expect(
      await rows(
        `select team_id, assigned_agent_id from conversations where id = '${conversation}'`
      )
    ).toEqual([{ team_id: team, assigned_agent_id: null }]);
    await asUser(agent);
    await expect(
      db.query('select route_support_conversation($1,$2,$3,$4,$5)', [
        account,
        id(41),
        team,
        agent,
        'specific',
      ])
    ).rejects.toThrow();
  });
  it('keeps an explicit queue under supervision even with one online attendant, while round robin assigns that attendant', async () => {
    await db.query('delete from team_members where team_id = $1 and user_id = $2', [team, colleague]);
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [account, id(41), team, 'queue']);
    expect(await rows(`select assigned_agent_id from conversations where id = '${conversation}'`)).toEqual([{ assigned_agent_id: null }]);
    await asUser(agent);
    expect(await rows(`select id from conversations where id = '${conversation}'`)).toEqual([]);
    await asUser(supervisor);
    expect(await rows(`select id from conversations where id = '${conversation}'`)).toEqual([{ id: conversation }]);
    await db.exec('reset role');
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [account, id(41), team, 'round_robin']);
    await asUser(agent);
    expect(await rows(`select id from conversations where id = '${conversation}' and assigned_agent_id = '${agent}'`)).toEqual([{ id: conversation }]);
  });
  it('does not list or delete another attendants attachments', async () => {
    const ownPath = `account-${account}/users/${agent}/photo.jpg`;
    const otherPath = `account-${account}/users/${colleague}/photo.jpg`;
    await db.query(
      "insert into storage.objects(name,bucket_id) values ($1,'chat-media'),($2,'chat-media')",
      [ownPath, otherPath]
    );
    await asUser(agent);
    expect(await rows('select name from storage.objects')).toEqual([
      { name: ownPath },
    ]);
    await db.query('delete from storage.objects where name = $1', [otherPath]);
    await db.exec('reset role');
    expect(await rows('select name from storage.objects')).toHaveLength(2);
    await db.query('update messages set media_url = $1 where id = $2', [
      `https://test.supabase.co/storage/v1/object/public/chat-media/${otherPath}`,
      id(51),
    ]);
    await asUser(agent);
    expect(await rows('select name from storage.objects')).toHaveLength(2);
  });
  it('moves a member atomically and returns their old conversations to the queue', async () => {
    await asUser(admin);
    await db.query('select move_support_team_member($1,$2,$3)', [
      agent,
      team,
      otherTeam,
    ]);
    expect(
      await rows(`select team_id from team_members where user_id = '${agent}'`)
    ).toEqual([{ team_id: otherTeam }]);
    expect(
      await rows(
        `select assigned_agent_id from conversations where id = '${conversation}'`
      )
    ).toEqual([{ assigned_agent_id: null }]);
  });
  it('rejects supervisor membership moves and preserves the source on invalid destination', async () => {
    await asUser(supervisor);
    await expect(
      db.query('select move_support_team_member($1,$2,$3)', [
        agent,
        team,
        otherTeam,
      ])
    ).rejects.toThrow();
    await asUser(admin);
    await expect(
      db.query('select move_support_team_member($1,$2,$3)', [
        agent,
        team,
        id(999),
      ])
    ).rejects.toThrow();
    expect(
      await rows(`select team_id from team_members where user_id = '${agent}'`)
    ).toEqual([{ team_id: team }]);
    expect(
      await rows(
        `select assigned_agent_id from conversations where id = '${conversation}'`
      )
    ).toEqual([{ assigned_agent_id: agent }]);
  });
  it('exposes a direct queue and its history only to the destination team', async () => {
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [account, id(41), team, 'team_queue']);
    await asUser(agent);
    expect(await rows(`select id from conversations where id = '${conversation}'`)).toEqual([{ id: conversation }]);
    expect(await rows(`select id from messages where conversation_id = '${conversation}'`)).toEqual([{ id: id(51) }]);
    await expect(db.query(`insert into messages(id,conversation_id) values ($1,$2)`, [id(91), conversation])).rejects.toThrow();
    await asUser(outsider);
    expect(await rows(`select id from conversations where id = '${conversation}'`)).toEqual([]);
    await expect(db.query('select claim_team_conversation($1)', [conversation])).rejects.toThrow();
  });

  it('reserves the direct queue for one attendant and removes it from colleagues', async () => {
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [account, id(41), team, 'team_queue']);
    await asUser(agent);
    await db.query('select claim_team_conversation($1)', [conversation]);
    expect(await rows(`select assigned_agent_id from conversations where id = '${conversation}'`)).toEqual([{ assigned_agent_id: agent }]);
    await db.query(`insert into messages(id,conversation_id) values ($1,$2)`, [id(91), conversation]);
    await asUser(colleague);
    expect(await rows(`select id from conversations where id = '${conversation}'`)).toEqual([]);
    await expect(db.query('select claim_team_conversation($1)', [conversation])).rejects.toThrow('já foi assumido');
    await db.exec('reset role');
    expect(await rows(`select assigned_agent_id from conversations where id = '${conversation}'`)).toEqual([{ assigned_agent_id: agent }]);
  });

  it('keeps supervisor assignment available for a direct queue', async () => {
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [account, id(41), team, 'team_queue']);
    await asUser(supervisor);
    await db.query(`update conversations set assigned_agent_id = $1 where id = $2`, [colleague, conversation]);
    expect(await rows(`select assigned_agent_id from conversations where id = '${conversation}'`)).toEqual([{ assigned_agent_id: colleague }]);
    await expect(db.query(`update conversations set team_queue_enabled = false where id = $1`, [conversation])).rejects.toThrow();
  });

  it('does not let attendants switch queue policy, assign directly, or claim another team', async () => {
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [account, id(41), team, 'team_queue']);
    await asUser(agent);
    await expect(db.query(`update conversations set assigned_agent_id = $1 where id = $2`, [agent, conversation])).rejects.toThrow();
    await expect(db.query(`update conversations set team_queue_enabled = false where id = $1`, [conversation])).rejects.toThrow();
    await db.query(`delete from conversations where id = $1`, [conversation]);
    expect(await rows(`select id from conversations where id = '${conversation}'`)).toEqual([{ id: conversation }]);
    await db.exec('reset role');
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [account, id(42), otherTeam, 'team_queue']);
    await asUser(agent);
    await expect(db.query('select claim_team_conversation($1)', [otherConversation])).rejects.toThrow();
  });

  it('restores supervised visibility when the flow routes back to the supervised queue', async () => {
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [account, id(41), team, 'team_queue']);
    await db.query('select route_support_conversation($1,$2,$3,null,$4)', [account, id(41), team, 'queue']);
    await asUser(agent);
    expect(await rows(`select id from conversations where id = '${conversation}'`)).toEqual([]);
  });

  it('can move to a team the user already belongs to without duplicating membership', async () => {
    await asUser(admin);
    await db.query('select move_support_team_member($1,$2,$3)', [
      colleague,
      team,
      otherTeam,
    ]);
    expect(
      await rows(
        `select team_id from team_members where user_id = '${colleague}'`
      )
    ).toEqual([{ team_id: otherTeam }]);
  });
});
