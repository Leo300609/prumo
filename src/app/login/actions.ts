'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '../../db/index.ts';
import { decryptField } from '../../lib/crypto-field.ts';
import { env } from '../../lib/env.ts';
import { verifyPassword } from '../../lib/password.ts';
import { createSession } from '../../lib/session.ts';
import { clientIp, MAX_FAILS, softDelayMs, WINDOW_MIN } from '../../lib/login-guard.ts';
import { matchTotp } from '../../lib/totp.ts';

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = clientIp(h);
  const sql = db();

  // registra a tentativa ANTES de contar: tentativas simultâneas não passam todas pelo limite
  const [{ id: attemptId }] = await sql<{ id: number }[]>`insert into login_attempt (ip, ok) values (${ip}, false) returning id`;
  const [{ fails, global }] = await sql<{ fails: number; global: number }[]>`
    select count(*) filter (where ip = ${ip})::int as fails, count(*)::int as global
    from login_attempt where not ok and at > now() - make_interval(mins => ${WINDOW_MIN})`;
  if (fails > MAX_FAILS) {
    await sql`delete from login_attempt where id = ${attemptId}`; // insistir não prolonga o bloqueio
    return { error: `Muitas tentativas. Espere ${WINDOW_MIN} minutos.` };
  }
  // vários IPs falhando: só atrasa, nunca bloqueia (senão qualquer um tranca o dono para fora)
  const delay = softDelayMs(global);
  if (delay) await new Promise((r) => setTimeout(r, delay));

  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const code = String(form.get('code') ?? '');

  const [user] = await sql<{ email: string; password_hash: string; totp_secret_enc: Uint8Array | null; totp_enabled: boolean }[]>`
    select email, password_hash, totp_secret_enc, totp_enabled from app_user where id = 1`;

  // sempre roda o scrypt, mesmo sem usuário, para não revelar pelo tempo se o e-mail existe
  const passOk = await verifyPassword(password, user?.password_hash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  const emailOk = !!user && user.email === email;
  if (passOk && emailOk) {
    // limite por conta, qualquer que seja o IP: só quem já sabe a senha chega aqui, então não serve para trancar o dono de fora
    await sql`update login_attempt set pw_ok = true where id = ${attemptId}`;
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from login_attempt
      where pw_ok and not ok and at > now() - make_interval(mins => ${WINDOW_MIN})`;
    if (n > MAX_FAILS) {
      await sql`delete from login_attempt where id = ${attemptId}`;
      return { error: `Muitas tentativas. Espere ${WINDOW_MIN} minutos.` };
    }
  }
  const counter = user?.totp_enabled && user.totp_secret_enc
    ? matchTotp(decryptField(user.totp_secret_enc, env().FIELD_ENCRYPTION_KEY), code) : null;
  let ok = passOk && emailOk && (!user?.totp_enabled || counter !== null);

  // um código só vale uma vez: grava o passo usado e recusa o mesmo passo (ou anterior) depois
  if (ok && counter !== null) {
    const used = await sql`
      update app_user set totp_last_counter = ${counter}
      where id = 1 and (totp_last_counter is null or totp_last_counter < ${counter}) returning id`;
    ok = used.length === 1;
  }

  if (!ok) return { error: 'E-mail, senha ou código incorretos.' };
  await sql`update login_attempt set ok = true where id = ${attemptId}`;

  await createSession(h.get('user-agent'));
  redirect('/');
}
