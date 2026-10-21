// TOTP (RFC 6238) com HMAC-SHA1, 6 dígitos, passo de 30 s — o padrão de Google Authenticator,
// 1Password, Authy etc. Sem dependências: só node:crypto.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new TypeError('segredo base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Segredo novo de 160 bits, em base32 (é o que o app autenticador pede). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, unixSeconds: number, step = 30, digits = 6): string {
  const counter = Math.floor(unixSeconds / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

/** Aceita o código atual e um passo antes/depois (relógio do celular adiantado/atrasado até 30 s). */
export function verifyTotp(secret: string, token: string, now = Date.now(), window = 1): boolean {
  const clean = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const t = Math.floor(now / 1000);
  let ok = false;
  for (let w = -window; w <= window; w++) {
    const expected = Buffer.from(totpAt(secret, t + w * 30));
    // compara todos os passos, sem sair cedo, para não vazar tempo
    if (timingSafeEqual(expected, Buffer.from(clean))) ok = true;
  }
  return ok;
}

export function otpauthUrl(secret: string, account: string, issuer = 'Prumo'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
