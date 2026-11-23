import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
describe('flow last edit timestamp', () => {
  beforeAll(async () => {
    await db.exec(`
      create table flows (
        id uuid primary key default gen_random_uuid(), name text,
        description text, status text, trigger_type text, trigger_config jsonb,
        entry_node_id text, fallback_policy jsonb,
        execution_count integer default 0, last_executed_at timestamptz,
        updated_at timestamptz default now()
      );
      insert into flows(name) values ('Existing flow');
    `);
    await db.exec(
      readFileSync('supabase/migrations/086_flow_last_edited_at.sql', 'utf8')
    );
  });
  afterAll(() => db.close());

  it('does not fabricate an edit date for existing flows', async () => {
    expect((await db.query('select last_edited_at from flows')).rows).toEqual([
      { last_edited_at: null },
    ]);
  });

  it('records creation for new flows', async () => {
    expect(
      (
        await db.query(
          'insert into flows(name) values ($1) returning last_edited_at is not null as recorded',
          ['New flow']
        )
      ).rows
    ).toEqual([{ recorded: true }]);
  });

  it('records a save even when graph-only changes leave header fields unchanged', async () => {
    expect(
      (
        await db.query(
          "update flows set name = name where name = 'Existing flow' returning last_edited_at is not null as recorded"
        )
      ).rows
    ).toEqual([{ recorded: true }]);
  });

  it('does not change the edit date when executions update counters', async () => {
    await db.exec("update flows set last_edited_at = '2000-01-01T00:00:00Z'");
    expect(
      (
        await db.query(
          "update flows set execution_count = execution_count + 1, last_executed_at = now(), updated_at = now() returning last_edited_at = '2000-01-01T00:00:00Z'::timestamptz as preserved"
        )
      ).rows
    ).toEqual([{ preserved: true }, { preserved: true }]);
  });

  it('tracks activation and rolls back an unsuccessful edit with its timestamp', async () => {
    expect(
      (
        await db.query(
          "update flows set status = 'active' returning last_edited_at > '2000-01-01T00:00:00Z'::timestamptz as edited"
        )
      ).rows
    ).toEqual([{ edited: true }, { edited: true }]);
    const before = (
      await db.query('select last_edited_at from flows order by name')
    ).rows;
    await db.exec("begin; update flows set description = 'Changed'; rollback;");
    expect(
      (await db.query('select last_edited_at from flows order by name')).rows
    ).toEqual(before);
  });
});
