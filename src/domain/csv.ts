// Importação de CSV de extrato com detecção de colunas. Funciona com os CSVs do Nubank
// (conta: Data,Valor,Identificador,Descrição | cartão: date,title,amount) e com planilhas genéricas.
import { createHash } from 'node:crypto';
import { parseBRL } from '../lib/money.ts';

export type CsvTransaction = { extKey: string; date: string; amountCents: number; description: string };

/** Parser RFC 4180 mínimo: aspas, aspas escapadas ("") e quebras de linha dentro de aspas. */
export function parseCsvRows(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = delimiter ?? ((firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const COLUMNS = {
  date: ['data', 'date', 'data lancamento', 'data da transacao'],
  description: ['descricao', 'description', 'title', 'historico', 'memo', 'lancamento', 'estabelecimento'],
  amount: ['valor', 'amount', 'value', 'valor (r$)'],
  id: ['identificador', 'id'],
};

function toIsoDate(raw: string): string {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error(`data não reconhecida: "${raw}"`);
}

/**
 * @param invertSign use true para CSV de cartão em que compra vem positiva (ex.: Nubank cartão).
 */
export function parseStatementCsv(text: string, opts: { invertSign?: boolean } = {}): CsvTransaction[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(norm);
  const find = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = find(COLUMNS.date), iDesc = find(COLUMNS.description), iAmt = find(COLUMNS.amount), iId = find(COLUMNS.id);
  if (iDate < 0 || iDesc < 0 || iAmt < 0) {
    throw new Error(`não encontrei as colunas de data, descrição e valor no cabeçalho: ${rows[0].join(' | ')}`);
  }
  const out: CsvTransaction[] = [];
  for (const r of rows.slice(1)) {
    const amountRaw = r[iAmt]?.trim();
    if (!amountRaw) continue;
    let amountCents = parseBRL(amountRaw);
    if (opts.invertSign) amountCents = -amountCents;
    if (amountCents === 0) continue;
    const date = toIsoDate(r[iDate]);
    const description = (r[iDesc] ?? '').trim() || 'Sem descrição';
    const idPart = iId >= 0 && r[iId] ? r[iId].trim() : `${date}|${amountCents}|${description}`;
    out.push({ extKey: 'csv:' + createHash('sha256').update(idPart).digest('hex').slice(0, 32), date, amountCents, description });
  }
  return out;
}
