// Converte o formato da Pluggy para o modelo local. Toda regra de sinal fica aqui:
//   local: + dinheiro entrando, − saindo (em qualquer tipo de conta)
//   Pluggy, conta: type CREDIT = entrada, DEBIT = saída
//   Pluggy, cartão: amount positivo = compra (aumenta a dívida), negativo = pagamento
import { toCents } from '../lib/money.ts';
import { localDate } from '../lib/time.ts';
import type { PluggyAccount, PluggyInvestment, PluggyInvestmentTransaction, PluggyItem, PluggyTransaction } from './types.ts';

export type LocalAccountKind = 'checking' | 'savings' | 'credit_card';

export type AccountRow = {
  provider_account_id: string;
  account_key: string;
  kind: LocalAccountKind;
  name: string;
  institution: string | null;
  owner_name: string | null;
  currency: string;
  balance_cents: number;
  credit_limit_cents: number | null;
  available_limit_cents: number | null;
  bill_close_date: string | null;
  bill_due_date: string | null;
};

export type TransactionRow = {
  account_id: string;
  provider_tx_id: string;
  ext_key: string;
  status: 'pending' | 'posted';
  date: string;
  amount_cents: number;
  currency: string;
  description: string;
  merchant: string | null;
  provider_category: string | null;
  installment_number: number | null;
  installment_total: number | null;
};

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function accountKind(a: Pick<PluggyAccount, 'type' | 'subtype'>): LocalAccountKind {
  if (a.type === 'CREDIT' || a.subtype === 'CREDIT_CARD') return 'credit_card';
  if (a.subtype === 'SAVINGS_ACCOUNT') return 'savings';
  return 'checking';
}

/** Identidade estável da conta: sobrevive a reautorizações que geram item e ids novos. */
export function accountKey(a: PluggyAccount): string {
  return [a.subtype, a.number ?? '', slug(a.marketingName || a.name)].join(':').toLowerCase();
}

export function mapAccount(a: PluggyAccount, institution: string | null): AccountRow {
  return {
    provider_account_id: a.id,
    account_key: accountKey(a),
    kind: accountKind(a),
    name: a.marketingName || a.name,
    institution,
    owner_name: a.owner ?? null,
    currency: a.currencyCode || 'BRL',
    balance_cents: toCents(a.balance ?? 0),
    credit_limit_cents: a.creditData?.creditLimit != null ? toCents(a.creditData.creditLimit) : null,
    available_limit_cents: a.creditData?.availableCreditLimit != null ? toCents(a.creditData.availableCreditLimit) : null,
    bill_close_date: a.creditData?.balanceCloseDate?.slice(0, 10) ?? null,
    bill_due_date: a.creditData?.balanceDueDate?.slice(0, 10) ?? null,
  };
}

/**
 * A Pluggy manda datas em UTC. Datas "puras" chegam à meia-noite UTC (2026-10-05T00:00:00.000Z)
 * e devem ser lidas como o próprio dia; datas com horário são convertidas para São Paulo.
 */
export function transactionDate(iso: string): string {
  if (/T00:00:00(\.000)?Z$/.test(iso) || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(0, 10);
  return localDate(new Date(iso));
}

export function signedCents(t: Pick<PluggyTransaction, 'amount' | 'type'>, kind: LocalAccountKind): number {
  const abs = Math.abs(toCents(t.amount));
  if (kind === 'credit_card') return -toCents(t.amount); // compra positiva na Pluggy → saída local
  return t.type === 'CREDIT' ? abs : -abs;
}

export function mapTransaction(t: PluggyTransaction, localAccountId: string, kind: LocalAccountKind): TransactionRow | null {
  const amount = signedCents(t, kind);
  if (amount === 0) return null; // lançamentos zerados não entram (estornos informativos, etc.)
  return {
    account_id: localAccountId,
    provider_tx_id: t.id,
    ext_key: t.providerId ? `of:${t.providerId}` : `pluggy:${t.id}`,
    status: t.status === 'PENDING' ? 'pending' : 'posted',
    date: transactionDate(t.date),
    amount_cents: amount,
    currency: t.currencyCode || 'BRL',
    description: (t.description || t.descriptionRaw || 'Sem descrição').trim(),
    merchant: t.merchant?.name ?? null,
    provider_category: t.category ?? null,
    installment_number: t.creditCardMetadata?.installmentNumber ?? null,
    installment_total: t.creditCardMetadata?.totalInstallments ?? null,
  };
}

export type InvestmentRow = {
  provider_investment_id: string; name: string; type: string; subtype: string | null; code: string | null;
  balance_cents: number; amount_original_cents: number | null; status: string | null;
};

export type InvestmentFlowRow = {
  provider_tx_id: string; investment_id: string; date: string; type: 'BUY' | 'SELL'; amount_cents: number;
};

export function mapInvestment(i: PluggyInvestment): InvestmentRow {
  return {
    provider_investment_id: i.id,
    name: i.name,
    type: i.type,
    subtype: i.subtype ?? null,
    code: i.code ?? null,
    balance_cents: toCents(i.balance ?? 0),
    amount_original_cents: i.amountOriginal != null ? toCents(i.amountOriginal) : null,
    status: i.status ?? null,
  };
}

/** Só compra e venda mudam o dinheiro investido; o resto (impostos, eventos) é rendimento/custo interno. */
export function mapInvestmentFlow(t: PluggyInvestmentTransaction, localInvestmentId: string): InvestmentFlowRow | null {
  if (t.type !== 'BUY' && t.type !== 'SELL') return null;
  const value = toCents(Math.abs(t.netAmount ?? t.amount));
  return {
    provider_tx_id: t.id,
    investment_id: localInvestmentId,
    date: transactionDate(t.date),
    type: t.type,
    amount_cents: t.type === 'BUY' ? value : -value,
  };
}

// ── estado da conexão ──

export type ConnectionStatus = 'syncing' | 'active' | 'needs_reauth' | 'needs_action' | 'error';

export type ItemHealth = {
  status: ConnectionStatus;
  errorCode: string | null;
  /** false quando a leitura voltaria vazia: nunca trate "vazio" como "apagado" nesse caso */
  canRead: boolean;
  userMessage: string | null;
};

const REAUTH_CODES = new Set([
  'USER_AUTHORIZATION_EXPIRED', 'USER_AUTHORIZATION_REVOKED', 'INVALID_CREDENTIALS',
  'ACCOUNT_CREDENTIALS_RESET', 'USER_AUTHORIZATION_NOT_GRANTED',
]);

export function itemHealth(item: PluggyItem, now: Date = new Date()): ItemHealth {
  const code = item.error?.code ?? (item.executionStatus && item.executionStatus !== 'SUCCESS'
    && item.executionStatus !== 'PARTIAL_SUCCESS' ? item.executionStatus : null);
  const expired = item.consentExpiresAt ? Date.parse(item.consentExpiresAt) <= now.getTime() : false;

  if (expired || item.status === 'LOGIN_ERROR' || (code && REAUTH_CODES.has(code))) {
    return {
      status: 'needs_reauth', errorCode: expired ? 'USER_AUTHORIZATION_EXPIRED' : code, canRead: false,
      userMessage: expired
        ? 'A autorização do Meu Pluggy venceu. Toque em Renovar para autorizar por mais 1 ano.'
        : 'O banco pediu para você entrar de novo. Toque em Reconectar.',
    };
  }
  if (item.status === 'WAITING_USER_INPUT' || code === 'USER_AUTHORIZATION_PENDING' || code === 'ACCOUNT_NEEDS_ACTION') {
    return { status: 'needs_action', errorCode: code, canRead: true,
      userMessage: 'O banco está esperando uma confirmação sua (no app do banco ou em meu.pluggy.ai).' };
  }
  if (item.status === 'OUTDATED') {
    return { status: 'error', errorCode: code, canRead: true,
      userMessage: 'O banco não respondeu na última atualização. A Pluggy tenta de novo sozinha.' };
  }
  if (item.status === 'UPDATING') return { status: 'syncing', errorCode: null, canRead: true, userMessage: null };
  return { status: 'active', errorCode: null, canRead: true, userMessage: null };
}
