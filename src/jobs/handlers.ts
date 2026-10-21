// O que cada job faz. A fila garante retentativa com backoff se algo aqui lançar erro.
import { db, json, q } from '../db/index.ts';
import { enqueue, pgSyncStore } from '../db/store.ts';
import { env } from '../lib/env.ts';
import { addDays, localDate } from '../lib/time.ts';
import { createPluggyClient, PluggyError, type PluggyClient } from '../pluggy/client.ts';
import { itemHealth } from '../pluggy/mapping.ts';
import { syncCreatedTransactions, syncItem, syncTransactionIds } from '../pluggy/sync.ts';
import type { Handler, Schedule } from './worker.ts';

let client: PluggyClient | null = null;
export function pluggy(): PluggyClient {
  client ??= createPluggyClient({ clientId: env().PLUGGY_CLIENT_ID, clientSecret: env().PLUGGY_CLIENT_SECRET });
  return client;
}

const deps = () => ({ pluggy: pluggy(), store: pgSyncStore });

export const handlers: Record<string, Handler> = {
  async sync_item(p) {
    await syncItem(String(p.itemId), String(p.trigger ?? 'webhook'), deps());
  },

  async refresh_item(p) {
    // item/error, item/waiting_*: só atualiza o estado mostrado na tela de contas
    const itemId = String(p.itemId);
    const conn = await pgSyncStore.ensureConnection(itemId);
    const item = await pluggy().getItem(itemId);
    const h = itemHealth(item);
    await pgSyncStore.setConnectionHealth(conn.id, {
      status: h.status, errorCode: h.errorCode,
      consentExpiresAt: item.consentExpiresAt ?? null, connectorName: item.connector?.name ?? null,
    });
  },

  async item_deleted(p) {
    // o item sumiu na Pluggy (revogado, ou conector descontinuado). Os dados locais ficam.
    await db()`update connection set status = 'revoked' where item_id = ${String(p.itemId)}`;
  },

  async tx_created(p) {
    await syncCreatedTransactions(String(p.accountId), String(p.createdAtFrom), deps());
  },

  async tx_updated(p) {
    await syncTransactionIds(String(p.accountId), (p.ids as string[]) ?? [], deps());
  },

  async tx_deleted(p) {
    await pgSyncStore.deleteTransactions((p.ids as string[]) ?? []);
  },

  async sync_all() {
    // rede de segurança diária, caso algum webhook tenha se perdido (a Pluggy tenta só 3 vezes)
    const rows = await db()<{ item_id: string }[]>`select item_id from connection where status <> 'revoked'`;
    for (const r of rows) {
      await enqueue('sync_item', { itemId: r.item_id, trigger: 'daily' }, `sync_item:${r.item_id}`);
    }
  },

  async fetch_index_rates() {
    // SGS/Banco Central: 12 = CDI diário (% a.d.), 433 = IPCA mensal (%)
    const end = localDate();
    const start = addDays(end, -40);
    const br = (iso: string) => iso.split('-').reverse().join('/');
    const series: [string, number][] = [['CDI', 12], ['IPCA', 433]];
    for (const [index, code] of series) {
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${br(start)}&dataFinal=${br(end)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`SGS ${code}: HTTP ${res.status}`);
      const data = (await res.json()) as { data: string; valor: string }[];
      const rows = data.map((d) => ({
        index, date: d.data.split('/').reverse().join('-'), value: Number(d.valor) / 100,
      })).filter((r) => Number.isFinite(r.value));
      if (rows.length) await q('upsert_index_rates', [json(rows)]);
    }
  },

  async cleanup() {
    const sql = db();
    await sql`delete from session where expires_at < now()`;
    await sql`delete from login_attempt where at < now() - interval '30 days'`;
    await sql`delete from job where done_at < now() - interval '30 days'`;
    await sql`delete from webhook_event where received_at < now() - interval '90 days'`;
  },
};

export const schedules: Schedule[] = [
  { name: 'daily_sync',    hour: 7,  minute: 31, kind: 'sync_all' },          // depois do refresh diário do Meu Pluggy
  { name: 'index_rates',   hour: 9,  minute: 17, kind: 'fetch_index_rates' }, // BCB publica o CDI do dia anterior cedo
  { name: 'cleanup',       hour: 3,  minute: 43, kind: 'cleanup' },
];

export { PluggyError };
