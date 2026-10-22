import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupName, invTitle, rateLabel, tidy } from '../src/domain/investments.ts';
import { mapInvestment } from '../src/pluggy/mapping.ts';

const base = { name: 'CDB 110% CDI', institution: null, group_label: null, connector: 'MeuPluggy' };

test('grupo: escolha manual > instituição da Pluggy > palpite pelo nome > conector > Outros', () => {
  assert.equal(groupName({ ...base, group_label: 'Reserva', institution: 'Banco Inter S.A.' }), 'Reserva');
  assert.equal(groupName({ ...base, institution: 'Banco Inter S.A.' }), 'Inter');
  assert.equal(groupName({ ...base, institution: 'Nu Pagamentos S.A.' }), 'Nubank');
  assert.equal(groupName({ ...base, name: 'Caixinha Reserva de emergência' }), 'Nubank');
  assert.equal(groupName({ ...base, name: 'CDB Banco Inter 2027' }), 'Inter');
  assert.equal(groupName({ ...base, connector: 'XP Investimentos' }), 'XP Investimentos');
  assert.equal(groupName(base), 'Outros'); // MeuPluggy não diz nada sobre a instituição
});

test('emissores reais da Pluggy viram nomes curtos', () => {
  assert.equal(tidy('NU FINANCEIRA S.A. - SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO'), 'Nubank');
  assert.equal(tidy('BANCO INTER S.A'), 'Inter');
  assert.equal(tidy('NEON FINANCEIRA - CREDITO, FINANCIAMENTO E INVESTIMENTO S.A'), 'Neon');
  assert.equal(groupName({ ...base, name: 'CDB - NU FINANCEIRA S.A. - SOCIEDADE DE CREDITO' }), 'Nubank');
  assert.equal(groupName({ ...base, name: 'CDB - BANCO INTER S.A' }), 'Inter');
});

test('taxa: 103% do CDI, prefixada e ausente', () => {
  assert.equal(rateLabel('CDI', 103, null), '103% do CDI');
  assert.equal(rateLabel('CDI', 100.5, null), '100,5% do CDI');
  assert.equal(rateLabel('PRE', null, 12.4), '12,4% a.a.');
  assert.equal(rateLabel(null, null, null), null);
});

const t0 = { nickname: null, name: 'CDB - NU FINANCEIRA S.A.', subtype: 'CDB', rate_type: 'CDI', rate: 103, fixed_rate: null };
test('título: apelido tem prioridade; sem ele, o tipo e a taxa distinguem CDBs de mesmo nome', () => {
  assert.equal(invTitle({ ...t0, nickname: ' Sonho de consumo ' }), 'Sonho de consumo');
  assert.equal(invTitle({ ...t0, nickname: '  ' }), 'CDB 103% do CDI');
  assert.equal(invTitle({ ...t0, rate: null }), 'CDB');
  assert.equal(invTitle({ ...t0, rate: null, name: 'Caixinha 2' }), 'Caixinha 2');
});

test('mapInvestment guarda a instituição (ou o emissor) quando a Pluggy informa', () => {
  const inv = { id: 'i1', itemId: 'it', name: 'CDB', type: 'FIXED_INCOME', balance: 100 };
  const full = mapInvestment({ ...inv, rateType: 'CDI', rate: 103, issueDate: '2025-11-19T03:00:00.000Z', dueDate: '2026-11-19T03:00:00.000Z' });
  assert.deepEqual([full.rate_type, full.rate, full.issue_date, full.due_date], ['CDI', 103, '2025-11-19', '2026-11-19']);
  assert.equal(mapInvestment({ ...inv, institution: { name: ' Banco Inter ' } }).institution, 'Banco Inter');
  assert.equal(mapInvestment({ ...inv, issuer: 'Nu Financeira' }).institution, 'Nu Financeira');
  assert.equal(mapInvestment(inv).institution, null);
});
