'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { EMPRESA, urlWhats } from './dados';
import { IconeWhats } from './partes';

/*
 * Pedido de proposta de home staging (5 passos), 100% no navegador, em português de Portugal. NÃO calcula preço:
 * monta um resumo e abre o WhatsApp do estúdio. Telefone aceita números estrangeiros (clientes internacionais).
 */

const IMOVEIS: { v: string; sub: string; img?: string; pos?: string }[] = [
  { v: 'Apartamento', sub: 'T0 a T5+', img: 'luz', pos: '40% 50%' },
  { v: 'Moradia', sub: 'Com ou sem jardim', img: 'lareira', pos: '45% 55%' },
  { v: 'Estúdio ou loft', sub: 'Espaços compactos', img: 'mezanine', pos: '35% 50%' },
  { v: 'Espaço comercial', sub: 'Loja, escritório, showroom' },
];
const OBJETIVOS = ['Vender', 'Arrendar', 'Alojamento local', 'Viver melhor (Healthy Homes)'];
const TIPOLOGIAS = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5+'];
const ESTADOS = ['Vazio', 'Mobilado / habitado', 'Em obras'];
const SERVICOS = ['Home staging completo', 'Só algumas divisões', 'Consultoria de decoração', 'Healthy Homes', 'Ainda não sei'];
const PRAZOS = ['O mais breve possível', 'Este mês', 'Nos próximos 3 meses', 'Sem pressa'];
const LINGUAS = ['Português', 'English', 'Français', 'Español'];

type Estado = {
  imovel: string; objetivo: string; tipologia: string; area: string; estado: string; local: string;
  servicos: string[]; prazo: string; nome: string; tel: string; email: string; lingua: string; obs: string;
};
const VAZIO: Estado = { imovel: '', objetivo: '', tipologia: '', area: '', estado: '', local: '', servicos: [], prazo: '', nome: '', tel: '', email: '', lingua: 'Português', obs: '' };
const CHAVE = '5d-proposta-v1';
const TITULOS = ['O imóvel', 'O objetivo', 'Detalhes', 'Serviço e prazo', 'Contacto'];
const N = 5;

const digitos = (s: string) => s.replace(/\D/g, '');
/** Telefone: aceita +, espaços e 9 a 15 dígitos (nacional ou internacional). */
const limpaTel = (s: string) => s.replace(/[^\d+ ]/g, '').replace(/(?!^)\+/g, '').slice(0, 20);
const emailOk = (s: string) => !s.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function montarMensagem(e: Estado) {
  const l = [
    `Olá, ${EMPRESA.curto}! Pedido de proposta feito pelo site.`,
    '',
    `• Imóvel: ${e.imovel}${e.tipologia ? ` ${e.tipologia}` : ''}${e.area ? ` · ${e.area} m²` : ''}`,
    `• Objetivo: ${e.objetivo}`,
    `• Estado: ${e.estado || 'não indicado'}`,
    `• Localização: ${e.local.trim() || 'não indicada'}`,
    `• Serviço: ${e.servicos.length ? e.servicos.join(', ') : 'por definir'}`,
    `• Prazo: ${e.prazo || 'não indicado'}`,
    `• Nome: ${e.nome.trim()}`,
    `• Telefone: ${e.tel.trim()}`,
  ];
  if (e.email.trim()) l.push(`• Email: ${e.email.trim()}`);
  l.push(`• Língua de contacto: ${e.lingua}`);
  if (e.obs.trim()) l.push('', `Mais detalhes: ${e.obs.trim()}`);
  return l.join('\n');
}

export function Proposta() {
  const [e, setE] = useState<Estado>(VAZIO);
  const [passo, setPasso] = useState(0);
  const [volta, setVolta] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const salvo = localStorage.getItem(CHAVE);
        if (salvo) setE({ ...VAZIO, ...JSON.parse(salvo) });
      } catch { /* sem armazenamento */ }
      setCarregado(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!carregado) return;
    try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* ignora */ }
  }, [e, carregado]);

  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setE((x) => ({ ...x, [k]: v }));
  const alterna = (v: string) => setE((x) => ({ ...x, servicos: x.servicos.includes(v) ? x.servicos.filter((i) => i !== v) : [...x.servicos, v] }));

  const erro = useMemo(() => {
    if (passo === 0 && !e.imovel) return 'Escolha o tipo de imóvel para continuar.';
    if (passo === 1 && !e.objetivo) return 'Escolha o objetivo para continuar.';
    if (passo === 2 && e.area && !/^\d{1,5}$/.test(e.area)) return 'Indique a área só com números (m²).';
    if (passo === 4) {
      if (e.nome.trim().length < 2) return 'Indique o seu nome.';
      const d = digitos(e.tel).length;
      if (d < 9 || d > 15) return 'Indique um telefone válido (9 a 15 dígitos, com indicativo se for estrangeiro).';
      if (!emailOk(e.email)) return 'O email não parece válido.';
    }
    return '';
  }, [passo, e]);

  const ir = (n: number) => { setVolta(n < passo); setTentou(false); setPasso(n); };
  const avancar = () => { if (erro) return setTentou(true); ir(passo + 1); };
  const mensagem = montarMensagem(e);
  const pronto = passo === N;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensagem); setCopiado(true); setTimeout(() => setCopiado(false), 2200); } catch { /* sem permissão */ }
  };

  const chip = (ativo: boolean) =>
    `min-h-12 rounded-full border px-5 text-[0.9375rem] transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97] ${
      ativo ? 'border-grafite bg-grafite text-gesso' : 'border-grafite/20 bg-gesso hover:border-grafite/60'
    }`;
  const campo = 'mt-2 h-14 w-full border-0 border-b border-grafite/25 bg-transparent px-1 text-lg placeholder:text-pedra/60 focus:border-musgo focus:outline-none aria-[invalid=true]:border-red-600';
  const rot = 'block text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-pedra';
  const titulo = 'font-[family-name:var(--font-is)] text-[2.3rem] leading-[1.02] sm:text-[3.2rem]';

  return (
    <div className="mx-auto w-full max-w-4xl border border-grafite/10 bg-white/55 p-6 shadow-[0_60px_120px_-60px_rgb(29_31_29/0.4)] backdrop-blur sm:p-12">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4 border-b border-grafite/10 pb-6">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.24em] text-pedra">{pronto ? 'O seu pedido' : <>Passo {passo + 1} de {N} · <span className="text-grafite">{TITULOS[passo]}</span></>}</p>
        <div className="flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={N} aria-valuenow={Math.min(passo, N)} aria-label="Progresso do pedido">
          {Array.from({ length: N }).map((_, i) => (
            <span key={i} className={`h-[3px] transition-all duration-500 ${i < passo || pronto ? 'w-8 bg-grafite' : i === passo ? 'w-12 bg-latao' : 'w-8 bg-grafite/12'}`} />
          ))}
        </div>
      </div>

      <div key={passo} className={`etapa ${volta ? 'volta' : ''}`} aria-live="polite">
        {passo === 0 && (
          <fieldset>
            <legend className={titulo}>Que imóvel vamos <em className="text-musgo">preparar</em>?</legend>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de imóvel">
              {IMOVEIS.map((a) => {
                const ativo = e.imovel === a.v;
                return (
                  <button key={a.v} type="button" role="radio" aria-checked={ativo} onClick={() => set('imovel', a.v)}
                    className={`group relative flex aspect-[3/4] flex-col justify-end overflow-hidden border p-4 text-left transition-[border-color,box-shadow] duration-300 active:scale-[0.98] ${ativo ? 'border-grafite shadow-[0_0_0_2px_#1d1f1d]' : 'border-grafite/15 hover:border-grafite/50'}`}>
                    {a.img ? <Foto id={a.img} alt="" posicao={a.pos} className="absolute inset-0 transition-transform duration-700 group-hover:scale-105" /> : <span className="absolute inset-0 bg-gradient-to-b from-osso to-linho" aria-hidden />}
                    {a.img && <span className="absolute inset-0 bg-gradient-to-t from-carvao/85 via-carvao/20 to-transparent" aria-hidden />}
                    {ativo && <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-gesso text-grafite"><Check className="size-4" strokeWidth={2.5} aria-hidden /></span>}
                    <span className={`relative font-[family-name:var(--font-is)] text-2xl leading-none ${a.img ? 'text-gesso' : ''}`}>{a.v}</span>
                    <span className={`relative mt-1.5 text-xs ${a.img ? 'text-gesso/75' : 'text-pedra'}`}>{a.sub}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {passo === 1 && (
          <div>
            <h3 className={titulo}>Qual é o <em className="text-musgo">objetivo</em>?</h3>
            <div className="mt-8 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Objetivo">
              {OBJETIVOS.map((t, i) => (
                <button key={t} type="button" role="radio" aria-checked={e.objetivo === t} onClick={() => set('objetivo', t)}
                  className={`flex min-h-20 items-center gap-5 border px-6 text-left transition-colors duration-200 ${e.objetivo === t ? 'border-grafite bg-grafite text-gesso' : 'border-grafite/15 hover:border-grafite/50'}`}>
                  <span className={`text-xs tabular-nums tracking-[0.2em] ${e.objetivo === t ? 'text-gesso/60' : 'text-pedra'}`}>{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-[family-name:var(--font-is)] text-2xl">{t}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {passo === 2 && (
          <div>
            <h3 className={titulo}>Conte-nos sobre o <em className="text-musgo">espaço</em>.</h3>
            <p className={`${rot} mb-3 mt-8`}>Tipologia</p>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Tipologia">
              {TIPOLOGIAS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.tipologia === t} onClick={() => set('tipologia', e.tipologia === t ? '' : t)} className={`${chip(e.tipologia === t)} min-w-14`}>{t}</button>)}
            </div>
            <p className={`${rot} mb-3 mt-7`}>Estado atual</p>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Estado atual">
              {ESTADOS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.estado === t} onClick={() => set('estado', t)} className={chip(e.estado === t)}>{t}</button>)}
            </div>
            <div className="mt-7 grid gap-6 sm:grid-cols-[1fr_2fr]">
              <div>
                <label className={rot} htmlFor="pr-area">Área aproximada (m², opcional)</label>
                <input id="pr-area" value={e.area} onChange={(ev) => set('area', ev.target.value.replace(/[^\d]/g, '').slice(0, 5))} inputMode="numeric" placeholder="Ex.: 85" aria-invalid={tentou && !!erro} className={campo} />
              </div>
              <div>
                <label className={rot} htmlFor="pr-local">Localização (opcional)</label>
                <input id="pr-local" value={e.local} onChange={(ev) => set('local', ev.target.value)} placeholder="Ex.: Porto, Boavista" className={campo} />
              </div>
            </div>
          </div>
        )}

        {passo === 3 && (
          <div>
            <h3 className={titulo}>Como podemos <em className="text-musgo">ajudar</em>?</h3>
            <p className={`${rot} mb-3 mt-8`}>Serviço (pode escolher vários)</p>
            <div className="flex flex-wrap gap-2.5" role="group" aria-label="Serviço">
              {SERVICOS.map((t) => <button key={t} type="button" aria-pressed={e.servicos.includes(t)} onClick={() => alterna(t)} className={chip(e.servicos.includes(t))}>{t}</button>)}
            </div>
            <p className={`${rot} mb-3 mt-7`}>Prazo</p>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Prazo">
              {PRAZOS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.prazo === t} onClick={() => set('prazo', t)} className={chip(e.prazo === t)}>{t}</button>)}
            </div>
          </div>
        )}

        {passo === 4 && (
          <div>
            <h3 className={titulo}>Para onde enviamos a <em className="text-musgo">proposta</em>?</h3>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <label className={rot} htmlFor="pr-nome">Nome</label>
                <input id="pr-nome" value={e.nome} onChange={(ev) => set('nome', ev.target.value)} autoComplete="name" aria-invalid={tentou && e.nome.trim().length < 2} className={campo} />
              </div>
              <div>
                <label className={rot} htmlFor="pr-tel">Telefone / WhatsApp</label>
                <input id="pr-tel" value={e.tel} onChange={(ev) => set('tel', limpaTel(ev.target.value))} inputMode="tel" autoComplete="tel" placeholder="9xx xxx xxx ou +44 …" aria-invalid={tentou && (digitos(e.tel).length < 9 || digitos(e.tel).length > 15)} className={campo} />
              </div>
              <div>
                <label className={rot} htmlFor="pr-email">Email (opcional)</label>
                <input id="pr-email" type="email" value={e.email} onChange={(ev) => set('email', ev.target.value)} autoComplete="email" aria-invalid={tentou && !emailOk(e.email)} className={campo} />
              </div>
              <div>
                <p className={rot}>Língua de contacto</p>
                <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Língua de contacto">
                  {LINGUAS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.lingua === t} onClick={() => set('lingua', t)} className={`${chip(e.lingua === t)} min-h-10 px-4 text-sm`}>{t}</button>)}
                </div>
              </div>
            </div>
            <label className={`${rot} mt-7`} htmlFor="pr-obs">Mais alguma coisa? (opcional)</label>
            <textarea id="pr-obs" value={e.obs} onChange={(ev) => set('obs', ev.target.value)} rows={3} placeholder="Ex.: data prevista das fotografias, divisões prioritárias, estilo que procura…"
              className="mt-2 w-full border border-grafite/20 bg-transparent px-4 py-3 text-base placeholder:text-pedra/60 focus:border-musgo focus:outline-none" />
          </div>
        )}

        {pronto && (
          <div>
            <h3 className={titulo}>Está pronto, <em className="text-musgo">{e.nome.trim().split(' ')[0]}</em>.</h3>
            <p className="mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-pedra">Ao enviar, o WhatsApp abre com a mensagem preenchida — só falta tocar em enviar. Respondemos com os próximos passos.</p>
            <pre className="mt-7 max-h-72 overflow-auto whitespace-pre-wrap border-l-2 border-latao bg-osso/60 p-6 text-left font-sans text-sm leading-relaxed" tabIndex={0} aria-label="Resumo do pedido">{mensagem}</pre>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a href={urlWhats(mensagem)} target="_blank" rel="noopener"
                className="k-shine inline-flex h-14 items-center justify-center gap-3 rounded-full bg-grafite px-8 text-[0.9375rem] font-medium text-gesso transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]">
                <IconeWhats className="relative z-10 size-5" /><span className="relative z-10">Enviar pelo WhatsApp</span>
              </a>
              <button type="button" onClick={copiar} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-grafite/25 px-6 text-[0.9375rem] transition-colors hover:border-grafite">
                {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copiado ? 'Copiado!' : 'Copiar resumo'}
              </button>
            </div>
            <p className="mt-4 text-xs text-pedra">Os seus dados ficam no seu dispositivo até tocar em enviar.</p>
            <button type="button" onClick={() => ir(4)} className="mt-5 inline-flex items-center gap-2 text-sm text-pedra hover:text-grafite"><ArrowLeft className="size-4" aria-hidden /> Editar dados</button>
          </div>
        )}
      </div>

      {tentou && erro && <p role="alert" className="mt-6 text-sm font-medium text-red-700">{erro}</p>}

      {!pronto && (
        <div className="mt-10 flex items-center justify-between gap-3">
          <button type="button" onClick={() => ir(passo - 1)} disabled={passo === 0}
            className="inline-flex h-12 items-center gap-2 px-2 text-sm text-pedra transition-colors hover:text-grafite disabled:pointer-events-none disabled:opacity-0">
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </button>
          <button type="button" onClick={avancar}
            className="inline-flex h-14 items-center gap-3 rounded-full bg-grafite px-8 text-[0.9375rem] font-medium text-gesso transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]">
            {passo === N - 1 ? 'Ver resumo' : 'Continuar'} <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
