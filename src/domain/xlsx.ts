// Leitor mínimo de .xlsx, sem dependências: um .xlsx é um zip de XMLs. Lê só o que a importação precisa
// (texto e números de cada célula, por aba). Não calcula fórmulas: usa o último valor salvo pelo Excel.
// shortcut: não lê .xls (formato antigo), células mescladas nem estilos; datas chegam como número de série.
import { inflateRawSync } from 'node:zlib';

export type Cell = string | number | null;
export type Sheet = { name: string; rows: Cell[][] };

const MAX_UNZIPPED = 50 * 1024 * 1024; // protege de zip bomba: o upload já é limitado a 5 MB

/** Entradas do zip pelo diretório central. Suporta método 0 (guardado) e 8 (deflate). */
function unzip(bytes: Uint8Array): Map<string, Buffer> {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('não parece um arquivo .xlsx válido');
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('arquivo .xlsx corrompido');
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32);
    const offset = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    const start = offset + 30 + b.readUInt16LE(offset + 26) + b.readUInt16LE(offset + 28);
    const raw = b.subarray(start, start + csize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, inflateRawSync(raw, { maxOutputLength: MAX_UNZIPPED }));
    else throw new Error('arquivo .xlsx com compressão não suportada');
  }
  return files;
}

const xmlText = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()];
});

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** Texto de um <si> ou <is>: concatena os <t> (texto formatado vem em vários trechos). */
const textOf = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join('');

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '') n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

function parseSheet(xml: string, shared: string[]): Cell[][] {
  const rows: Cell[][] = [];
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = attr(m[1], 'r');
    if (!ref || m[2] == null) continue;
    const type = attr(m[1], 't');
    const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(m[2])?.[1];
    let cell: Cell = null;
    if (type === 'inlineStr') cell = textOf(m[2]);
    else if (v != null && type === 's') cell = shared[Number(v)] ?? null;
    else if (v != null && (type === 'str' || type === 'b')) cell = xmlText(v);
    else if (v != null && type !== 'e') cell = Number(v);
    if (cell == null || (typeof cell === 'number' && Number.isNaN(cell))) continue;
    const r = Number(/\d+/.exec(ref)?.[0]) - 1, c = colIndex(ref);
    (rows[r] ??= [])[c] = cell;
  }
  return Array.from(rows, (row) => Array.from(row ?? [], (x) => x ?? null)); // buracos viram linhas/células vazias
}

/** Todas as abas, na ordem do arquivo. */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzip(bytes);
  const read = (name: string) => files.get(name)?.toString('utf8') ?? null;
  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new Error('não parece uma planilha do Excel (.xlsx)');
  const rels = new Map(
    [...(read('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*>/g)]
      .map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')] as const),
  );
  const shared = [...(read('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[\s\S]*?<\/si>/g)].map((m) => textOf(m[0]));
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const target = rels.get(attr(m[0], 'r:id'));
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const xml = read(path);
    if (xml) sheets.push({ name: xmlText(attr(m[0], 'name') ?? ''), rows: parseSheet(xml, shared) });
  }
  return sheets;
}
