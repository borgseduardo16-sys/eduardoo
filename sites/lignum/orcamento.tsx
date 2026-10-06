'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { EMPRESA, urlWhats } from './dados';
import { IconeWhats } from './partes';

/*
 * Orçamento online: pedido em etapas, 100% no navegador. NÃO calcula preço (a Lignum orça depois);
 * monta um resumo e abre o WhatsApp da empresa com tudo preenchido.
 */

type Opcao = { v: string; img?: string; sub?: string };

const AMBIENTES: Opcao[] = [
  { v: 'Cozinha', img: 'cozinha', sub: 'Armários, nichos, bancada' },
  { v: 'Painel de TV / Rack', img: 'painel', sub: 'Ripado, prateleiras, rack' },
  { v: 'Banheiro / Lavatório', img: 'verde', sub: 'Gabinete suspenso' },
  { v: 'Sala de estar', img: 'rack', sub: 'Estante, aparador' },
  { v: 'Quarto', sub: 'Guarda-roupa, cabeceira' },
  { v: 'Escritório', sub: 'Bancada, estante' },
  { v: 'Closet', sub: 'Nichos e gavetas' },
  { v: 'Outro ambiente', sub: 'Conte no final' },
];
const TAMANHOS = ['Pequeno (até 2 m)', 'Médio (2 a 4 m)', 'Grande (mais de 4 m)', 'Ainda não medi'];
const ACABAMENTOS = ['Madeirado escuro (nogueira)', 'Madeirado claro / ripado', 'Branco fosco', 'Cores (verde, grafite…)', 'Quero sugestões'];
const EXTRAS = ['Iluminação em LED', 'Portas de vidro', 'Nichos', 'Gavetas com amortecimento', 'Espelho', 'Tampo de pedra'];
const PRAZOS = ['O quanto antes', 'Em 1 a 3 meses', 'Mais de 3 meses', 'Só estou pesquisando'];

type Estado = {
  ambiente: string; tamanho: string; acab: string[]; extras: string[];
  prazo: string; local: string; nome: string; whats: string; obs: string;
};
const VAZIO: Estado = { ambiente: '', tamanho: '', acab: [], extras: [], prazo: '', local: '', nome: '', whats: '', obs: '' };
const CHAVE = 'lignum-orcamento-v1';
const TITULOS = ['Ambiente', 'Tamanho', 'Acabamento', 'Prazo', 'Contato'];

const digitos = (s: string) => s.replace(/\D/g, '');
function mascara(s: string) {
  const d = digitos(s).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function montarMensagem(e: Estado) {
  const l = [
    `Olá, ${EMPRESA.curto}! Pedido de orçamento feito pelo site.`,
    '',
    `• Ambiente: ${e.ambiente}`,
    `• Tamanho aproximado: ${e.tamanho || 'não informado'}`,
    `• Acabamento: ${e.acab.length ? e.acab.join(', ') : 'não informado'}`,
    `• Extras: ${e.extras.length ? e.extras.join(', ') : 'nenhum'}`,
    `• Prazo: ${e.prazo || 'não informado'}`,
    `• Local da obra: ${e.local || 'não informado'}`,
    `• Nome: ${e.nome}`,
    `• WhatsApp: ${e.whats}`,
  ];
  if (e.obs.trim()) l.push('', `Observações: ${e.obs.trim()}`);
  return l.join('\n');
}

export function Orcamento() {
  const [e, setE] = useState<Estado>(VAZIO);
  const [passo, setPasso] = useState(0);
  const [volta, setVolta] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [carregado, setCarregado] = useState(false);

  // rascunho no navegador (se disponível)
  useEffect(() => {
    // depois da hidratação (o HTML pré-renderizado parte do estado vazio)
    const id = window.setTimeout(() => {
      try {
        const salvo = localStorage.getItem(CHAVE);
        if (salvo) setE({ ...VAZIO, ...JSON.parse(salvo) });
      } catch { /* sem armazenamento: segue sem rascunho */ }
      setCarregado(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!carregado) return; // não sobrescreve o rascunho antes de lê-lo
    try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* ignora */ }
  }, [e, carregado]);

  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setE((x) => ({ ...x, [k]: v }));
  const alterna = (k: 'acab' | 'extras', v: string) =>
    setE((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((i) => i !== v) : [...x[k], v] }));

  const erro = useMemo(() => {
    if (passo === 0 && !e.ambiente) return 'Escolha o ambiente para continuar.';
    if (passo === 4) {
      if (e.nome.trim().length < 2) return 'Informe seu nome.';
      if (digitos(e.whats).length < 10) return 'Informe um WhatsApp com DDD.';
    }
    return '';
  }, [passo, e]);

  const ir = (n: number) => { setVolta(n < passo); setTentou(false); setPasso(n); };
  const avancar = () => { if (erro) return setTentou(true); ir(passo + 1); };
  const mensagem = montarMensagem(e);
  const link = urlWhats(mensagem);
  const pronto = passo === 5;

  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensagem); setCopiado(true); setTimeout(() => setCopiado(false), 2200); } catch { /* sem permissão */ }
  };
  const recomecar = () => { setE(VAZIO); setVolta(true); setPasso(0); };

  const chip = (ativo: boolean) =>
    `min-h-12 rounded-full border px-5 text-[0.9375rem] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97] ${
      ativo ? 'border-ouro bg-ouro text-ink' : 'border-white/20 text-paper hover:border-ouro/70'
    }`;

  return (
    <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/10 bg-grafite/90 p-5 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.8)] backdrop-blur-md sm:p-9">
      {/* progresso */}
      <div className="mb-7">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-paper/60">
          <span>{pronto ? 'Resumo' : `Etapa ${passo + 1} de 5 · ${TITULOS[passo]}`}</span>
          {passo > 0 && !pronto && <button type="button" onClick={recomecar} className="underline-offset-4 hover:underline">Recomeçar</button>}
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={Math.min(passo, 5)} aria-label="Progresso do orçamento">
          <div className="h-full origin-left rounded-full bg-ouro transition-transform duration-500 ease-[var(--ease-out-soft)]" style={{ transform: `scaleX(${(pronto ? 5 : passo + 1) / 5})` }} />
        </div>
      </div>

      <div key={passo} className={`etapa ${volta ? 'volta' : ''}`} aria-live="polite">
        {passo === 0 && (
          <fieldset>
            <legend className="font-serif text-3xl font-light leading-tight text-paper sm:text-4xl">Qual ambiente você quer planejar?</legend>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Ambiente">
              {AMBIENTES.map((a) => {
                const ativo = e.ambiente === a.v;
                return (
                  <button
                    key={a.v} type="button" role="radio" aria-checked={ativo} onClick={() => set('ambiente', a.v)}
                    className={`group relative flex min-h-[8.5rem] flex-col justify-end overflow-hidden rounded-2xl border p-3 text-left transition-[border-color,transform] duration-300 active:scale-[0.98] ${ativo ? 'border-ouro' : 'border-white/15 hover:border-ouro/60'}`}
                  >
                    {a.img ? <Foto id={a.img} alt="" className={`absolute inset-0 transition-transform duration-700 group-hover:scale-105 ${ativo ? 'opacity-100' : 'opacity-70'}`} /> : <span className="ripado-esc absolute inset-0" aria-hidden />}
                    <span className={`absolute inset-0 ${ativo ? 'bg-gradient-to-t from-ink/95 via-ink/45 to-ink/10' : 'bg-gradient-to-t from-ink/95 via-ink/60 to-ink/30'}`} aria-hidden />
                    {ativo && <span className="absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full bg-ouro text-ink"><Check className="size-3.5" strokeWidth={3} aria-hidden /></span>}
                    <span className="relative text-[0.9375rem] font-semibold leading-tight text-paper">{a.v}</span>
                    <span className="relative mt-0.5 text-xs leading-snug text-paper/65">{a.sub}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {passo === 1 && (
          <fieldset>
            <legend className="font-serif text-3xl font-light leading-tight text-paper sm:text-4xl">Qual o tamanho aproximado?</legend>
            <p className="mt-3 text-sm text-paper/65">Pense na parede ou no comprimento do móvel. Se não souber, tudo bem: a equipe mede depois.</p>
            <div className="mt-6 flex flex-wrap gap-3" role="radiogroup" aria-label="Tamanho">
              {TAMANHOS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.tamanho === t} onClick={() => set('tamanho', t)} className={chip(e.tamanho === t)}>{t}</button>)}
            </div>
          </fieldset>
        )}

        {passo === 2 && (
          <div>
            <h3 className="font-serif text-3xl font-light leading-tight text-paper sm:text-4xl">Que acabamento você imagina?</h3>
            <p className="mt-3 text-sm text-paper/65">Pode marcar mais de um.</p>
            <div className="mt-6 flex flex-wrap gap-3" role="group" aria-label="Acabamento">
              {ACABAMENTOS.map((t) => <button key={t} type="button" aria-pressed={e.acab.includes(t)} onClick={() => alterna('acab', t)} className={chip(e.acab.includes(t))}>{t}</button>)}
            </div>
            <p className="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-paper/60">Extras</p>
            <div className="flex flex-wrap gap-3" role="group" aria-label="Extras">
              {EXTRAS.map((t) => <button key={t} type="button" aria-pressed={e.extras.includes(t)} onClick={() => alterna('extras', t)} className={chip(e.extras.includes(t))}>{t}</button>)}
            </div>
          </div>
        )}

        {passo === 3 && (
          <div>
            <h3 className="font-serif text-3xl font-light leading-tight text-paper sm:text-4xl">Para quando você precisa?</h3>
            <div className="mt-6 flex flex-wrap gap-3" role="radiogroup" aria-label="Prazo">
              {PRAZOS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.prazo === t} onClick={() => set('prazo', t)} className={chip(e.prazo === t)}>{t}</button>)}
            </div>
            <label className="mt-8 block text-sm font-semibold uppercase tracking-[0.16em] text-paper/60" htmlFor="orc-local">Bairro / cidade da obra</label>
            <input id="orc-local" value={e.local} onChange={(ev) => set('local', ev.target.value)} placeholder="Ex.: Palmital, Linhares" autoComplete="address-level2"
              className="mt-2 h-14 w-full rounded-2xl border border-white/20 bg-ink/50 px-5 text-base text-paper placeholder:text-paper/35 focus:border-ouro focus:outline-none" />
          </div>
        )}

        {passo === 4 && (
          <div>
            <h3 className="font-serif text-3xl font-light leading-tight text-paper sm:text-4xl">Como a gente fala com você?</h3>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold uppercase tracking-[0.16em] text-paper/60" htmlFor="orc-nome">Seu nome</label>
                <input id="orc-nome" value={e.nome} onChange={(ev) => set('nome', ev.target.value)} autoComplete="name" aria-invalid={tentou && e.nome.trim().length < 2}
                  className="mt-2 h-14 w-full rounded-2xl border border-white/20 bg-ink/50 px-5 text-base text-paper focus:border-ouro focus:outline-none aria-[invalid=true]:border-red-400" />
              </div>
              <div>
                <label className="block text-sm font-semibold uppercase tracking-[0.16em] text-paper/60" htmlFor="orc-whats">Seu WhatsApp</label>
                <input id="orc-whats" value={e.whats} onChange={(ev) => set('whats', mascara(ev.target.value))} inputMode="tel" autoComplete="tel" placeholder="(27) 90000-0000" aria-invalid={tentou && digitos(e.whats).length < 10}
                  className="mt-2 h-14 w-full rounded-2xl border border-white/20 bg-ink/50 px-5 text-base text-paper placeholder:text-paper/35 focus:border-ouro focus:outline-none aria-[invalid=true]:border-red-400" />
              </div>
            </div>
            <label className="mt-5 block text-sm font-semibold uppercase tracking-[0.16em] text-paper/60" htmlFor="orc-obs">Quer contar mais? (opcional)</label>
            <textarea id="orc-obs" value={e.obs} onChange={(ev) => set('obs', ev.target.value)} rows={3} placeholder="Ex.: cozinha pequena, quero ripado e LED…"
              className="mt-2 w-full rounded-2xl border border-white/20 bg-ink/50 px-5 py-4 text-base text-paper placeholder:text-paper/35 focus:border-ouro focus:outline-none" />
          </div>
        )}

        {pronto && (
          <div>
            <h3 className="font-serif text-3xl font-light leading-tight text-paper sm:text-4xl">Tudo certo, {e.nome.split(' ')[0]}!</h3>
            <p className="mt-3 text-sm leading-relaxed text-paper/70">Confira o resumo. Ao enviar, o WhatsApp da {EMPRESA.curto} abre com a mensagem pronta — basta tocar em enviar.</p>
            <pre className="mt-6 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-ink/60 p-5 font-sans text-sm leading-relaxed text-paper/90" tabIndex={0} aria-label="Resumo do pedido">{mensagem}</pre>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a href={link} target="_blank" rel="noopener"
                className="k-shine inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-full bg-ouro px-7 sm:flex-1 text-[0.9375rem] font-semibold text-ink shadow-[0_18px_50px_-14px_rgb(232_200_103/0.55)] transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]">
                <IconeWhats className="relative z-10 size-5" /><span className="relative z-10">Enviar pelo WhatsApp</span>
              </a>
              <button type="button" onClick={copiar} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-white/25 px-6 text-[0.9375rem] font-medium text-paper transition-colors hover:border-ouro/70">
                {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copiado ? 'Copiado!' : 'Copiar resumo'}
              </button>
            </div>
            <p className="mt-4 text-xs text-paper/50">O site não envia seus dados a servidor nenhum: o pedido só sai quando você toca em enviar no WhatsApp.</p>
          </div>
        )}
      </div>

      {tentou && erro && <p role="alert" className="mt-5 text-sm font-medium text-red-300">{erro}</p>}

      {!pronto && (
        <div className="mt-8 flex items-center justify-between gap-3">
          <button type="button" onClick={() => ir(passo - 1)} disabled={passo === 0}
            className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-paper/75 transition-colors hover:text-paper disabled:pointer-events-none disabled:opacity-0">
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </button>
          <button type="button" onClick={avancar}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-paper px-7 text-[0.9375rem] font-semibold text-ink transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]">
            {passo === 4 ? 'Ver resumo' : passo >= 1 && passo <= 3 ? 'Continuar' : 'Continuar'} <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {pronto && (
        <div className="mt-6"><button type="button" onClick={() => ir(4)} className="inline-flex items-center gap-2 text-sm font-medium text-paper/75 hover:text-paper"><ArrowLeft className="size-4" aria-hidden /> Editar dados</button></div>
      )}
    </div>
  );
}
