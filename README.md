# MyPlace

Marketplace que conecta quem tem espaço ocioso — garagem, depósito, galpão,
vaga, sala, terreno — a quem precisa de espaço perto de casa.

> **Nome provisório de desenvolvimento.**
> Produto real em construção, não é protótipo nem demonstração.

---

## Estado atual

**Fase 1 de 12 concluída:** arquitetura, banco de dados e autenticação.

Leia [`docs/STATUS.md`](./docs/STATUS.md) para o estado honesto de cada
funcionalidade — o que existe, o que não existe e o que está bloqueado
esperando configuração externa.

---

## Rodar localmente

Requisitos: Node 20.9+, pnpm, PostgreSQL 16 com PostGIS.

```bash
pnpm install
cp .env.example .env.local      # preencha — ver docs/SETUP.md
pnpm db:migrate
pnpm dev
```

Verificar que as regras do banco realmente funcionam:

```bash
pnpm tsx scripts/verify-schema.ts
```

## Comandos

| Comando | O que faz |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm check` | typecheck + lint + build |
| `pnpm db:generate` | Gera migração a partir do schema |
| `pnpm db:migrate` | Aplica migrações |
| `pnpm db:studio` | Interface visual do banco |

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [ARQUITETURA.md](./docs/ARQUITETURA.md) | Stack, decisões e trade-offs |
| [BANCO-DE-DADOS.md](./docs/BANCO-DE-DADOS.md) | O que cada tabela faz, em linguagem simples |
| [PAGAMENTOS.md](./docs/PAGAMENTOS.md) | Análise dos gateways e a economia real do modelo de taxa |
| [SETUP.md](./docs/SETUP.md) | Passo a passo das contas externas |
| [STATUS.md](./docs/STATUS.md) | Estado honesto de cada funcionalidade |

---

## Como este projeto trata dinheiro

- Todo valor é **inteiro em centavos**. Nenhum `float` toca dinheiro.
- O **navegador nunca envia preço** — envia o id do espaço, o servidor calcula.
- A aritmética das reservas é `CHECK` **no banco**: total inconsistente é
  recusado pelo Postgres, não apenas pelo código.
- O livro-razão é **append-only**.
- Confirmação de pagamento só vale vinda de **webhook do gateway**.

## Segurança

- Autorização na **Data Access Layer**, colada ao acesso ao dado
- **RLS negando por padrão** em todas as tabelas
- Endereço exato e coordenada precisa **nunca** saem em resposta pública
- Chave secreta **nunca** no frontend
