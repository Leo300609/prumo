'use server';

// Mutações disparadas pelas telas. Toda action confere a sessão antes de mexer no banco.
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, q } from '../../db/index.ts';
import { enqueue } from '../../db/store.ts';
import { parseBRL } from '../../lib/money.ts';
import { destroySession, requireSession } from '../../lib/session.ts';
import { localDate } from '../../lib/time.ts';

const refresh = () => revalidatePath('/', 'layout');
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Classifica um lançamento. Com `learn`, cria uma regra para os parecidos e aplica nos pendentes. */
export async function categorize(txId: string, categoryId: number, learn: boolean, next?: string) {
  await requireSession();
  const sql = db();
  const [tx] = await sql<{ description_norm: string; amount_cents: number }[]>`
    update transaction t set category_id = ${categoryId}, categorized_by = 'user', reviewed = true,
      kind = case when t.transfer_pair_id is not null then 'transfer'
                  else (select case c.kind when 'income' then 'income' when 'transfer' then 'transfer'
                                           when 'investment' then 'investment' else 'expense' end
                        from category c where c.id = ${categoryId}) end
    where t.id = ${txId}
    returning t.description_norm, t.amount_cents`;
  if (tx && learn) {
    const words = tx.description_norm.split(' ').filter(Boolean).slice(0, 3);
    if (words.length) {
      await sql`insert into rule (priority, pattern, direction, category_id, is_system)
                values (50, ${'^' + escapeRegex(words.join(' '))}, ${tx.amount_cents > 0 ? 'in' : 'out'}, ${categoryId}, false)`;
      await q('categorize', ['2000-01-01']);
    }
  }
  refresh();
  if (next) redirect(next);
}

/** Versão para formulários: lê a caixa "classificar os parecidos assim" do próprio form. */
export async function categorizeFromForm(txId: string, categoryId: number, next: string | null, form: FormData) {
  await categorize(txId, categoryId, form.get('learn') === 'on', next ?? undefined);
}

export async function toggleReviewed(txId: string) {
  await requireSession();
  await db()`update transaction set reviewed = not reviewed where id = ${txId}`;
  refresh();
}

/**
 * Cria uma categoria (opcionalmente dentro de um grupo existente) e já a aplica a este lançamento.
 * Sem grupo, o tipo vem do sinal do valor: entrada vira receita, saída vira despesa variável.
 * Com grupo, herda tipo, grupo do DRE e ícone dele. Repetir um nome existente reaproveita a categoria.
 */
export async function createCategory(txId: string, form: FormData) {
  await requireSession();
  const name = String(form.get('name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) return;
  const parentId = Number(form.get('parent')) || null;
  const sql = db();
  const [tx] = await sql<{ amount_cents: number }[]>`select amount_cents from transaction where id = ${txId}`;
  if (!tx) return;
  const [parent] = parentId
    ? await sql<{ kind: string; dre_group: string; icon: string | null }[]>`
        select kind, dre_group, icon from category where id = ${parentId} and parent_id is null`
    : [];
  if (parentId && !parent) return; // grupo inexistente ou que não é de nível raiz
  const income = tx.amount_cents > 0;
  const [cat] = await sql<{ id: number }[]>`
    insert into category (parent_id, name, kind, dre_group, icon, sort)
    values (${parentId}, ${name}, ${parent?.kind ?? (income ? 'income' : 'expense')},
            ${parent?.dre_group ?? (income ? 'revenue' : 'variable_cost')}, ${parent?.icon ?? null}, 100)
    on conflict (parent_id, name) do update set name = excluded.name
    returning id`;
  await categorize(txId, cat.id, form.get('learn') === 'on');
}

export async function saveNote(txId: string, form: FormData) {
  await requireSession();
  const note = String(form.get('note') ?? '').trim().slice(0, 500) || null;
  await db()`update transaction set note = ${note} where id = ${txId}`;
  refresh();
}

/** Desfaz um pareamento automático errado: as duas pontas voltam a ser receita/despesa. */
export async function unpairTransfer(txId: string) {
  await requireSession();
  await db()`
    update transaction set transfer_pair_id = null, category_id = null, categorized_by = 'user',
           kind = case when amount_cents > 0 then 'income' else 'expense' end
    where id = ${txId} or transfer_pair_id = ${txId}`;
  refresh();
}

export async function mergeManual(manualId: string, bankId: string) {
  await requireSession();
  await q('merge_manual', [manualId, bankId]);
  refresh();
}

export async function deleteManual(txId: string) {
  await requireSession();
  await db()`update transaction set deleted_at = now() where id = ${txId} and source = 'manual'`;
  refresh();
  redirect('/lancamentos');
}

export type AddState = { error: string | null };

export async function addTransaction(_prev: AddState, form: FormData): Promise<AddState> {
  await requireSession();
  let cents: number;
  try { cents = Math.abs(parseBRL(String(form.get('amount') ?? ''))); } catch { return { error: 'Valor inválido.' }; }
  if (cents === 0) return { error: 'Informe um valor.' };
  const direction = form.get('direction') === 'in' ? 1 : -1;
  const accountId = String(form.get('accountId') ?? '');
  const categoryId = Number(form.get('categoryId')) || null;
  const description = String(form.get('description') ?? '').trim().slice(0, 140) || (direction > 0 ? 'Entrada' : 'Gasto');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('date'))) ? String(form.get('date')) : localDate();

  const [account] = await db()`select 1 from account where id = ${accountId} and not archived`;
  if (!account) return { error: 'Escolha uma conta.' };

  await db()`
    insert into transaction (account_id, source, kind, date, amount_cents, description, category_id, categorized_by, reviewed)
    select ${accountId}, 'manual',
           coalesce((select case kind when 'income' then 'income' when 'transfer' then 'transfer'
                                      when 'investment' then 'investment' else 'expense' end
                     from category where id = ${categoryId}),
                    case when ${direction} > 0 then 'income' else 'expense' end),
           ${date}, ${direction * cents}, ${description}, ${categoryId},
           case when ${categoryId}::int is null then 'none' else 'user' end, true`;
  // conta manual (dinheiro, Revolut…): o saldo acompanha os lançamentos
  await db()`update account set balance_cents = balance_cents + ${direction * cents}
             where id = ${accountId} and connection_id is null`;
  refresh();
  redirect('/inicio');
}

/** Apelido e grupo de um investimento (ex.: "Reserva de emergência" no grupo "Nubank"). Vazio limpa. */
export async function updateInvestment(id: string, form: FormData) {
  await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const clean = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max) || null;
  await db()`update investment set nickname = ${clean('nickname', 60)}, group_label = ${clean('group', 40)} where id = ${id}`;
  revalidatePath('/investimentos');
}

export async function createManualAccount(form: FormData) {
  await requireSession();
  const name = String(form.get('name') ?? '').trim().slice(0, 60);
  const kind = ['cash', 'wallet', 'checking', 'savings', 'credit_card'].includes(String(form.get('kind')))
    ? String(form.get('kind')) : 'cash';
  let balance = 0;
  try { balance = form.get('balance') ? parseBRL(String(form.get('balance'))) : 0; } catch { /* mantém 0 */ }
  if (!name) return;
  await db()`insert into account (kind, name, balance_cents, currency) values (${kind}, ${name}, ${balance}, 'BRL')`;
  refresh();
}

export async function syncNow() {
  await requireSession();
  const rows = await db()<{ item_id: string }[]>`select item_id from connection where status <> 'revoked'`;
  for (const r of rows) await enqueue('sync_item', { itemId: r.item_id, trigger: 'user' }, `sync_item:${r.item_id}`);
  refresh();
}

export async function setTheme(theme: 'system' | 'light' | 'dark') {
  await requireSession();
  const jar = await cookies();
  if (theme === 'system') jar.delete('prumo_theme');
  else jar.set('prumo_theme', theme, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  refresh();
}

export async function togglePrivacy() {
  await requireSession();
  const jar = await cookies();
  const on = jar.get('prumo_privacy')?.value === '1';
  jar.set('prumo_privacy', on ? '0' : '1', { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
  refresh();
}

export async function logout(all = false) {
  await destroySession(all);
  redirect('/login');
}
