// Implementação Postgres das portas usadas pelo sync e pelo webhook.
import type { SyncStore, WebhookSink } from '../pluggy/store.ts';
import { db, json, q } from './index.ts';

export const pgSyncStore: SyncStore = {
  async ensureConnection(itemId) {
    const sql = db();
    const [row] = await sql<{ id: string; item_id: string; status: string; last_synced_at: Date | null }[]>`
      insert into connection (provider, item_id) values ('pluggy', ${itemId})
      on conflict (item_id) do update set item_id = excluded.item_id
      returning id, item_id, status, last_synced_at`;
    return { id: row.id, itemId: row.item_id, status: row.status as never, lastSyncedAt: row.last_synced_at };
  },

  async setConnectionHealth(id, h) {
    await db()`
      update connection set status = ${h.status}, error_code = ${h.errorCode},
             consent_expires_at = ${h.consentExpiresAt}, connector_name = coalesce(${h.connectorName}, connector_name)
      where id = ${id}`;
  },

  async markSynced(id, at) {
    await db()`update connection set last_synced_at = ${at} where id = ${id}`;
  },

  async upsertAccounts(connectionId, rows) {
    if (rows.length === 0) return [];
    return q('upsert_accounts', [json(rows), connectionId]);
  },

  async findAccountByProviderId(providerAccountId) {
    const [row] = await db()<{ id: string; provider_account_id: string; kind: 'checking' | 'savings' | 'credit_card' }[]>`
      select id, provider_account_id, kind from account where provider_account_id = ${providerAccountId}`;
    return row ?? null;
  },

  async upsertTransactions(rows) {
    let n = 0;
    for (let i = 0; i < rows.length; i += 500) {
      n += (await q('upsert_transactions', [json(rows.slice(i, i + 500))])).length;
    }
    return n;
  },

  async deleteTransactions(ids) {
    return ids.length ? (await q('delete_transactions', [json(ids)])).length : 0;
  },

  upsertInvestments: (connectionId, rows) => q('upsert_investments', [json(rows), connectionId]),
  async upsertInvestmentFlows(rows) { if (rows.length) await q('upsert_investment_flows', [json(rows)]); },
  async snapshotInvestments(date) { await q('snapshot_investments', [date]); },

  async postProcess(sinceDate) {
    await q('categorize', [sinceDate]);
    await q('pair_transfers', [sinceDate]);
  },

  async startLog(connectionId, trigger) {
    const [row] = await db()<{ id: number }[]>`
      insert into sync_log (connection_id, trigger) values (${connectionId}, ${trigger}) returning id`;
    return row.id;
  },

  async finishLog(id, result, txUpserted, error) {
    await db()`update sync_log set finished_at = now(), result = ${result}, tx_upserted = ${txUpserted},
               error = ${error ?? null} where id = ${id}`;
  },
};

export const pgWebhookSink: WebhookSink = {
  async accept(e, job) {
    return db().begin(async (tx) => {
      const rows = await tx`
        insert into webhook_event (event_id, event, item_id, payload, processed_at)
        values (${e.eventId}, ${e.event}, ${e.itemId}, ${json(e.payload)}::jsonb, now())
        on conflict (event_id) do nothing
        returning id`;
      if (rows.length === 0) return 'duplicate' as const;
      if (job) {
        await tx`insert into job (kind, payload, dedupe_key) values (${job.kind}, ${json(job.payload)}::jsonb, ${job.dedupe})
                 on conflict (dedupe_key) where done_at is null do nothing`;
      }
      return 'new' as const;
    });
  },
};

export async function enqueue(kind: string, payload: unknown = {}, dedupeKey: string | null = null, runAt: Date | null = null) {
  await q('job_enqueue', [kind, json(payload), runAt, dedupeKey]);
}
