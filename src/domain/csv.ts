// Importação de extrato em CSV ou Excel, com detecção de colunas. Funciona com os CSVs do Nubank
// (conta: Data,Valor,Identificador,Descrição | cartão: date,title,amount) e com planilhas genéricas.
import { createHash } from 'node:crypto';
import { parseBRL, toCents } from '../lib/money.ts';
import type { Cell, Sheet } from './xlsx.ts';

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
  date: ['data', 'date', 'data lancamento', 'data da transacao', 'data de recebimento', 'data recebimento', 'data do recebimento'],
  description: ['descricao', 'description', 'title', 'historico', 'memo', 'lancamento', 'estabelecimento', 'origem', 'cliente', 'fonte', 'detalhes'],
  amount: ['valor', 'amount', 'value', 'valor (r$)', 'valor recebido', 'receita', 'entrada'],
  id: ['identificador', 'id'],
};

/** Número de série do Excel (dias desde 30/12/1899) → "YYYY-MM-DD". */
function serialToIso(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000).toISOString().slice(0, 10);
}

function toIsoDate(cell: Cell): string {
  if (typeof cell === 'number') return serialToIso(cell);
  const s = String(cell).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  throw new Error(`data não reconhecida: "${s}"`);
}

const isBlank = (c: Cell | undefined) => c == null || (typeof c === 'string' && c.trim() === '');
const text = (c: Cell | undefined) => (c == null ? '' : String(c)).trim();

/**
 * Tabela já em linhas (CSV ou uma aba do Excel). O cabeçalho pode não ser a primeira linha: planilhas
 * costumam ter título antes. Procura nas primeiras 20 linhas uma com data, descrição e valor.
 * @param invertSign use true para CSV de cartão em que compra vem positiva (ex.: Nubank cartão).
 */
export function parseStatementRows(rows: Cell[][], opts: { invertSign?: boolean } = {}): CsvTransaction[] {
  if (rows.length < 2) return [];
  let h = -1, iDate = -1, iDesc = -1, iAmt = -1, iId = -1;
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const header = (rows[r] ?? []).map((c) => norm(text(c)));
    const find = (names: string[]) => header.findIndex((x) => names.includes(x));
    [iDate, iDesc, iAmt, iId] = [find(COLUMNS.date), find(COLUMNS.description), find(COLUMNS.amount), find(COLUMNS.id)];
    if (iDate >= 0 && iDesc >= 0 && iAmt >= 0) { h = r; break; }
  }
  if (h < 0) {
    const first = (rows.find((r) => r?.some((c) => !isBlank(c))) ?? []).map(text).join(' | ');
    throw new Error(`não encontrei as colunas de data, descrição e valor no cabeçalho: ${first}`);
  }
  const out: CsvTransaction[] = [];
  for (const r of rows.slice(h + 1)) {
    if (!r || isBlank(r[iAmt]) || isBlank(r[iDate])) continue; // linhas de total ou em branco
    const raw = r[iAmt]!;
    let amountCents = typeof raw === 'number' ? toCents(raw) : parseBRL(raw.trim());
    if (opts.invertSign) amountCents = -amountCents;
    if (amountCents === 0) continue;
    const date = toIsoDate(r[iDate]!);
    const description = text(r[iDesc]) || 'Sem descrição';
    const idPart = iId >= 0 && !isBlank(r[iId]) ? text(r[iId]) : `${date}|${amountCents}|${description}`;
    out.push({ extKey: 'csv:' + createHash('sha256').update(idPart).digest('hex').slice(0, 32), date, amountCents, description });
  }
  return out;
}

export function parseStatementCsv(text: string, opts: { invertSign?: boolean } = {}): CsvTransaction[] {
  return parseStatementRows(parseCsvRows(text), opts);
}

/** Excel: usa a primeira aba que tiver o cabeçalho certo; se nenhuma tiver, explica o que viu na primeira. */
export function parseStatementSheets(sheets: Sheet[], opts: { invertSign?: boolean } = {}): CsvTransaction[] {
  let firstError: Error | null = null, parsedEmpty = false;
  for (const sheet of sheets) {
    try {
      if (sheet.rows.length < 2) continue; // aba vazia ou só com um título: não diz nada sobre o formato
      const found = parseStatementRows(sheet.rows, opts);
      if (found.length) return found;
      parsedEmpty = true; // achou o cabeçalho, mas não há lançamentos
    } catch (err) {
      firstError ??= err instanceof Error ? err : new Error(String(err));
    }
  }
  if (firstError && !parsedEmpty) throw firstError;
  return [];
}
