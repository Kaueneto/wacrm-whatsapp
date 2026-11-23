import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    create table ai_configs (provider text constraint ai_configs_provider_check check (provider in ('openai', 'anthropic', 'openai_compatible')));
    create table ai_usage_log (provider text constraint ai_usage_log_provider_check check (provider in ('openai', 'anthropic', 'openai_compatible')));
    insert into ai_configs values ('openai'), ('anthropic'), ('openai_compatible');
  `);
  await db.exec(readFileSync('supabase/migrations/087_ai_gemini.sql', 'utf8'));
});
afterAll(() => db.close());
it('allows Gemini configuration and usage while preserving existing providers', async () => {
  await db.exec(
    "insert into ai_configs values ('gemini'); insert into ai_usage_log values ('gemini')"
  );
  expect(
    (await db.query('select provider from ai_configs order by provider')).rows
  ).toEqual([
    { provider: 'anthropic' },
    { provider: 'gemini' },
    { provider: 'openai' },
    { provider: 'openai_compatible' },
  ]);
  expect((await db.query('select provider from ai_usage_log')).rows).toEqual([
    { provider: 'gemini' },
  ]);
  await expect(
    db.exec("insert into ai_configs values ('unknown')")
  ).rejects.toMatchObject({ code: '23514' });
});
