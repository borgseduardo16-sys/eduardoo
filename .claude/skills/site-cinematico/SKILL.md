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
5. O build também gera `dist/site/index.html` e `dist/<nome>-netlify.zip` — **entregue o .zip/index.html** para hospedagem (Netlify Drop e afins só abrem `index.html` na raiz; `<nome>.html` dá "Not Found").
6. `pnpm typecheck && pnpm lint`; entregue o HTML com `SendUserFile` (display: attach) e commit/push na branch designada.

## O kit

- `_kit/stage.ts` — `mountStage(host, opts, build)`: canvas fixo atrás do conteúdo, laço pausado com aba oculta, `reduced-motion` = sem laço (redesenha ao rolar), DPR ≤ 2 (≤ 1,5 no celular). O `build(ctx)` recebe `scene, camera, aspect, mouse, progress` e as funções `pass(id)` (0→1 enquanto a seção cruza a tela), `stick(id)` (0→1 dentro de uma seção sticky), `setBackground(css)` (troca o fundo claro↔escuro), `useEnvironment()` (reflexos de metal/vidro).
- `_kit/objects.ts` — procedurais, sem modelos externos: `makeWatch` (relógio em camadas, `setExplode(0..1)`, ponteiros), `gearGeometry` (engrenagem), `makeFog` (nuvens/fumaça em profundidade — câmera avançando em Z = travessia), `makeDust`, `puffTexture`, `dialTexture`. **Para outro tema, crie novos objetos aqui** (lata via `LatheGeometry`, tênis/garrafa/carro simplificados, pedras via `IcosahedronGeometry` com ruído, anéis, cristais…). Texturas por canvas; materiais `MeshStandardMaterial` metálicos + `useEnvironment`.
- `_kit/ui.tsx` — `GiantWord` (letreiro vazado com parallax por `--p`), `Marquee`, `StickySection` (seção alta com conteúdo sticky), `ScrollHint`.
- `_kit/scroll.ts` — Lenis + ScrollTrigger e o **binder**: `data-progress` / `data-progress="stick"` / `data-steps="N"` definem `--p` e `data-step` no elemento; o CSS anima com `var(--p)` e `[data-step="2"] .s2 {…}`. Zero re-render do React.
- `_kit/boot.tsx` — `<Stage fallback="…css…"/>`: carrega a cena do HTML (Blob) só depois do primeiro desenho; `quality: 'low'` no celular/saveData/pouca memória.
- `_kit/kit.css` — fontes (`--font-display` Unbounded, `--font-serif` Fraunces, `--font-body` Plus Jakarta), `.k-outline`, `.k-marquee-*`, `.k-shine`, `.k-grain`. Fontes disponíveis para embutir: `fraunces`, `unbounded` (em `_kit/fonts`, via `meta.json → fonts`); mais fontes: baixe o `latin` woff2 do Google Fonts e registre em `FONTES` no `scripts/build-site.mjs`.
- Reuso do app: `@/components/motion/{reveal,split-heading,magnetic,parallax}` (Motion/GSAP) funcionam nos sites.

## Vídeo REAL (quando o usuário não quer nada gerado por código)

- `_kit/video.tsx`: `<LoopVideo id/>` (vídeo de fundo em loop, toca só visível, pôster no HTML) e
  `<ScrubVideo id altura steps posicao/>` (a rolagem controla o vídeo quadro a quadro, canvas sticky).
- `meta.json → videos: { id: { modo: "loop"|"scrub", descricao, quadros?, inicio?, duracao?, largura? } }`;
  arquivos em `sites/<nome>/videos/<id>.mp4|mov|webm` (fora do git). O build converte com ffmpeg
  (loop → MP4 H.264 ≤ 12 s; scrub → ~120 WebP) e **para com a lista do que falta** se algum vídeo não existir.
- **Não há acesso a bancos de vídeo daqui** (Pexels/Pixabay/Mixkit/Wikimedia bloqueados pela rede do ambiente):
  os vídeos vêm do usuário (upload no chat → copie para `sites/<nome>/videos/`) ou de um domínio liberado na rede.
  Nunca usar vídeos de terceiros (ex.: TikTok de outros criadores) num site a ser publicado.
- Testar aqui: o Chromium deste ambiente não toca H.264 → gere com `KIT_VIDEO_CODEC=vp9 pnpm site <nome>` só para
  validar; a entrega final é H.264 (padrão). Clipes sintéticos (`ffmpeg -f lavfi -i testsrc2…`) servem só para
  testar o motor — apague-os e o HTML gerado com eles antes de entregar/commitar.
- Tamanho: ~1 MB por 10 s de loop real em 1600 px; scrub 120 quadros ≈ 3–6 MB. Um site com 4 vídeos fica ~10–20 MB.
- Ex.: `sites/meridian-filme` (abertura em vídeo, relógio abrindo pela rolagem, macro do mecanismo, pulso).

## Celular (modo leve) — regra do kit

O build injeta no `<head>` um script que põe `.js` e (≤ 767 px) `.lite` em `<html>`. Em `.lite`: sem Lenis/ScrollTrigger, sem
animações de entrada (`useMotionOk` → false), seções sticky viram blocos normais, cortina/zoom/revela desligados (ver fim de
`_kit/kit.css`). **Sem JavaScript** (visualizador de arquivos do celular, WhatsApp) nada fica escondido (`html:not(.js)`).
Ao criar efeitos novos que escondem conteúdo (opacity 0, clip-path, transform), acrescente a regra `html.lite`/`html:not(.js)`
correspondente em `kit.css` e rode `node /…/mobtest` (ou `pnpm site:shots`) para conferir que nada fica invisível.
Entregue sempre o **.zip/index.html** para hospedar; abrir o .html por um visualizador do celular pode rodar sem JS.

## Regras de qualidade (aprendidas no Meridian)

- **Texto nunca atrás do 3D no celular**: a cena lê `ctx.aspect` e reposiciona (`wide = aspect > 1.15`); no celular, objeto embaixo, texto em cima, pulseira/peças longas escondidas.
- Legendas por passo (`.step`): inativas com `opacity: 0` (não 0.2 — sobrepõem).
- O fundo (claro→escuro) é do palco (`setBackground`), as seções são transparentes; cor do texto por seção (`.dark`).
- Contraste: engrenagens/objetos grandes ficam à direita no desktop e embaixo no celular; nada brilhante sob texto.
- Performance: ~1,5 MB de HTML é esperado (Three 740 kB + fontes). Sem sombras/pós-processamento; texturas ≤ 1024; contagens menores em `quality: 'low'`.
- Acessibilidade: `lang`, `<main id="conteudo">`, 3D e letreiros `aria-hidden`, `prefers-reduced-motion` respeitado (Lenis desligado, sem laço 3D).
- Nada de gradiente azul-roxo genérico, neon ou emojis; luxo = muito espaço, tipografia grande, poucas cores.
- Imagens/vídeos reais do cliente: se existirem, embuta como `data:` e use como textura (`THREE.TextureLoader`) ou `<img>`; sem eles, o "fotográfico" (nuvens, prédio) é simulado por código e deve-se avisar o usuário.
