// Sincronização de um item da Pluggy para o banco local. Idempotente: rodar duas vezes
// seguidas não muda nada. Chamado pelo worker a partir de webhooks e do agendamento diário.
import { addDays, localDate } from '../lib/time.ts';
import type { PluggyClient } from './client.ts';
import { PluggyError } from './client.ts';
import { itemHealth, mapAccount, mapInvestment, mapInvestmentFlow, mapTransaction, type TransactionRow } from './mapping.ts';
import type { SyncStore } from './store.ts';

export type SyncDeps = { pluggy: PluggyClient; store: SyncStore; now?: () => Date };

export type SyncResult =
  | { result: 'success'; accounts: number; transactions: number }
  | { result: 'skipped'; reason: string };

const FIRST_SYNC_DAYS = 400;  // a Pluggy guarda até ~12 meses
const OVERLAP_DAYS = 7;       // a Pluggy remescla os últimos 4 dias; 7 dá folga

export async function syncItem(itemId: string, trigger: string, deps: SyncDeps): Promise<SyncResult> {
  const now = deps.now?.() ?? new Date();
  const { pluggy, store } = deps;
  const conn = await store.ensureConnection(itemId);
  const logId = await store.startLog(conn.id, trigger);
  let upserted = 0;

  try {
    const item = await pluggy.getItem(itemId);
    const health = itemHealth(item, now);
    await store.setConnectionHealth(conn.id, {
      status: health.status, errorCode: health.errorCode,
      consentExpiresAt: item.consentExpiresAt ?? null, connectorName: item.connector?.name ?? null,
    });

    if (!health.canRead) {
      // Autorização vencida/revogada: a API devolveria listas vazias. Não lemos nada
      // para não confundir "vazio" com "apagado" — os dados locais ficam intactos.
      await store.finishLog(logId, 'skipped', 0, health.errorCode ?? 'cannot_read');
      return { result: 'skipped', reason: health.errorCode ?? 'cannot_read' };
    }

    const accounts = await pluggy.listAccounts(itemId);
    if (accounts.length === 0) {
      await store.finishLog(logId, 'skipped', 0, 'no_accounts');
      return { result: 'skipped', reason: 'no_accounts' };
    }

    const local = await store.upsertAccounts(conn.id, accounts.map((a) => mapAccount(a, item.connector?.name ?? null)));
    const byProvider = new Map(local.map((a) => [a.provider_account_id, a]));

    const today = localDate(now);
    const since = conn.lastSyncedAt
      ? addDays(localDate(conn.lastSyncedAt), -OVERLAP_DAYS)
      : addDays(today, -FIRST_SYNC_DAYS);

    for (const acc of accounts) {
      const target = byProvider.get(acc.id);
      if (!target) continue;
      for await (const page of pluggy.transactionPages({ accountId: acc.id, dateFrom: since })) {
        const rows = page.map((t) => mapTransaction(t, target.id, target.kind)).filter((r): r is TransactionRow => r !== null);
        upserted += await store.upsertTransactions(rows);
      }
    }

    await syncInvestments(itemId, conn.id, since, deps);
    await store.postProcess(addDays(since, -3));
    await store.snapshotInvestments(today);
    await store.markSynced(conn.id, now);
    await store.finishLog(logId, 'success', upserted);
    return { result: 'success', accounts: local.length, transactions: upserted };
  } catch (err) {
    await store.finishLog(logId, 'failed', upserted, err instanceof Error ? err.message : String(err));
    throw err; // o worker reagenda com backoff
  }
}

async function syncInvestments(itemId: string, connectionId: string, since: string, { pluggy, store }: SyncDeps) {
  let investments;
  try {
    investments = await pluggy.listInvestments(itemId);
  } catch (err) {
    // produto não habilitado para o item/plano: investimentos ficam de fora, o resto segue
    if (err instanceof PluggyError && (err.status === 403 || err.status === 404)) return;
    throw err;
  }
  if (investments.length === 0) return;
  const saved = await store.upsertInvestments(connectionId, investments.map(mapInvestment));
  const idMap = new Map(saved.map((s) => [s.provider_investment_id, s.id]));
  for (const inv of investments) {
    const localId = idMap.get(inv.id);
    if (!localId) continue;
    const txs = await pluggy.listInvestmentTransactions(inv.id);
    const flows = txs.map((t) => mapInvestmentFlow(t, localId))
      .filter((f): f is NonNullable<typeof f> => f !== null && f.date >= since);
    if (flows.length) await store.upsertInvestmentFlows(flows);
  }
}

/** Webhook transactions/updated: busca só os ids informados. */
export async function syncTransactionIds(providerAccountId: string, ids: string[], deps: SyncDeps): Promise<number> {
  const target = await deps.store.findAccountByProviderId(providerAccountId);
  if (!target || ids.length === 0) return 0;
  const txs = await deps.pluggy.transactionsByIds(providerAccountId, ids);
  const rows = txs.map((t) => mapTransaction(t, target.id, target.kind)).filter((r): r is TransactionRow => r !== null);
  const n = await deps.store.upsertTransactions(rows);
  if (rows.length) await deps.store.postProcess(rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date));
  return n;
}

/** Webhook transactions/created: busca as criadas a partir de createdAtFrom. */
export async function syncCreatedTransactions(providerAccountId: string, createdAtFrom: string, deps: SyncDeps): Promise<number> {
  const target = await deps.store.findAccountByProviderId(providerAccountId);
  if (!target) return 0; // conta ainda não conhecida: o sync_item do item/updated cuida dela
  let n = 0, minDate: string | null = null;
  for await (const page of deps.pluggy.transactionPages({ accountId: providerAccountId, createdAtFrom })) {
    const rows = page.map((t) => mapTransaction(t, target.id, target.kind)).filter((r): r is TransactionRow => r !== null);
    for (const r of rows) if (!minDate || r.date < minDate) minDate = r.date;
    n += await deps.store.upsertTransactions(rows);
  }
  if (minDate) await deps.store.postProcess(minDate);
  return n;
}
