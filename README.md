# MyPlace

Marketplace que conecta quem tem espaço ocioso — garagem, depósito, galpão,
vaga, sala, terreno — a quem precisa de espaço perto de casa.

> **Nome provisório de desenvolvimento.**
> Produto real em construção, não é protótipo nem demonstração.

---

## Estado atual

**Fase 1 de 12 concluída:** arquitetura, banco de dados e autenticação.
**Mais:** subsistema de segurança entre usuários (denúncia, bloqueio, detecção de golpe).

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

Verificar que as regras do banco realmente funcionam (85 checagens):

```bash
pnpm tsx scripts/verify-schema.ts   # 29 — invariantes centrais
pnpm tsx scripts/verify-safety.ts   # 56 — segurança entre usuários
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
| [SEGURANCA.md](./docs/SEGURANCA.md) | Denúncia, bloqueio e detecção de golpe |
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

Taxas vigentes: **3% de quem aluga + 3% de quem recebe**, aluguel mínimo de
R$ 35,00 — configuráveis sem deploy.

## Segurança

**Técnica:**
- Autorização na **Data Access Layer**, colada ao acesso ao dado
- **RLS negando por padrão** em todas as tabelas
- Endereço exato e coordenada precisa **nunca** saem em resposta pública
- Chave secreta **nunca** no frontend

**Entre usuários** (ver [SEGURANCA.md](./docs/SEGURANCA.md)):
- Denúncia de anúncio, usuário e mensagem, com evidência congelada
- Bloqueio mútuo e imediato, garantido por trigger no banco
- Detector de troca de contato e de pedido de pagamento por fora
