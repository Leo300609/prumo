// Tipos da API da Pluggy usados pelo app (subconjunto dos campos documentados).
// Referência: https://docs.pluggy.ai/pt/reference

export type PluggyItemStatus = 'UPDATING' | 'UPDATED' | 'LOGIN_ERROR' | 'OUTDATED' | 'WAITING_USER_INPUT';

export type PluggyItem = {
  id: string;
  status: PluggyItemStatus;
  executionStatus?: string | null;          // SUCCESS, PARTIAL_SUCCESS, USER_AUTHORIZATION_EXPIRED...
  error?: { code?: string; message?: string } | null;
  consentExpiresAt?: string | null;
  lastUpdatedAt?: string | null;
  nextAutoSyncAt?: string | null;
  connector?: { id?: number; name?: string } | null;
};

export type PluggyAccount = {
  id: string;
  itemId: string;
  type: 'BANK' | 'CREDIT' | string;
  subtype: 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD' | string;
  number?: string | null;
  name: string;
  marketingName?: string | null;
  owner?: string | null;
  balance: number;
  currencyCode: string;
  creditData?: {
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    balanceCloseDate?: string | null;
    balanceDueDate?: string | null;
  } | null;
};

export type PluggyTransaction = {
  id: string;
  accountId: string;
  date: string;                     // ISO 8601 em UTC
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  currencyCode: string;
  type: 'DEBIT' | 'CREDIT';
  status: 'PENDING' | 'POSTED';
  category?: string | null;
  providerId?: string | null;       // só Open Finance; estável entre items
  merchant?: { name?: string | null } | null;
  creditCardMetadata?: { installmentNumber?: number | null; totalInstallments?: number | null } | null;
};

export type PluggyInvestment = {
  id: string;
  itemId: string;
  name: string;
  type: string;
  subtype?: string | null;
  code?: string | null;
  balance: number;
  amountOriginal?: number | null;
  status?: string | null;
  currencyCode?: string;
};

export type PluggyInvestmentTransaction = {
  id: string;
  type: string;                    // BUY, SELL, ...
  amount: number;
  netAmount?: number | null;
  date: string;
};

export type CursorPage<T> = { results: T[]; next: string | null };
export type NumberedPage<T> = { results: T[]; page: number; totalPages: number; total: number };

// ── webhooks ──
export type PluggyWebhookEvent =
  | { event: 'item/created' | 'item/updated' | 'item/error' | 'item/deleted' | 'item/waiting_user_input'
             | 'item/waiting_user_action' | 'item/login_succeeded';
      eventId: string; itemId: string; triggeredBy?: string; clientUserId?: string | null;
      error?: { code?: string; message?: string } }
  | { event: 'transactions/created'; eventId: string; itemId: string; accountId: string;
      transactionsCreatedAtFrom?: string; createdTransactionsLink?: string; transactionsCount?: number }
  | { event: 'transactions/updated' | 'transactions/deleted'; eventId: string; itemId: string;
      accountId: string; transactionIds: string[] }
  | { event: 'connector/status_updated'; eventId: string; connectorId: string; data?: { status?: string } }
  | { event: string; eventId: string; itemId?: string };
