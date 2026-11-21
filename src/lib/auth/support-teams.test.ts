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
      create table accounts(id uuid primary key default gen_random_uuid(), name text, owner_user_id uuid);
      create table profiles(user_id uuid primary key references auth.users(id), account_id uuid references accounts(id), account_role account_role_enum, email text, full_name text);
      create table account_invitations(id uuid primary key);
      create table contacts(id uuid primary key, account_id uuid not null references accounts(id));
      create table conversations(id uuid primary key, account_id uuid not null references accounts(id), contact_id uuid references contacts(id), assigned_agent_id uuid, status text default 'open');
      create table messages(id uuid primary key, conversation_id uuid references conversations(id), media_url text);
      create table contact_notes(id uuid primary key, account_id uuid, contact_id uuid references contacts(id));
      create table campaigns(id uuid primary key, account_id uuid);
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
      'create trigger test_auth_created after insert on auth.users for each row when (NEW.email is not null) execute function handle_new_user()'
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec('reset role');
    await db.exec(`truncate accounts, auth.users, campaigns, storage.objects, quick_replies cascade;
      insert into accounts values ('${account}'),('${otherAccount}');
      insert into auth.users values ('${admin}'),('${supervisor}'),('${agent}'),('${colleague}'),('${outsider}');
      insert into profiles values ('${admin}','${account}','admin'),('${supervisor}','${account}','supervisor'),('${agent}','${account}','agent'),('${colleague}','${account}','agent'),('${outsider}','${otherAccount}','agent');
      insert into member_presence(user_id,account_id,status) values ('${agent}','${account}','online'),('${colleague}','${account}','online');
      insert into departments(id,account_id,name) values ('${id(20)}','${account}','Financeiro'),('${id(23)}','${otherAccount}','Outro');
      insert into teams(id,account_id,department_id,name) values ('${team}','${account}','${id(20)}','Equipe A'),('${otherTeam}','${account}','${id(20)}','Equipe B');
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

  it('provisions a login in the selected company and team and resolves its pending record', async () => {
    const email = 'new@example.test';
    const newUser = id(81);
    await db.query(
      "insert into pending_account_users(account_id, full_name, email, role, created_by) values ($1, 'Novo', $2, 'agent', $3)",
      [account, email, admin]
    );
    const provision = (creator: string, department: string) =>
      db.query('insert into auth.users values ($1, $2, $3::jsonb, $4::jsonb)', [
        newUser,
        email,
        JSON.stringify({ full_name: 'Novo' }),
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
  it('supervisors see their teams, including unassigned queues, and not other teams', async () => {
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
