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
   `street`/`number`/`complement` só após reserva ativa.

## Ao mexer no banco

- Alterou `src/db/schema/` → `pnpm db:generate` → revise o SQL gerado → `pnpm db:migrate`
- Regra de negócio importante vira **constraint ou trigger**, não só código
- Depois, rode `pnpm tsx scripts/verify-schema.ts` e acrescente a checagem nova

## Antes de dar uma tarefa por concluída

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm tsx scripts/verify-schema.ts
```

E atualize `docs/STATUS.md` com o estado honesto do que mudou.

## Idioma

Interface, mensagens de erro e documentação em **português do Brasil**.
Código (identificadores) em inglês; comentários em português.
