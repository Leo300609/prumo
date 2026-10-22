// Cria (ou redefine) o único usuário do app e ativa o 2FA por TOTP.
// Uso: DATABASE_URL=... FIELD_ENCRYPTION_KEY=... node scripts/create-user.ts voce@email.com
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import postgres from 'postgres';
import { encryptField } from '../src/lib/crypto-field.ts';
import { hashPassword } from '../src/lib/password.ts';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../src/lib/totp.ts';

const email = (process.argv[2] ?? '').trim().toLowerCase();
const { DATABASE_URL, FIELD_ENCRYPTION_KEY } = process.env;
if (!email.includes('@') || !DATABASE_URL || !FIELD_ENCRYPTION_KEY) {
  console.error('uso: DATABASE_URL=... FIELD_ENCRYPTION_KEY=... node scripts/create-user.ts voce@email.com');
  process.exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });
const password = await rl.question('Senha (12+ caracteres): ');
const hash = await hashPassword(password);
const secret = generateTotpSecret();

console.log('\nAdicione no seu app autenticador (1Password, Google Authenticator, Authy…):');
console.log(`  chave: ${secret.match(/.{1,4}/g)!.join(' ')}`);
console.log(`  ou abra este link no celular: ${otpauthUrl(secret, email)}\n`);
const code = await rl.question('Digite o código de 6 dígitos que apareceu: ');
rl.close();
if (!verifyTotp(secret, code)) {
  console.error('Código não confere. Nada foi salvo; rode de novo.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
await sql`
  insert into app_user (id, email, password_hash, totp_secret_enc, totp_enabled)
  values (1, ${email}, ${hash}, ${encryptField(secret, FIELD_ENCRYPTION_KEY)}, true)
  on conflict (id) do update set email = excluded.email, password_hash = excluded.password_hash,
    totp_secret_enc = excluded.totp_secret_enc, totp_enabled = true, totp_last_counter = null`;
await sql`delete from session`; // redefinir credenciais derruba sessões antigas
await sql.end();
console.log(`✔ usuário ${email} pronto, com 2FA ativo.`);
