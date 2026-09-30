# Busca — como funciona por dentro

Complementa o [STATUS.md](./STATUS.md). Aqui ficam as regras que decidem o
que aparece na busca e o que cada número significa, para qualquer pessoa
conferir sem ler o código.

---

## Busca por necessidade (Fase 23)

O campo **"O que você precisa?"** aceita um tipo ("Garagem") ou uma frase
("preciso guardar uma moto perto do centro"). Não é um chat: a frase vira os
mesmos filtros da busca comum, e a tela mostra **"Resultados para:"** com
cada critério entendido — cada um sai com um toque.

### Ordem de interpretação

1. **Regras** (`src/lib/search/need/rules.ts`) — sempre rodam. Sem rede, sem
   custo, mesmo resultado para a mesma frase. Reconhecem:

   | O quê | Exemplos |
   |-------|----------|
   | Tipo de espaço | garagem, vaga, depósito, galpão, sala, escritório, loja, terreno, quarto |
   | Veículo | moto, carro, van, caminhão, bicicleta, barco/lancha/jet ski, trailer |
   | Finalidade | guardar (veículo ou objetos), estoque, trabalhar/atender, vender, oficina |
   | Características | coberto, fechado, portão, 24 h, câmera, alarme, portaria, energia, água, banheiro… (as do catálogo do banco) |
   | Local | "no centro", "perto do Jardim da Penha", "em Vila Velha", "zona sul" |
   | Perto de mim | "perto de mim", "aqui perto", "na minha região" |
   | Orçamento | "até R$ 300", "entre 2 e 3 mil", "uns 300 reais" (teto + 10%, avisado na tela) |
   | Área | "pelo menos 20 m²" |
   | Distância | "até 3 km" |
   | Quando começa | "agora", "mês que vem", "a partir de novembro", "dia 15", "15/11" |
   | Por quanto tempo | "por 2 meses" — **não filtra**: o aluguel é mensal e sem prazo mínimo, e a tela diz isso |
   | O que os anúncios não informam | internet, acessibilidade, animais, ar-condicionado — a tela diz que não dá para filtrar |

   "Sem portão" não pede portão. "24/7" é acesso a qualquer hora, não 24 de
   julho. "Até 3 km" é distância, não orçamento.

2. **IA (opcional)** — só quando sobra na frase alguma palavra que as regras
   não usaram, e só se `ANTHROPIC_API_KEY` estiver configurada
   ([SETUP.md §14](./SETUP.md#14-anthropic-busca-por-necessidade-e-sugestões-de-anúncio)).
   - A IA recebe **apenas** a frase e a data de hoje. Nenhum dado do banco,
     nenhum dado de usuário, nenhuma ferramenta.
   - Devolve um objeto de formato fixo: tipos, características e veículos são
     listas fechadas — ela não consegue inventar um valor novo.
   - O servidor confere o resto contra a frase: local que não está escrito
     na frase é descartado; valor em reais só vale se a frase tem número;
     data só vale entre hoje e daqui a 1 ano.
   - Na junção, os números e o local lidos pelas regras valem mais que os da
     IA; tipo e veículo da IA valem mais (ela leu a frase inteira).

3. **Conferência no banco** (`to-url.ts`) — característica só vira filtro se
   existe no catálogo ativo e se aplica aos tipos pedidos ("sala coberta":
   "coberto" não se aplica a sala, então não zera a busca; aparece em "Não
   usamos na busca"). "Centro de Colatina" vira "Centro, Colatina" quando esse
   bairro existe nessa cidade entre os anúncios.

### Quando a IA falha

Erro, demora acima de 6 s, recusa, resposta fora do formato, limite por
pessoa ou teto diário: a busca segue **com o que as regras entenderam**, e a
tela mostra *"Não conseguimos processar a busca inteligente agora. Você pode
continuar usando os filtros tradicionais."* Sem IA configurada, o aviso não
aparece; as palavras não usadas aparecem em "Não usamos na busca".

### Limites de custo

| Limite | Valor | Onde |
|--------|-------|------|
| Por pessoa (ou IP, sem login) | 20 interpretações por IA a cada 10 min | `LIMITE_POR_PESSOA` em `interpret.ts` |
| Teto diário do app inteiro | 500 | `platform_settings` → `ai.search_daily_limit` (contador em `ai_usage_counters`) |
| Cache | mesma frase, mesmo dia, 1 h | memória da instância (economia, não garantia) |

A chamada é contada **antes** de acontecer: uma falha também gasta cota.

---

## Compatibilidade ("X% compatível")

Significa **só**: quanto do que a pessoa informou na busca o anúncio
atende, pelos dados que o próprio anúncio tem. Não é "melhor espaço", nem
confiança, nem bom negócio. **Nunca muda quem aparece nem a ordem da lista
principal.**

### Onde aparece

- Na lista principal, **só na busca por necessidade** — nos filtros comuns
  todo resultado já cumpre todos os filtros, e "100%" em cada card seria
  ruído.
- Em "Recomendados para você" sempre que houver 2+ critérios: ali tipo e
  características viram pontuação, o número varia e **decide a ordem da
  seção** (o número mostrado e a posição nunca se contradizem; promoção não
  entra).

### Fórmula (`src/lib/search/match.ts`)

Só entram critérios que a pessoa **informou**. Com menos de 2, o número não
aparece.

| Critério | Peso | Atende quando |
|----------|------|---------------|
| Localização | 30 | mesmo bairro/cidade; por ponto: dentro do raio pedido, ou sem raio, cheio até 2 km, caindo em linha reta até zero em 20 km (distância pela localização aproximada, a pública) |
| Tipo | 20 | o tipo do anúncio está entre os pedidos |
| Preço | 20 | dentro da faixa/teto |
| Características | 20 | proporcional: marcou 1 de 2 pedidas = 10 |
| Disponibilidade | 10 | um aluguel pode começar na data pedida (com os bloqueios do calendário) |
| Veículo | 10 | moto: é vaga de moto ou marcou "acesso para moto"; carro: vaga de carro ou "acesso para carro"; caminhão: "acesso para caminhão". Outros veículos não entram na conta (o anúncio não tem como mostrar) |
| Tamanho | 10 | área informada ≥ pedida |

**Percentual = pontos obtidos ÷ pontos possíveis dos critérios informados**,
arredondado **para baixo**. **100% só quando tudo o que foi informado bate**
(regra, não conta — nenhum resíduo de arredondamento vira 100%).

Dado que o anúncio não tem conta como não atendido, e a explicação diz
"não consta no anúncio" — sem afirmar que o espaço não tem.

A explicação mostra cada critério informado, atendido ou não, sem pesos nem
fórmula, e termina dizendo o que o número não é.
