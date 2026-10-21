# Prumo

Gerenciador financeiro pessoal, mobile-first (PWA), com sincronização automática via Open Finance
(Pluggy + Meu Pluggy). Um usuário só, um container só: Next.js + Postgres.

## O que já vem pronto

- Saldos, faturas, lançamentos com busca e filtros, lançamento manual rápido
- Sincronização por webhook (tempo quase real) + rotina diária de segurança às 07:31
- Auto-categorização (regras + dicionário + histórico por similaridade) e pareamento de transferências
- Conciliação simples: fila "A classificar" de um toque e junção de lançamento manual com o do banco
- Importação OFX/CSV para bancos fora do Open Finance
- DRE do mês, patrimônio líquido, TWR vs. CDI, recorrências detectadas, projeção de saldo 3/6/12 meses
- Login com senha + 2FA (TOTP), sessões revogáveis, limite de tentativas
- PWA instalável (iOS e Android), modo escuro, modo privacidade (valores borrados)

## Rodando localmente

Requisitos: Node 22.18+, pnpm, Postgres 16+.

```bash
pnpm install
cp .env.example .env.local          # preencha as variáveis (veja os comentários no arquivo)
set -a; source .env.local; set +a
pnpm db:migrate                     # cria as tabelas e o seed de categorias
pnpm user:create voce@email.com     # senha + 2FA no seu app autenticador
pnpm dev                            # http://localhost:3000
```

Testes: `pnpm test` (unidade) e `DATABASE_URL=postgres://.../postgres pnpm test:db` (banco, num banco descartável).

## Conectando seus bancos (uso pessoal, gratuito)

1. Crie conta em **meu.pluggy.ai** e conecte seus bancos lá (cada banco autoriza uma vez).
2. Entre em **dashboard.pluggy.ai** com a mesma conta e crie uma aplicação; copie Client ID e Client Secret.
3. Em Customization → Connectors, confira que **MeuPluggy** está ligado.
4. No app, Contas → **Conectar banco** → escolha **MeuPluggy** no widget.

Limites do uso pessoal: até 5 conexões, sem uso comercial. A autorização do Meu Pluggy vale **1 ano**;
o app avisa 30 dias antes e o botão **Renovar** refaz a autorização.

## Produção na Vercel (Hobby) + Neon (Free)

Sem processo contínuo: use `WORKER_ENABLED=false`. O webhook da Pluggy responde 202 e processa o job
na hora (`after()`); `/api/cron` (1×/dia, ~10h de Brasília, ver `vercel.json`) roda as rotinas agendadas
e retoma jobs que falharam. O build de produção aplica as migrações (`vercel-build`).
Variáveis na Vercel: as de `.env.example` + `CRON_SECRET`, com `DATABASE_URL` do Neon (endpoint *pooled*,
`?sslmode=require`) e `APP_URL=https://<seu-projeto>.vercel.app`. Depois do 1º deploy: `pnpm webhook:register`.

## Produção em container

Qualquer hospedagem que rode um container contínuo (Railway, Render, Fly.io) + Postgres gerenciado.

```bash
docker build -t prumo .
# configure as variáveis de .env.example na hospedagem (APP_URL com https)
pnpm webhook:register               # uma vez, depois que o app estiver no ar
```

O container roda as migrações ao subir (`scripts/migrate.ts`) e expõe `/api/health`.
Ícones: `pnpm icons` regenera os PNGs a partir de `public/icon.svg` (requer ImageMagick + librsvg).
