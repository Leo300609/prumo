import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeOfx, parseOfx } from '../src/domain/ofx.ts';
import { parseCsvRows, parseStatementCsv } from '../src/domain/csv.ts';
import { annualize, realReturn, xirr } from '../src/domain/xirr.ts';
import { forecast, seededRandom } from '../src/domain/forecast.ts';

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0260<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000[-3:BRT]<TRNAMT>-45.90<FITID>abc1<MEMO>Padaria São João</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261006<TRNAMT>5000,00<FITID>abc2<MEMO>Salário</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261007<TRNAMT>0.00<FITID>abc3<MEMO>Informativo</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>3500.10<DTASOF>20261007</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('OFX 1.x em windows-1252', () => {
  const bytes = new Uint8Array(Buffer.from(OFX_SGML, 'latin1'));
  const st = parseOfx(decodeOfx(bytes));
  assert.equal(st.kind, 'bank');
  assert.equal(st.accountId, '12345-6');
  assert.equal(st.balanceCents, 350010);
  assert.equal(st.transactions.length, 2); // o lançamento zerado é ignorado
  assert.deepEqual(
    st.transactions.map((t) => [t.date, t.amountCents, t.description]),
    [['2026-10-05', -4590, 'Padaria São João'], ['2026-10-06', 500000, 'Salário']],
  );
  // a mesma linha gera sempre a mesma chave (reimportar não duplica)
  assert.equal(parseOfx(OFX_SGML).transactions[0].extKey, st.transactions[0].extKey);
});

test('OFX 2.x (XML) de cartão', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
  <CURDEF>BRL</CURDEF><CCACCTFROM><ACCTID>4321</ACCTID></CCACCTFROM><BANKTRANLIST>
  <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261008</DTPOSTED><TRNAMT>-120.00</TRNAMT><FITID>x1</FITID><NAME>CARREFOUR</NAME></STMTTRN>
  </BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
  const st = parseOfx(xml);
  assert.equal(st.kind, 'credit_card');
  assert.deepEqual(st.transactions.map((t) => [t.amountCents, t.description]), [[-12000, 'CARREFOUR']]);
});

test('CSV: aspas, vírgula dentro do campo e ponto e vírgula', () => {
  assert.deepEqual(parseCsvRows('a,b\n"x, y","diz ""oi"""\n'), [['a', 'b'], ['x, y', 'diz "oi"']]);
  assert.deepEqual(parseCsvRows('a;b\r\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('CSV da conta Nubank (valor com sinal)', () => {
  const csv = 'Data,Valor,Identificador,Descrição\n05/10/2026,-45.90,id-1,Compra no débito - Padaria\n06/10/2026,5000.00,id-2,Transferência recebida';
  const tx = parseStatementCsv(csv);
  assert.deepEqual(tx.map((t) => [t.date, t.amountCents]), [['2026-10-05', -4590], ['2026-10-06', 500000]]);
});

test('CSV do cartão Nubank (compra positiva → invertSign)', () => {
  const csv = 'date,title,amount\n2026-10-08,Carrefour,120.00\n2026-10-10,Pagamento recebido,-500.00';
  const tx = parseStatementCsv(csv, { invertSign: true });
  assert.deepEqual(tx.map((t) => t.amountCents), [-12000, 50000]);
});

test('CSV sem as colunas esperadas dá erro claro', () => {
  assert.throws(() => parseStatementCsv('foo,bar\n1,2'), /colunas de data, descrição e valor/);
});

test('XIRR: exemplo da documentação do Excel = 37,34%', () => {
  const r = xirr([
    { date: '2008-01-01', amount: -10000 }, { date: '2008-03-01', amount: 2750 },
    { date: '2008-10-30', amount: 4250 }, { date: '2009-02-15', amount: 3250 }, { date: '2009-04-01', amount: 2750 },
  ]);
  assert.ok(r !== null && Math.abs(r - 0.373362535) < 1e-6, `xirr = ${r}`);
});

test('XIRR: 10% em exatamente um ano', () => {
  const r = xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1100 }]);
  assert.ok(r !== null && Math.abs(r - 0.1) < 1e-9);
  assert.equal(xirr([{ date: '2025-01-01', amount: -1000 }]), null);
});

test('retorno real e anualização', () => {
  assert.equal(Number(realReturn(0.12, 0.045).toFixed(4)), 0.0718);
  assert.ok(Math.abs(annualize(0.02, 365) - 0.02) < 1e-12);
});

test('projeção sem variação é determinística', () => {
  const pts = forecast({
    startCents: 100000, horizon: 3, recurringMonthlyCents: 200000,
    knownByMonthCents: [-50000, 0, 0], historyMonthlyNetCents: [150000, 150000, 150000],
    random: seededRandom(1),
  });
  // variável = 150.000 − 200.000 = −50.000 por mês; mês 1 = 100.000 + 200.000 − 50.000 − 50.000
  assert.deepEqual(pts.map((p) => p.p50), [200000, 350000, 500000]);
  assert.ok(pts.every((p) => p.p10 === p.p50 && p.p90 === p.p50 && p.probNegative === 0));
});

test('projeção com variação abre a faixa P10–P90', () => {
  const pts = forecast({
    startCents: 0, horizon: 6, recurringMonthlyCents: 0, knownByMonthCents: [],
    historyMonthlyNetCents: [-300000, 100000, 50000, 80000, -20000, 120000], random: seededRandom(42),
  });
  assert.ok(pts[5].p10 < pts[5].p50 && pts[5].p50 < pts[5].p90);
  assert.ok(pts[0].probNegative > 0 && pts[0].probNegative < 1);
});
