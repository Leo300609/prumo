// Porta de persistência usada pelo sync e pelo webhook. A implementação real (Postgres)
// está em src/db/store.ts; os testes usam uma versão em memória.
import type { AccountRow, ConnectionStatus, InvestmentFlowRow, InvestmentRow, TransactionRow } from './mapping.ts';

export type ConnectionRecord = {
  id: string;
  itemId: string;
  status: ConnectionStatus | 'revoked';
  lastSyncedAt: Date | null;
};

export type LocalAccountRef = { id: string; provider_account_id: string; kind: AccountRow['kind'] };

export interface SyncStore {
  ensureConnection(itemId: string): Promise<ConnectionRecord>;
  setConnectionHealth(id: string, h: {
    status: ConnectionStatus | 'revoked'; errorCode: string | null;
    consentExpiresAt: string | null; connectorName: string | null;
  }): Promise<void>;
  markSynced(id: string, at: Date): Promise<void>;
  upsertAccounts(connectionId: string, rows: AccountRow[]): Promise<LocalAccountRef[]>;
  findAccountByProviderId(providerAccountId: string): Promise<LocalAccountRef | null>;
  upsertTransactions(rows: TransactionRow[]): Promise<number>;
  deleteTransactions(providerTxIds: string[]): Promise<number>;
  upsertInvestments(connectionId: string, rows: InvestmentRow[]): Promise<{ id: string; provider_investment_id: string }[]>;
  upsertInvestmentFlows(rows: InvestmentFlowRow[]): Promise<void>;
  snapshotInvestments(date: string): Promise<void>;
  postProcess(sinceDate: string): Promise<void>;     // categorização + pareamento de transferências
  startLog(connectionId: string, trigger: string): Promise<number>;
  finishLog(id: number, result: 'success' | 'skipped' | 'failed', txUpserted: number, error?: string): Promise<void>;
}

export type RoutedJob = { kind: string; payload: unknown; dedupe: string | null };

export interface WebhookSink {
  /**
   * Grava o evento e, se for novo, enfileira o job — na MESMA transação. Assim nunca existe
   * "evento gravado sem job": se algo falhar, nada fica gravado e a reentrega da Pluggy refaz tudo.
   * Devolve 'duplicate' se esse eventId já tinha chegado (idempotência).
   */
  accept(e: { eventId: string; event: string; itemId: string | null; payload: unknown }, job: RoutedJob | null):
    Promise<'new' | 'duplicate'>;
}
