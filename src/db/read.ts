// Consultas de leitura das telas. As de negócio (DRE, resumo, projeção) estão em db/queries.
import { db } from './index.ts';

export type Category = { id: number; name: string; kind: string; icon: string | null; parent_name: string | null; parent_icon: string | null };
export type Account = {
  id: string; name: string; kind: string; institution: string | null; balance_cents: number;
  credit_limit_cents: number | null; available_limit_cents: number | null; bill_due_date: string | null;
  connection_id: string | null; balance_at: Date | null;
};
export type Connection = {
  id: string; item_id: string; connector_name: string | null; status: string; error_code: string | null;
  consent_expires_at: Date | null; last_synced_at: Date | null;
};
export type TxListRow = {
  id: string; date: string; amount_cents: number; description: string; status: string; kind: string;
  reviewed: boolean; installment_number: number | null; installment_total: number | null; is_transfer: boolean;
  account_name: string; account_kind: string; category_id: number | null; category_name: string | null;
  category_icon: string | null; parent_category_name: string | null;
};

export async function getCategories(): Promise<Category[]> {
  return db()<Category[]>`
    select c.id, c.name, c.kind, coalesce(c.icon, p.icon) as icon, p.name as parent_name, p.icon as parent_icon
    from category c left join category p on p.id = c.parent_id
    where c.parent_id is not null
       or not exists (select 1 from category k where k.parent_id = c.id) -- categoria sem grupo e sem filhos (ex.: Lazer, as que você cria)
    order by p.sort nulls last, c.sort, c.name`;
}

/** Categorias mais usadas para o sinal do valor — os atalhos da tela de revisão. */
export async function getTopCategories(sign: 1 | -1, limit = 8): Promise<Category[]> {
  return db()<Category[]>`
    select c.id, c.name, c.kind, coalesce(c.icon, p.icon) as icon, p.name as parent_name, p.icon as parent_icon
    from category c
    left join category p on p.id = c.parent_id
    left join lateral (
      select count(*) as n from transaction t
      where t.category_id = c.id and t.deleted_at is null and sign(t.amount_cents) = ${sign}
        and t.date > current_date - 120
    ) u on true
    where (c.parent_id is not null or not exists (select 1 from category k where k.parent_id = c.id))
      and (${sign} = 1 and c.kind in ('income','transfer','investment')
           or ${sign} = -1 and c.kind in ('expense','transfer','investment'))
    order by u.n desc, p.sort, c.sort
    limit ${limit}`;
}

export async function getAccounts(): Promise<Account[]> {
  return db()<Account[]>`
    select id, name, kind, institution, balance_cents, credit_limit_cents, available_limit_cents,
           to_char(bill_due_date, 'YYYY-MM-DD') as bill_due_date, connection_id, balance_at
    from account where not archived and not hidden
    order by case kind when 'checking' then 1 when 'savings' then 2 when 'wallet' then 3 when 'cash' then 4
                       when 'credit_card' then 5 else 6 end, sort, name`;
}

export async function getConnections(): Promise<Connection[]> {
  return db()<Connection[]>`
    select id, item_id, connector_name, status, error_code, consent_expires_at, last_synced_at
    from connection where status <> 'revoked' order by created_at`;
}

export async function getTransaction(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db()<(TxListRow & { source: string; note: string | null; transfer_pair_id: string | null;
    description_norm: string; account_id: string })[]>`
    select t.id, to_char(t.date, 'YYYY-MM-DD') as date, t.amount_cents, t.description, t.description_norm, t.status, t.kind,
           t.reviewed, t.installment_number, t.installment_total, t.transfer_pair_id is not null as is_transfer,
           t.transfer_pair_id, t.source, t.note, t.account_id,
           a.name as account_name, a.kind as account_kind,
           c.id as category_id, c.name as category_name, c.icon as category_icon, p.name as parent_category_name
    from transaction t join account a on a.id = t.account_id
    left join category c on c.id = t.category_id left join category p on p.id = c.parent_id
    where t.id = ${id} and t.deleted_at is null`;
  return row ?? null;
}
