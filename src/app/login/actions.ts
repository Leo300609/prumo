'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '../../db/index.ts';
import { decryptField } from '../../lib/crypto-field.ts';
import { env } from '../../lib/env.ts';
import { verifyPassword } from '../../lib/password.ts';
import { createSession } from '../../lib/session.ts';
import { verifyTotp } from '../../lib/totp.ts';

export type LoginState = { error: string | null };

const MAX_FAILS = 5;          // por IP
const WINDOW_MIN = 15;

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'local').trim();
  const sql = db();

  const [{ fails, global }] = await sql<{ fails: number; global: number }[]>`
    select count(*) filter (where ip = ${ip})::int as fails, count(*)::int as global
    from login_attempt where not ok and at > now() - make_interval(mins => ${WINDOW_MIN})`;
  // por IP e no total: trocar de IP não dá tentativas infinitas contra o único usuário
  if (fails >= MAX_FAILS || global >= MAX_FAILS * 4) return { error: `Muitas tentativas. Espere ${WINDOW_MIN} minutos.` };

  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const code = String(form.get('code') ?? '');

  const [user] = await sql<{ email: string; password_hash: string; totp_secret_enc: Uint8Array | null; totp_enabled: boolean }[]>`
    select email, password_hash, totp_secret_enc, totp_enabled from app_user where id = 1`;

  // sempre roda o scrypt, mesmo sem usuário, para não revelar pelo tempo se o e-mail existe
  const passOk = await verifyPassword(password, user?.password_hash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  const emailOk = !!user && user.email === email;
  const totpOk = !user?.totp_enabled
    || (!!user.totp_secret_enc && verifyTotp(decryptField(user.totp_secret_enc, env().FIELD_ENCRYPTION_KEY), code));

  const ok = passOk && emailOk && totpOk;
  await sql`insert into login_attempt (ip, ok) values (${ip}, ${ok})`;
  if (!ok) return { error: 'E-mail, senha ou código incorretos.' };

  await createSession(h.get('user-agent'));
  redirect('/');
}
