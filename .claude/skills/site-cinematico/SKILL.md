---
name: site-cinematico
description: Cria sites cinematográficos de HTML único (3D com Three.js guiado pelo scroll, tipografia gigante, claro→escuro, travessia por nuvens, objeto que se desmonta) a partir de um tema dado pelo usuário. Use quando o usuário pedir "um site sobre X" no estilo dos vídeos de referência (relojoaria 3D, vitrine de produto com letreiro gigante, "voando pelo scroll").
---

# Site cinematográfico (kit em `sites/_kit`)

O usuário pede um site com um **tema** ("faça um site de X") e quer o resultado **num único arquivo HTML**,
com **todas** as animações e o 3D (nunca simplificar para "caber"). Misture os 3 estilos conforme o tema:

1. **Objeto 3D girando/se desmontando** (relojoaria): fundo claro, tipografia gigante vazada, camadas que se separam com o scroll.
2. **Vitrine de produto com letreiro gigante** (tênis, lata, editorial): objeto flutuando sobre palavra enorme, serifa grande, cor forte por seção.
3. **Voando pelo scroll** (nuvens, prédio, jato): câmera avançando por névoa/profundidade, títulos grandes por cima.

## Fluxo

1. Se o tema não deu pistas, **não pergunte demais**: escolha uma marca fictícia coerente e deixe claro (rodapé) que é demonstração; ou use os dados reais que o usuário passar. Nunca invente depoimentos, números ou garantias para negócio real.
2. Crie `sites/<nome>/` com `App.tsx`, `scene.ts`, `styles.css`, `meta.json` (copie `sites/meridian` como ponto de partida).
3. `pnpm site <nome>` → gera `sites/<nome>/dist/<nome>.html` (único arquivo, sem requisição externa).
4. `pnpm site:shots sites/<nome>/dist/<nome>.html <pasta>` → telas desktop+celular de todas as seções e checagem de console/overflow/externas. **Olhe as imagens** (Read) e corrija sobreposição de texto, 3D cobrindo texto no celular, etc.
5. `pnpm typecheck && pnpm lint`; entregue o HTML com `SendUserFile` (display: attach) e commit/push na branch designada.

## O kit

- `_kit/stage.ts` — `mountStage(host, opts, build)`: canvas fixo atrás do conteúdo, laço pausado com aba oculta, `reduced-motion` = sem laço (redesenha ao rolar), DPR ≤ 2 (≤ 1,5 no celular). O `build(ctx)` recebe `scene, camera, aspect, mouse, progress` e as funções `pass(id)` (0→1 enquanto a seção cruza a tela), `stick(id)` (0→1 dentro de uma seção sticky), `setBackground(css)` (troca o fundo claro↔escuro), `useEnvironment()` (reflexos de metal/vidro).
- `_kit/objects.ts` — procedurais, sem modelos externos: `makeWatch` (relógio em camadas, `setExplode(0..1)`, ponteiros), `gearGeometry` (engrenagem), `makeFog` (nuvens/fumaça em profundidade — câmera avançando em Z = travessia), `makeDust`, `puffTexture`, `dialTexture`. **Para outro tema, crie novos objetos aqui** (lata via `LatheGeometry`, tênis/garrafa/carro simplificados, pedras via `IcosahedronGeometry` com ruído, anéis, cristais…). Texturas por canvas; materiais `MeshStandardMaterial` metálicos + `useEnvironment`.
- `_kit/ui.tsx` — `GiantWord` (letreiro vazado com parallax por `--p`), `Marquee`, `StickySection` (seção alta com conteúdo sticky), `ScrollHint`.
- `_kit/scroll.ts` — Lenis + ScrollTrigger e o **binder**: `data-progress` / `data-progress="stick"` / `data-steps="N"` definem `--p` e `data-step` no elemento; o CSS anima com `var(--p)` e `[data-step="2"] .s2 {…}`. Zero re-render do React.
- `_kit/boot.tsx` — `<Stage fallback="…css…"/>`: carrega a cena do HTML (Blob) só depois do primeiro desenho; `quality: 'low'` no celular/saveData/pouca memória.
- `_kit/kit.css` — fontes (`--font-display` Unbounded, `--font-serif` Fraunces, `--font-body` Plus Jakarta), `.k-outline`, `.k-marquee-*`, `.k-shine`, `.k-grain`. Fontes disponíveis para embutir: `fraunces`, `unbounded` (em `_kit/fonts`, via `meta.json → fonts`); mais fontes: baixe o `latin` woff2 do Google Fonts e registre em `FONTES` no `scripts/build-site.mjs`.
- Reuso do app: `@/components/motion/{reveal,split-heading,magnetic,parallax}` (Motion/GSAP) funcionam nos sites.

## Regras de qualidade (aprendidas no Meridian)

- **Texto nunca atrás do 3D no celular**: a cena lê `ctx.aspect` e reposiciona (`wide = aspect > 1.15`); no celular, objeto embaixo, texto em cima, pulseira/peças longas escondidas.
- Legendas por passo (`.step`): inativas com `opacity: 0` (não 0.2 — sobrepõem).
- O fundo (claro→escuro) é do palco (`setBackground`), as seções são transparentes; cor do texto por seção (`.dark`).
- Contraste: engrenagens/objetos grandes ficam à direita no desktop e embaixo no celular; nada brilhante sob texto.
- Performance: ~1,5 MB de HTML é esperado (Three 740 kB + fontes). Sem sombras/pós-processamento; texturas ≤ 1024; contagens menores em `quality: 'low'`.
- Acessibilidade: `lang`, `<main id="conteudo">`, 3D e letreiros `aria-hidden`, `prefers-reduced-motion` respeitado (Lenis desligado, sem laço 3D).
- Nada de gradiente azul-roxo genérico, neon ou emojis; luxo = muito espaço, tipografia grande, poucas cores.
- Imagens/vídeos reais do cliente: se existirem, embuta como `data:` e use como textura (`THREE.TextureLoader`) ou `<img>`; sem eles, o "fotográfico" (nuvens, prédio) é simulado por código e deve-se avisar o usuário.
