// Registra (uma vez) o webhook da Pluggy apontando para o app, com o header secreto.
// Os headers só podem ser definidos pela API — por isso este script, e não o dashboard.
// Uso: APP_URL=https://prumo.exemplo.com PLUGGY_CLIENT_ID=... PLUGGY_CLIENT_SECRET=... \
//      PLUGGY_WEBHOOK_SECRET=... node scripts/register-webhook.ts
import { createPluggyClient } from '../src/pluggy/client.ts';
import { WEBHOOK_SECRET_HEADER } from '../src/pluggy/webhook.ts';

const { APP_URL, PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_WEBHOOK_SECRET } = process.env;
if (!APP_URL?.startsWith('https://') || !PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET || (PLUGGY_WEBHOOK_SECRET?.length ?? 0) < 32) {
  console.error('defina APP_URL (https), PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_WEBHOOK_SECRET (32+ caracteres)');
  process.exit(1);
}

const pluggy = createPluggyClient({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET });
const url = `${APP_URL.replace(/\/$/, '')}/api/webhooks/pluggy`;

const existing = (await pluggy.listWebhooks()).results ?? [];
for (const w of existing.filter((w) => w.url === url)) {
  await pluggy.deleteWebhook(w.id); // recria para garantir que o header secreto é o atual
  console.log(`removido webhook antigo ${w.id}`);
}
const created = await pluggy.createWebhook({ url, event: 'all', headers: { [WEBHOOK_SECRET_HEADER]: PLUGGY_WEBHOOK_SECRET! } });
console.log(`✔ webhook ${created.id} → ${url} (todos os eventos)`);
