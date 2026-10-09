@AGENTS.md

# MyPlace — convenções do projeto

Produto real em construção (marketplace de espaços ociosos), não protótipo.

## Regras inegociáveis

1. **Dinheiro é inteiro em centavos.** Nenhum `float` toca valor monetário.
   Todo cálculo passa por `src/lib/money.ts`.
2. **O navegador nunca envia preço.** Envia o id do recurso; o servidor calcula
   e o banco valida com `CHECK`.
3. **Nada finge funcionar.** Funcionalidade sem credencial real falha com
   mensagem explícita (`requireIntegration` em `src/lib/env.ts`). Nunca criar
   dado de exemplo que possa ser confundido com dado real.
4. **Autorização na DAL** (`src/lib/auth/dal.ts`), nunca só no `proxy.ts`.
   O proxy é checagem otimista; se ele sumisse, nada poderia vazar.
5. **Segredo nunca leva `NEXT_PUBLIC_`.** Módulos de servidor começam com
   `import 'server-only'`.
6. **Localização exata é privada.** Respostas públicas usam `approx_location`;
   `street`/`number`/`complement` (e as coordenadas exatas, usadas em "Traçar
   rota") só após locação ativa. Exceção configurável por tipo: os tipos
   comerciais de `platform_settings['privacy.exact_location_types']` (loja,
   escritório, galpão…) têm `approx_location` = ponto exato — quem faz isso é o
   trigger `sync_approx_location`, então nenhuma consulta pública lê `location`.
   Rua, número e complemento continuam privados para qualquer tipo.

## Locação (leia `docs/ALUGUEL.md` antes de mexer)

- Só aluguel **mensal**, por **quantidade** de vagas. Não existe hora, dia,
  semana nem unidade individual (A1, B17…): não reintroduza.
- `spaces.quantity_available` é mantido pelo **banco** (`refresh_space_availability`
  recontando as locações). Nunca some ou subtraia no código. A trava da última
  vaga é o gatilho `bookings_guard_capacity`.
- Prazos (24 h para responder, 24 h para pagar, 2 h de pagamento pendente) valem
  pelo **relógio do banco** (`release_expired_rentals`), nunca pelo do servidor
  ou do navegador.
- Instruções de acesso (texto ou áudio) são obrigatórias no aceite e só aparecem
  para o locatário depois do pagamento.

## Mapa (MapLibre GL)

- O worker do MapLibre é copiado para `public/maplibre/` (não versionado) por
  `scripts/copy-maplibre-worker.mjs`, que roda em `dev`, `build` e `postinstall`.
  Todo componente que cria um mapa chama `prepararMapLibre()`
  (`src/lib/maps/worker.ts`) antes de `new Map(...)`. Sem isso o mapa abre, mas as
  camadas (o círculo do raio, os clusters) não desenham: o MapLibre procura o
  worker numa URL que o bundler não serve.
- `unsafe-eval` no CSP só vale nas rotas de `ROTAS_COM_MAPA` (`next.config.ts`).
  `/mapa` não precisa, e o TESTE S confere.

## Premium (leia `docs/PREMIUM-BENEFICIO.md` antes de mexer)

- **Premium = pagamento confirmado.** "É Premium agora" = um ciclo pago cobrindo `now()` (relógio do
  banco): `premium_is_active()`. Nunca olhe `status = 'active'` sozinho. Cancelar = não renovar; o
  Premium vai até o fim do período já pago, sem reembolso proporcional.
- Concessão do admin é **modo teste/suporte**: não dá benefício financeiro (taxa de 2%, R$ 100) a menos
  que a concessão tenha a marca de teste financeiro (`premium_financial_active()`).
- **Taxa do proprietário:** 3% → 2% só com Premium pago e aluguel ≥ R$ 50 (`fees.premium_min_rent_cents`).
  Quem decide é `resolveBookingFees` (`src/lib/bookings/fees.ts`); decidida no aceite e depois **segue o
  Premium** (`syncOwnerFeesWithPremium` na manutenção: acabou → 3% nas próximas mensalidades; voltou → 2%;
  o split no Asaas acompanha via `syncSubscriptionSplits`). O gatilho `bookings_guard_price_fee` confere.
  A taxa do locatário não muda.
- **Um Premium por pessoa:** outra conta com o mesmo e-mail canônico, telefone ou documento não abre um
  segundo Premium (`premium_memberships_linked_account`); o benefício de R$ 100 não vale entre contas
  vinculadas (`premium_accounts_linked`) e exige telefone verificado.
- **Benefício do primeiro mês (até R$ 100) está atrás de feature flag DESLIGADA**
  (`premium.first_month_benefit_enabled`). Não foi validado no Asaas real. Não ligue, não "conserte" por
  suposição: se o sandbox contradisser algo, **pare e pergunte** (ver o documento acima).

## Ao mexer no banco

- Alterou `src/db/schema/` → `pnpm db:generate` → revise o SQL gerado → `pnpm db:migrate`
- Regra de negócio importante vira **constraint ou trigger**, não só código
- Depois, rode `pnpm tsx scripts/verify-schema.ts` e acrescente a checagem nova
- Nova migração? Regenere o SQL do Supabase (`pnpm db:supabase-sql`) e confira
  `docs/SETUP.md` (a tabela de arquivos SQL e a contagem de migrações)

## Antes de dar uma tarefa por concluída

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm tsx scripts/verify-schema.ts
```

Mexeu em locação, pagamento, Premium, chat ou mapa? Rode também `pnpm verify` (banco, sem
navegador) e, para telas, `pnpm verify:integracoes` (Chromium contra o build de
produção).

E atualize `docs/STATUS.md` com o estado honesto do que mudou.

## Ambiente restrito (sandbox, CI fechado)

- `NODE_USE_ENV_PROXY=1` faz o Node respeitar `HTTPS_PROXY` (o `next/font` baixa
  as fontes no build). Nunca desligue a verificação de TLS.
- `NEXT_TELEMETRY_DISABLED=1` evita ruído de rede da telemetria do Next; a do
  plugin do Sentry já está desligada em `next.config.ts`.

## Idioma

Interface, mensagens de erro e documentação em **português do Brasil**.
Código (identificadores) em inglês; comentários em português.
