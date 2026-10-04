# MyPlace

Marketplace que conecta quem tem espaço ocioso — garagem, depósito, galpão,
vaga, sala, terreno — a quem precisa de espaço perto de casa.

> **Nome provisório de desenvolvimento.**
> Produto real em construção, não é protótipo nem demonstração.

---

## Estado atual

A locação é **mensal, por quantidade de vagas**: anúncio → quantidade
disponível → solicitação → aceite com instruções de acesso → pagamento →
locação mensal → renovações. Há mapa de exploração, chat com texto e áudio,
painéis do proprietário e do locatário, e as camadas de segurança e confiança
entre usuários (denúncia, bloqueio, detecção de golpe, avaliações de locações
reais).

Leia [`docs/STATUS.md`](./docs/STATUS.md) para o estado honesto de cada
funcionalidade — o que existe, o que não existe e o que está bloqueado
esperando configuração externa (a cobrança real, por exemplo, depende da
credencial do Asaas).

---

## Rodar localmente

Requisitos: Node 20.9+, pnpm, PostgreSQL 16 com PostGIS.

```bash
pnpm install
cp .env.example .env.local      # preencha — ver docs/SETUP.md
pnpm db:migrate
pnpm dev
```

Verificar que as regras realmente funcionam — os scripts tentam gravar dado
inválido e conferem que o banco recusa:

```bash
pnpm verify                  # regras do banco e do servidor, contra o Postgres real
pnpm verify:integracoes      # o app num Chromium real, com o build de produção
```

## Comandos

| Comando | O que faz |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm check` | typecheck + lint + build |
| `pnpm verify` | Todas as suítes contra o Postgres real |
| `pnpm verify:integracoes` | Testes no navegador (Chromium) |
| `pnpm db:generate` | Gera migração a partir do schema |
| `pnpm db:migrate` | Aplica migrações |
| `pnpm db:studio` | Interface visual do banco |

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [ARQUITETURA.md](./docs/ARQUITETURA.md) | Stack, decisões e trade-offs |
| [BANCO-DE-DADOS.md](./docs/BANCO-DE-DADOS.md) | O que cada tabela faz, em linguagem simples |
| [ALUGUEL.md](./docs/ALUGUEL.md) | A locação mensal por quantidade: vagas, prazos, pagamento, encerramento |
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
- Rua, número e complemento **nunca** saem em resposta pública antes da locação;
  o ponto no mapa é aproximado (só os tipos comerciais configurados, como loja e
  galpão, mostram o ponto exato)
- Chave secreta **nunca** no frontend

**Entre usuários** (ver [SEGURANCA.md](./docs/SEGURANCA.md)):
- Denúncia de anúncio, usuário e mensagem, com evidência congelada
- Bloqueio mútuo e imediato, garantido por trigger no banco
- Detector de troca de contato e de pedido de pagamento por fora
- Checklist de visita antes de fechar, com "não pague nada na visita" em destaque
- Níveis de confiança do perfil — denúncia procedente domina histórico longo
- Textos de proteção que **só exibem garantias que existem de verdade**
