// Variáveis de ambiente validadas na primeira leitura (não no build), com mensagens claras.

type Env = {
  DATABASE_URL: string;
  APP_URL: string;
  PLUGGY_CLIENT_ID: string;
  PLUGGY_CLIENT_SECRET: string;
  PLUGGY_WEBHOOK_SECRET: string;
  FIELD_ENCRYPTION_KEY: string;
  WORKER_ENABLED: boolean;
  NODE_ENV: string;
};

let cached: Env | null = null;

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`variável de ambiente ${name} não definida (veja .env.example)`);
  return v.trim();
}

export function env(): Env {
  if (cached) return cached;
  const e: Env = {
    DATABASE_URL: required('DATABASE_URL'),
    APP_URL: required('APP_URL').replace(/\/$/, ''),
    PLUGGY_CLIENT_ID: required('PLUGGY_CLIENT_ID'),
    PLUGGY_CLIENT_SECRET: required('PLUGGY_CLIENT_SECRET'),
    PLUGGY_WEBHOOK_SECRET: required('PLUGGY_WEBHOOK_SECRET'),
    FIELD_ENCRYPTION_KEY: required('FIELD_ENCRYPTION_KEY'),
    WORKER_ENABLED: (process.env.WORKER_ENABLED ?? 'true') !== 'false',
    NODE_ENV: process.env.NODE_ENV ?? 'development',
  };
  if (e.PLUGGY_WEBHOOK_SECRET.length < 32) throw new Error('PLUGGY_WEBHOOK_SECRET precisa ter 32+ caracteres (openssl rand -hex 32)');
  if (Buffer.from(e.FIELD_ENCRYPTION_KEY, 'base64').length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY precisa ter 32 bytes em base64 (openssl rand -base64 32)');
  }
  if (e.NODE_ENV === 'production' && !e.APP_URL.startsWith('https://')) {
    throw new Error('APP_URL precisa ser https:// em produção (a Pluggy só entrega webhooks em HTTPS)');
  }
  cached = e;
  return e;
}
