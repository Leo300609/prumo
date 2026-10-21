// Sessão por cookie httpOnly com token aleatório; no banco fica só o SHA-256 do token.
// Roubar o banco não dá acesso às sessões, e "sair de todos os aparelhos" é um DELETE.
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '../db/index.ts';

export const SESSION_COOKIE = 'prumo_session';
const SESSION_DAYS = 30;

const sha256 = (s: string) => createHash('sha256').update(s).digest();

export async function createSession(userAgent: string | null): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db()`insert into session (token_hash, user_agent, expires_at)
             values (${sha256(token)}, ${userAgent?.slice(0, 300) ?? null}, ${expires})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function getSession(): Promise<{ id: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [row] = await db()<{ id: string; last_seen_at: Date }[]>`
    select id, last_seen_at from session where token_hash = ${sha256(token)} and expires_at > now()`;
  if (!row) return null;
  if (Date.now() - row.last_seen_at.getTime() > 3_600_000) {
    await db()`update session set last_seen_at = now() where id = ${row.id}`;
  }
  return { id: row.id };
}

/** Para Server Components e Server Actions: sem sessão, vai para o login. */
export async function requireSession(): Promise<{ id: string }> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

/** Para Route Handlers: devolve 401 em vez de redirecionar. */
export async function sessionOr401(): Promise<Response | null> {
  return (await getSession()) ? null : Response.json({ error: 'não autenticado' }, { status: 401 });
}

export async function destroySession(all = false): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (all) await db()`delete from session`;
  else if (token) await db()`delete from session where token_hash = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}
