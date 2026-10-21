// Leitor de OFX 1.x (SGML, sem tags de fechamento) e 2.x (XML), o formato de extrato
// que quase todo banco brasileiro exporta. Fallback para bancos sem Open Finance (ex.: Revolut).
import { createHash } from 'node:crypto';

export type OfxTransaction = {
  extKey: string;      // chave estável para não duplicar ao reimportar
  date: string;        // YYYY-MM-DD
  amountCents: number; // sinal do OFX: negativo = saída (também em cartão)
  description: string;
};

export type OfxStatement = {
  kind: 'bank' | 'credit_card';
  bankId: string | null;
  accountId: string | null;
  currency: string;
  balanceCents: number | null;
  transactions: OfxTransaction[];
};

/** Decodifica respeitando o cabeçalho CHARSET:1252 (comum em bancos brasileiros). */
export function decodeOfx(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 600));
  const charset = /CHARSET:\s*(\d+)/i.exec(head)?.[1];
  const xmlEnc = /encoding="([^"]+)"/i.exec(head)?.[1]?.toLowerCase();
  if (charset === '1252' || xmlEnc === 'windows-1252' || xmlEnc === 'iso-8859-1') {
    return new TextDecoder('windows-1252').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? m[1].trim() : null;
}

function ofxDate(raw: string): string {
  // 20261005120000[-3:BRT] → 2026-10-05
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
  if (!m) throw new Error(`data OFX inválida: ${raw}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function ofxAmount(raw: string): number {
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) throw new Error(`valor OFX inválido: ${raw}`);
  return Math.round(Number(s) * 100);
}

export function parseOfx(text: string): OfxStatement {
  const isCard = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(text);
  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>)/i.exec(text)?.[1] ?? '';
  const balRaw = tag(ledger, 'BALAMT');

  const transactions: OfxTransaction[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const chunk of blocks) {
    const block = chunk.split(/<\/STMTTRN>/i)[0];
    const dt = tag(block, 'DTPOSTED');
    const amt = tag(block, 'TRNAMT');
    if (!dt || !amt) continue;
    const date = ofxDate(dt);
    const amountCents = ofxAmount(amt);
    if (amountCents === 0) continue;
    const description = [tag(block, 'NAME'), tag(block, 'MEMO')].filter(Boolean).join(' ').trim() || 'Sem descrição';
    const fitId = tag(block, 'FITID') ?? '';
    // alguns bancos repetem FITID entre extratos; combinar com data e valor evita colisão
    const extKey = 'ofx:' + createHash('sha256').update(`${fitId}|${date}|${amountCents}`).digest('hex').slice(0, 32);
    transactions.push({ extKey, date, amountCents, description });
  }

  return {
    kind: isCard ? 'credit_card' : 'bank',
    bankId: tag(text, 'BANKID'),
    accountId: tag(text, 'ACCTID'),
    currency: tag(text, 'CURDEF') ?? 'BRL',
    balanceCents: balRaw ? ofxAmount(balRaw) : null,
    transactions,
  };
}
