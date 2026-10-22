// Leitor mínimo de .xlsx, sem dependências: um .xlsx é um zip de XMLs. Lê só o que a importação precisa
// (texto e números de cada célula, por aba). Não calcula fórmulas: usa o último valor salvo pelo Excel.
// shortcut: não lê .xls (formato antigo), células mescladas nem estilos; datas chegam como número de série.
// O arquivo vem de upload: tudo aqui tem teto (descompactado, linhas, colunas, células) e o XML é varrido
// em uma passada só, porque regex preguiçosa em XML malformado leva tempo quadrático.
import { inflateRawSync } from 'node:zlib';

export type Cell = string | number | null;
export type Sheet = { name: string; rows: Cell[][] };

const MAX_UNZIPPED = 50 * 1024 * 1024; // soma de tudo que for descompactado
const MAX_ENTRIES = 5_000;
const MAX_ROWS = 100_000, MAX_COLS = 1_000, MAX_CELLS = 1_000_000;
const TOO_BIG = 'planilha grande demais para importar: salve só as linhas que precisa e tente de novo';

/** Zip pelo diretório central; cada entrada só é descompactada quando lida (método 0 guardado ou 8 deflate). */
function openZip(bytes: Uint8Array): (name: string) => Buffer | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('não parece um arquivo .xlsx válido');
  const count = b.readUInt16LE(eocd + 10);
  if (count > MAX_ENTRIES) throw new Error(TOO_BIG);
  let p = b.readUInt32LE(eocd + 16);
  const entries = new Map<string, { method: number; csize: number; offset: number }>();
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('arquivo .xlsx corrompido');
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32);
    entries.set(b.toString('utf8', p + 46, p + 46 + nameLen),
      { method: b.readUInt16LE(p + 10), csize: b.readUInt32LE(p + 20), offset: b.readUInt32LE(p + 42) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  let budget = MAX_UNZIPPED;
  return (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const start = e.offset + 30 + b.readUInt16LE(e.offset + 26) + b.readUInt16LE(e.offset + 28);
    const raw = b.subarray(start, start + e.csize);
    let out: Buffer;
    if (e.method === 0) out = raw;
    else if (e.method === 8) {
      try { out = inflateRawSync(raw, { maxOutputLength: budget }); } catch { throw new Error(TOO_BIG); }
    } else throw new Error('arquivo .xlsx com compressão não suportada');
    budget -= out.length;
    if (budget < 0) throw new Error(TOO_BIG);
    return out;
  };
}

/** Blocos <tag …>…</tag> (ou <tag …/>, com inner null) em uma passada, sem voltar atrás. */
function* blocks(xml: string, tag: string): Generator<{ attrs: string; inner: string | null }> {
  const open = `<${tag}`, close = `</${tag}>`;
  let pos = 0;
  for (;;) {
    const start = xml.indexOf(open, pos);
    if (start < 0) return;
    const next = xml[start + open.length];
    if (next !== ' ' && next !== '>' && next !== '/' && next !== '\n' && next !== '\r' && next !== '\t') { pos = start + open.length; continue; } // <cols> não é <c>
    const tagEnd = xml.indexOf('>', start);
    if (tagEnd < 0) return;
    if (xml[tagEnd - 1] === '/') { yield { attrs: xml.slice(start + open.length, tagEnd - 1), inner: null }; pos = tagEnd + 1; continue; }
    const end = xml.indexOf(close, tagEnd);
    if (end < 0) return;
    yield { attrs: xml.slice(start + open.length, tagEnd), inner: xml.slice(tagEnd + 1, end) };
    pos = end + close.length;
  }
}

const xmlText = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  if (e[0] === '#') {
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()];
});

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** Texto de um <si> ou <is>: concatena os <t> (texto formatado vem em vários trechos). */
const textOf = (xml: string) => [...blocks(xml, 't')].map((t) => xmlText(t.inner ?? '')).join('');

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '') n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

function parseSheet(xml: string, shared: string[]): Cell[][] {
  const rows: Cell[][] = []; // esparso de propósito: não preenche buracos
  let cells = 0;
  for (const c of blocks(xml, 'c')) {
    const ref = attr(c.attrs, 'r');
    if (!ref || c.inner == null) continue;
    const type = attr(c.attrs, 't');
    const v = [...blocks(c.inner, 'v')][0]?.inner ?? undefined;
    let cell: Cell = null;
    if (type === 'inlineStr') cell = textOf(c.inner);
    else if (v != null && type === 's') cell = shared[Number(v)] ?? null;
    else if (v != null && (type === 'str' || type === 'b')) cell = xmlText(v);
    else if (v != null && type !== 'e') cell = Number(v);
    if (cell == null || (typeof cell === 'number' && Number.isNaN(cell))) continue;
    const r = Number(/\d+/.exec(ref)?.[0]) - 1, col = colIndex(ref);
    if (!(r >= 0) || col < 0 || r >= MAX_ROWS || col >= MAX_COLS || ++cells > MAX_CELLS) throw new Error(TOO_BIG);
    (rows[r] ??= [])[col] = cell;
  }
  return rows;
}

/** Todas as abas, na ordem do arquivo. */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const read = openZip(bytes);
  const text = (name: string) => read(name)?.toString('utf8') ?? null;
  const workbook = text('xl/workbook.xml');
  if (!workbook) throw new Error('não parece uma planilha do Excel (.xlsx)');
  const rels = new Map(
    [...blocks(text('xl/_rels/workbook.xml.rels') ?? '', 'Relationship')].map((r) => [attr(r.attrs, 'Id'), attr(r.attrs, 'Target')] as const),
  );
  const shared = [...blocks(text('xl/sharedStrings.xml') ?? '', 'si')].map((si) => textOf(si.inner ?? ''));
  const sheets: Sheet[] = [];
  for (const s of blocks(workbook, 'sheet')) {
    const target = rels.get(attr(s.attrs, 'r:id'));
    if (!target) continue;
    const xml = text(target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    if (xml) sheets.push({ name: xmlText(attr(s.attrs, 'name') ?? ''), rows: parseSheet(xml, shared) });
  }
  return sheets;
}
