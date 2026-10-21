// Cifragem de campos sensíveis (ex.: segredo do TOTP) com AES-256-GCM.
// Formato: [versão 1 byte][iv 12][tag 16][dados]. A chave vem de FIELD_ENCRYPTION_KEY (32 bytes em base64).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY precisa ter 32 bytes em base64 (openssl rand -base64 32)');
  return key;
}

export function encryptField(plain: string, base64Key: string): Buffer {
  const iv = randomBytes(12); // nunca reutilize IV com a mesma chave
  const cipher = createCipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), data]);
}

export function decryptField(blob: Uint8Array, base64Key: string): string {
  const buf = Buffer.from(blob);
  if (buf[0] !== VERSION) throw new Error(`versão de cifra desconhecida: ${buf[0]}`);
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(base64Key), buf.subarray(1, 13));
  decipher.setAuthTag(buf.subarray(13, 29)); // final() lança erro se o dado foi adulterado
  return Buffer.concat([decipher.update(buf.subarray(29)), decipher.final()]).toString('utf8');
}
