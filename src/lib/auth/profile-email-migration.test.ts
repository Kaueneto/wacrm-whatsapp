import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('synchronizes the confirmed email without exposing a pending change', async () => {
 const db=new PGlite();
 try {
 await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_change text); create table profiles(user_id uuid primary key,email text); insert into auth.users values('00000000-0000-0000-0000-000000000001','confirmed@example.com',null); insert into profiles values('00000000-0000-0000-0000-000000000001','old@example.com');");
 await db.exec(readFileSync('supabase/migrations/100_sync_profile_auth_email.sql','utf8'));
 expect((await db.query('select email from profiles')).rows).toEqual([{email:'confirmed@example.com'}]);
 await db.exec("update auth.users set email_change='pending@example.com';");
 expect((await db.query('select email from profiles')).rows).toEqual([{email:'confirmed@example.com'}]);
 await db.exec("update auth.users set email='pending@example.com';");
 expect((await db.query('select email from profiles')).rows).toEqual([{email:'pending@example.com'}]);
 } finally {await db.close();}
},30000);
