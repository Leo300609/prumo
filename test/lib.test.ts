import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBRL, parseBRL, toCents } from '../src/lib/money.ts';
import { addDays, lastScheduledInstant, localDate, monthStart, tzOffsetMinutes } from '../src/lib/time.ts';
import { base32Decode, base32Encode, generateTotpSecret, totpAt, verifyTotp } from '../src/lib/totp.ts';
import { hashPassword, verifyPassword } from '../src/lib/password.ts';
import { decryptField, encryptField } from '../src/lib/crypto-field.ts';

test('toCents não sofre com ponto flutuante', () => {
  assert.equal(toCents(45.9), 4590);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(-212.45), -21245);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(123456789.99), 12345678999);
  assert.throws(() => toCents(Number.NaN));
});

test('parseBRL aceita formatos brasileiros e simples', () => {
  assert.equal(parseBRL('1.234,56'), 123456);
  assert.equal(parseBRL('R$ 10'), 1000);
  assert.equal(parseBRL('-45,9'), -4590);
  assert.equal(parseBRL('12.5'), 1250);
  assert.equal(parseBRL('45,90-'), -4590);
  assert.throws(() => parseBRL('abc'));
});

test('formatBRL', () => {
  assert.equal(formatBRL(123456), 'R$ 1.234,56');
  assert.equal(formatBRL(-4590), '-R$ 45,90');
  assert.equal(formatBRL(500000, { signed: true }), '+R$ 5.000,00');
});

test('datas no fuso de São Paulo', () => {
  // 01:00 UTC de 1º/nov ainda é 31/out às 22:00 em São Paulo
  const d = new Date('2026-11-01T01:00:00Z');
  assert.equal(localDate(d), '2026-10-31');
  assert.equal(monthStart(d), '2026-10-01');
  assert.equal(tzOffsetMinutes(d), -180);
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('lastScheduledInstant: 07:30 em São Paulo = 10:30 UTC', () => {
  const before = new Date('2026-10-21T10:29:00Z');
  const after = new Date('2026-10-21T10:31:00Z');
  assert.equal(lastScheduledInstant(7, 30, before).toISOString(), '2026-10-20T10:30:00.000Z');
  assert.equal(lastScheduledInstant(7, 30, after).toISOString(), '2026-10-21T10:30:00.000Z');
});

test('TOTP bate com os vetores do RFC 6238 (SHA-1)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totpAt(secret, 59, 30, 8), '94287082');
  assert.equal(totpAt(secret, 1111111109, 30, 8), '07081804');
  assert.equal(totpAt(secret, 1234567890, 30, 8), '89005924');
  assert.equal(totpAt(secret, 2000000000, 30, 8), '69279037');
});

test('verifyTotp aceita ±1 passo e recusa o resto', () => {
  const secret = generateTotpSecret();
  assert.equal(base32Decode(secret).length, 20);
  const now = 1_800_000_000_000;
  const code = totpAt(secret, now / 1000);
  assert.ok(verifyTotp(secret, code, now));
  assert.ok(verifyTotp(secret, code, now + 30_000));
  assert.ok(!verifyTotp(secret, code, now + 90_000));
  assert.ok(!verifyTotp(secret, '12345', now));
});

test('senha: hash scrypt e verificação', async () => {
  const h = await hashPassword('uma senha bem comprida');
  assert.match(h, /^scrypt\$32768\$8\$1\$/);
  assert.ok(await verifyPassword('uma senha bem comprida', h));
  assert.ok(!(await verifyPassword('outra senha qualquer!', h)));
  await assert.rejects(() => hashPassword('curta'));
});

test('cifra de campo: ida e volta, e detecção de adulteração', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const blob = encryptField('JBSWY3DPEHPK3PXP', key);
  assert.equal(decryptField(blob, key), 'JBSWY3DPEHPK3PXP');
  const tampered = Buffer.from(blob);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptField(tampered, key));
  assert.throws(() => encryptField('x', 'curta'));
});
