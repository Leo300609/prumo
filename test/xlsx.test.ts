import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateRawSync } from 'node:zlib';
import { parseStatementSheets } from '../src/domain/csv.ts';
import { readXlsx } from '../src/domain/xlsx.ts';

/** Monta um .zip em memória (o suficiente para o leitor): uma entrada guardada e as demais em deflate. */
function zip(files: Record<string, string>): Uint8Array {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  Object.entries(files).forEach(([name, content], idx) => {
    const data = Buffer.from(content), method = idx === 0 ? 0 : 8;
    const comp = method === 0 ? data : deflateRawSync(data), nameB = Buffer.from(name), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameB.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    parts.push(lh, nameB, comp);
    central.push(ch, nameB);
    offset += lh.length + nameB.length + comp.length;
  });
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const serial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
const s = (r: string, i: number) => `<c r="${r}" t="s"><v>${i}</v></c>`;
const n = (r: string, v: number | string) => `<c r="${r}"><v>${v}</v></c>`;

// Aba 1 é um resumo sem tabela; a aba 2 tem título, cabeçalho, linhas e um total sem data.
const workbook = `<workbook xmlns:r="x"><sheets><sheet name="Resumo" sheetId="1" r:id="rId1"/><sheet name="Receitas &amp; 2026" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const rels = `<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="/xl/worksheets/sheet2.xml"/></Relationships>`;
const shared = `<sst><si><t>Resumo geral</t></si><si><t>Planilha de receitas</t></si><si><t>Data</t></si><si><t>Descrição</t></si><si><t>Valor</t></si>`
  + `<si><r><t>Salário </t></r><r><t>empresa &amp; Cia</t></r></si><si><t>Freela</t></si><si><t>Total</t></si></sst>`;
const sheet1 = `<worksheet><sheetData><row r="1">${s('A1', 0)}</row></sheetData></worksheet>`;
const sheet2 = `<worksheet><sheetData>
<row r="1">${s('A1', 1)}</row>
<row r="3">${s('A3', 2)}${s('B3', 3)}${s('C3', 4)}</row>
<row r="4">${n('A4', serial(2026, 10, 5))}${s('B4', 5)}${n('C4', 8500)}</row>
<row r="5">${n('A5', serial(2026, 10, 12))}${s('B5', 6)}<c r="C5" t="str"><v>1.234,56</v></c></row>
<row r="6">${s('B6', 7)}${n('C6', 9734.56)}</row>
</sheetData></worksheet>`;

const noTable = `<worksheet><sheetData><row r="1">${s('A1', 0)}</row><row r="2">${s('A2', 1)}</row></sheetData></worksheet>`;

const book = zip({
  'xl/workbook.xml': workbook, 'xl/_rels/workbook.xml.rels': rels, 'xl/sharedStrings.xml': shared,
  'xl/worksheets/sheet1.xml': sheet1, 'xl/worksheets/sheet2.xml': sheet2,
});

test('xlsx: lê abas, textos compartilhados (com trechos e entidades) e números', () => {
  const sheets = readXlsx(book);
  assert.deepEqual(sheets.map((x) => x.name), ['Resumo', 'Receitas & 2026']);
  assert.equal(sheets[1].rows[3][1], 'Salário empresa & Cia');
  assert.equal(sheets[1].rows[3][2], 8500);
  assert.equal(sheets[1].rows[4][2], '1.234,56');
});

test('planilha de receitas: pula aba sem tabela, acha o cabeçalho abaixo do título e ignora a linha de total', () => {
  const tx = parseStatementSheets(readXlsx(book));
  assert.deepEqual(tx.map((t) => [t.date, t.description, t.amountCents]), [
    ['2026-10-05', 'Salário empresa & Cia', 850000],
    ['2026-10-12', 'Freela', 123456],
  ]);
  // a mesma planilha importada de novo gera as mesmas chaves (o app não duplica lançamentos)
  assert.deepEqual(parseStatementSheets(readXlsx(book)).map((t) => t.extKey), tx.map((t) => t.extKey));
});

test('xlsx: arquivo que não é planilha e planilha sem as colunas dão erro claro', () => {
  assert.throws(() => readXlsx(new TextEncoder().encode('isto é um csv, não um zip')), /xlsx/);
  const bad = zip({ 'xl/workbook.xml': workbook, 'xl/_rels/workbook.xml.rels': rels, 'xl/sharedStrings.xml': shared,
    'xl/worksheets/sheet1.xml': sheet1, 'xl/worksheets/sheet2.xml': noTable });
  assert.throws(() => parseStatementSheets(readXlsx(bad)), /colunas de data, descrição e valor/);
});
