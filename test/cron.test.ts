import assert from 'node:assert/strict';
import { test } from 'node:test';

test('cron: sem o segredo correto responde 401 antes de tocar no banco', async () => {
  process.env.CRON_SECRET = 'x'.repeat(32);
  const { GET } = await import('../src/app/api/cron/route.ts');
  assert.equal((await GET(new Request('http://x/api/cron'))).status, 401);
  assert.equal((await GET(new Request('http://x/api/cron', { headers: { authorization: 'Bearer errado' } }))).status, 401);
});
