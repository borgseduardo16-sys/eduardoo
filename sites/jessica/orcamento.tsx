'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { EMPRESA, urlWhats } from './dados';
import { IconeWhats, Ornamento } from './partes';

/*
 * Simulador de evento (5 etapas), 100% no navegador: não calcula preço nem confirma data.
 * Monta um resumo e abre o WhatsApp da Jéssica. Listas = padrão de cerimonial (ajustar aos serviços reais).
 */

const EVENTOS: { v: string; sub: string; img?: string; pos?: string }[] = [
  { v: 'Casamento', sub: 'Cerimônia e recepção', img: 'veu', pos: '45% 50%' },
  { v: 'Mini wedding', sub: 'Celebração intimista', img: 'encantado', pos: '50% 45%' },
  { v: 'Noivado', sub: 'O começo da história', img: 'ipe', pos: '55% 55%' },
  { v: 'Bodas', sub: 'Renovação de votos', img: 'cachorro', pos: '50% 55%' },
  { v: '15 anos', sub: 'Debutante' },
  { v: 'Outro evento', sub: 'Conte no final' },
];
const SERVICOS = [
  { v: 'Assessoria completa', d: 'Do planejamento ao grande dia.' },
  { v: 'Assessoria parcial', d: 'Já comecei a organizar e quero ajuda.' },
  { v: 'Cerimonial do dia', d: 'Coordenação no dia do evento.' },
  { v: 'Ainda não sei', d: 'Quero entender as opções.' },
];
const LOCAL = ['Já tenho o local', 'Ainda estou procurando'];
const CONVIDADOS = ['Até 50', '50 a 100', '100 a 200', '200 a 300', 'Mais de 300', 'Ainda não sei'];
const ESTILOS = ['Clássico', 'Rústico', 'Ao ar livre', 'Moderno', 'Intimista', 'Ainda não defini'];

type Estado = {
  evento: string; servico: string; data: string; semData: boolean; local: string; cidade: string;
  convidados: string; estilos: string[]; nome: string; par: string; whats: string; obs: string;
};
const VAZIO: Estado = { evento: '', servico: '', data: '', semData: false, local: '', cidade: '', convidados: '', estilos: [], nome: '', par: '', whats: '', obs: '' };
const CHAVE = 'jessica-orcamento-v1';
const TITULOS = ['Celebração', 'Serviço', 'Data e local', 'Convidados e estilo', 'Contato'];
const N = 5;

const digitos = (s: string) => s.replace(/\D/g, '');
function mascara(s: string) {
  const d = digitos(s).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const dataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function montarMensagem(e: Estado) {
  const quem = e.par.trim() ? `${e.nome.trim()} e ${e.par.trim()}` : e.nome.trim();
  const l = [
    `Olá, ${EMPRESA.nome}! Pedido de orçamento feito pelo site.`,
    '',
    `• Celebração: ${e.evento}`,
    `• Serviço: ${e.servico || 'não informado'}`,
    `• Data: ${e.semData || !e.data ? 'ainda não definida' : dataBr(e.data)}`,
    `• Local: ${e.local || 'não informado'}${e.cidade.trim() ? ` — ${e.cidade.trim()}` : ''}`,
    `• Convidados: ${e.convidados || 'não informado'}`,
    `• Estilo: ${e.estilos.length ? e.estilos.join(', ') : 'não informado'}`,
    `• Nome: ${quem}`,
    `• WhatsApp: ${e.whats}`,
  ];
  if (e.obs.trim()) l.push('', `Sobre o sonho: ${e.obs.trim()}`);
  return l.join('\n');
}

export function Orcamento() {
  const [e, setE] = useState<Estado>(VAZIO);
  const [passo, setPasso] = useState(0);
  const [volta, setVolta] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [hoje, setHoje] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => {
      setHoje(hojeIso());
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
  const alterna = (v: string) => setE((x) => ({ ...x, estilos: x.estilos.includes(v) ? x.estilos.filter((i) => i !== v) : [...x.estilos, v] }));

  const erro = useMemo(() => {
    if (passo === 0 && !e.evento) return 'Escolha o tipo de celebração para continuar.';
    if (passo === 1 && !e.servico) return 'Escolha o serviço (ou "Ainda não sei").';
    if (passo === 2 && !e.semData) {
      if (!e.data) return 'Escolha uma data ou marque "ainda não temos a data".';
      if (hoje && e.data < hoje) return 'Essa data já passou. Escolha uma data futura.';
    }
    if (passo === 4) {
      if (e.nome.trim().length < 2) return 'Informe seu nome.';
      if (digitos(e.whats).length < 10) return 'Informe um WhatsApp com DDD.';
    }
    return '';
  }, [passo, e, hoje]);

  const ir = (n: number) => { setVolta(n < passo); setTentou(false); setPasso(n); };
  const avancar = () => { if (erro) return setTentou(true); ir(passo + 1); };
  const mensagem = montarMensagem(e);
  const pronto = passo === N;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensagem); setCopiado(true); setTimeout(() => setCopiado(false), 2200); } catch { /* sem permissão */ }
  };

  const chip = (ativo: boolean) =>
    `min-h-12 rounded-full border px-5 text-[0.9375rem] transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97] ${
      ativo ? 'border-cacau bg-cacau text-papel' : 'border-tinta/20 bg-papel/60 text-tinta hover:border-cacau/60'
    }`;
  const campo = 'mt-2 h-14 w-full rounded-full border border-tinta/20 bg-papel px-6 text-base text-tinta placeholder:text-pedra/60 focus:border-cacau focus:outline-none aria-[invalid=true]:border-red-500';
  const rot = 'block text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-pedra';
  const titulo = 'font-serif text-[2.1rem] font-light leading-[1.05] text-tinta sm:text-5xl';

  return (
    <div className="papel mx-auto w-full max-w-3xl rounded-[36px] border border-ouro/25 bg-papel p-6 shadow-[0_50px_100px_-40px_rgb(43_38_34/0.35)] sm:p-11">
      <div className="relative">
        <div className="mb-8 flex flex-col items-center text-center">
          <Ornamento className="h-3 w-40 text-ouro" />
          <p className="mt-4 text-[0.6875rem] font-semibold uppercase tracking-[0.24em] text-pedra">
            {pronto ? 'Seu pedido' : `Etapa ${passo + 1} de ${N} · ${TITULOS[passo]}`}
          </p>
          <div className="mt-4 flex gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={N} aria-valuenow={Math.min(passo, N)} aria-label="Progresso do orçamento">
            {Array.from({ length: N }).map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i < passo || pronto ? 'w-6 bg-cacau' : i === passo ? 'w-10 bg-ouro' : 'w-6 bg-tinta/12'}`} />
            ))}
          </div>
        </div>

        <div key={passo} className={`etapa ${volta ? 'volta' : ''}`} aria-live="polite">
          {passo === 0 && (
            <fieldset>
              <legend className={titulo}>O que vamos <em className="italic text-cacau">celebrar</em>?</legend>
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de celebração">
                {EVENTOS.map((a) => {
                  const ativo = e.evento === a.v;
                  return (
                    <button key={a.v} type="button" role="radio" aria-checked={ativo} onClick={() => set('evento', a.v)}
                      className={`arco group relative flex min-h-[11rem] flex-col items-center justify-end overflow-hidden border p-4 pb-5 text-center transition-[border-color,transform,box-shadow] duration-300 active:scale-[0.98] ${ativo ? 'border-cacau shadow-[0_0_0_2px_#4d5b47]' : 'border-tinta/15 hover:border-cacau/50'}`}>
                      {a.img ? <Foto id={a.img} alt="" posicao={a.pos} className="absolute inset-0 transition-transform duration-700 group-hover:scale-105" /> : <span className="absolute inset-0 bg-gradient-to-b from-blush/70 to-linho" aria-hidden />}
                      {a.img && <span className="absolute inset-0 bg-gradient-to-t from-noite/85 via-noite/30 to-transparent" aria-hidden />}
                      {ativo && <span className="absolute left-1/2 top-4 grid size-7 -translate-x-1/2 place-items-center rounded-full bg-cacau text-papel"><Check className="size-4" strokeWidth={2.5} aria-hidden /></span>}
                      <span className={`relative font-serif text-2xl leading-none ${a.img ? 'text-papel' : 'text-tinta'}`}>{a.v}</span>
                      <span className={`relative mt-1 text-xs ${a.img ? 'text-papel/80' : 'text-pedra'}`}>{a.sub}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {passo === 1 && (
            <fieldset>
              <legend className={titulo}>Que tipo de <em className="italic text-cacau">cuidado</em> você procura?</legend>
              <div className="mt-7 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Serviço">
                {SERVICOS.map((s) => {
                  const ativo = e.servico === s.v;
                  return (
                    <button key={s.v} type="button" role="radio" aria-checked={ativo} onClick={() => set('servico', s.v)}
                      className={`flex min-h-20 items-center gap-4 rounded-[28px] border px-5 py-4 text-left transition-colors duration-300 ${ativo ? 'border-cacau bg-cacau text-papel' : 'border-tinta/15 bg-papel/60 hover:border-cacau/50'}`}>
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${ativo ? 'border-papel bg-papel text-cacau' : 'border-tinta/30'}`}>{ativo && <Check className="size-3.5" strokeWidth={3} aria-hidden />}</span>
                      <span>
                        <span className="block font-serif text-2xl leading-tight">{s.v}</span>
                        <span className={`block text-sm ${ativo ? 'text-papel/80' : 'text-pedra'}`}>{s.d}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {passo === 2 && (
            <div>
              <h3 className={titulo}>Quando e <em className="italic text-cacau">onde</em>?</h3>
              <div className="mt-7 grid gap-6 sm:grid-cols-2">
                <div>
                  <label className={rot} htmlFor="orc-data">Data do evento</label>
                  <input id="orc-data" type="date" value={e.data} min={hoje || undefined} disabled={e.semData} onChange={(ev) => set('data', ev.target.value)} aria-invalid={tentou && !!erro} className={`${campo} disabled:opacity-40`} />
                  <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem]">
                    <input type="checkbox" checked={e.semData} onChange={(ev) => set('semData', ev.target.checked)} className="size-5 accent-[#4d5b47]" />
                    Ainda não temos a data
                  </label>
                </div>
                <div>
                  <label className={rot} htmlFor="orc-cidade">Cidade / local</label>
                  <input id="orc-cidade" value={e.cidade} onChange={(ev) => set('cidade', ev.target.value)} placeholder="Ex.: Araras" className={campo} />
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3" role="radiogroup" aria-label="Local">
                {LOCAL.map((t) => <button key={t} type="button" role="radio" aria-checked={e.local === t} onClick={() => set('local', t)} className={chip(e.local === t)}>{t}</button>)}
              </div>
            </div>
          )}

          {passo === 3 && (
            <div>
              <h3 className={titulo}>Quantos <em className="italic text-cacau">convidados</em> e qual estilo?</h3>
              <p className={`${rot} mb-3 mt-7`}>Convidados</p>
              <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Convidados">
                {CONVIDADOS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.convidados === t} onClick={() => set('convidados', t)} className={chip(e.convidados === t)}>{t}</button>)}
              </div>
              <p className={`${rot} mb-3 mt-7`}>Estilo (pode marcar mais de um)</p>
              <div className="flex flex-wrap gap-3" role="group" aria-label="Estilo">
                {ESTILOS.map((t) => <button key={t} type="button" aria-pressed={e.estilos.includes(t)} onClick={() => alterna(t)} className={chip(e.estilos.includes(t))}>{t}</button>)}
              </div>
            </div>
          )}

          {passo === 4 && (
            <div>
              <h3 className={titulo}>Para quem é o <em className="italic text-cacau">grande dia</em>?</h3>
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={rot} htmlFor="orc-nome">Seu nome</label>
                  <input id="orc-nome" value={e.nome} onChange={(ev) => set('nome', ev.target.value)} autoComplete="name" aria-invalid={tentou && e.nome.trim().length < 2} className={campo} />
                </div>
                <div>
                  <label className={rot} htmlFor="orc-par">Nome do par (opcional)</label>
                  <input id="orc-par" value={e.par} onChange={(ev) => set('par', ev.target.value)} className={campo} />
                </div>
                <div className="sm:col-span-2">
                  <label className={rot} htmlFor="orc-whats">Seu WhatsApp</label>
                  <input id="orc-whats" value={e.whats} onChange={(ev) => set('whats', mascara(ev.target.value))} inputMode="tel" autoComplete="tel" placeholder="(19) 90000-0000" aria-invalid={tentou && digitos(e.whats).length < 10} className={campo} />
                </div>
              </div>
              <label className={`${rot} mt-5`} htmlFor="orc-obs">Conte um pouco do sonho (opcional)</label>
              <textarea id="orc-obs" value={e.obs} onChange={(ev) => set('obs', ev.target.value)} rows={3} placeholder="Ex.: cerimônia ao pôr do sol, decoração com flores brancas…"
                className="mt-2 w-full rounded-[26px] border border-tinta/20 bg-papel px-6 py-4 text-base text-tinta placeholder:text-pedra/60 focus:border-cacau focus:outline-none" />
            </div>
          )}

          {pronto && (
            <div className="text-center">
              <p className="font-[family-name:var(--font-script)] text-5xl text-ouro sm:text-6xl">Que lindo!</p>
              <h3 className="mt-2 font-serif text-3xl font-light sm:text-4xl">Seu pedido está pronto, {e.nome.trim().split(' ')[0]}.</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-pedra">Ao enviar, o WhatsApp da Jéssica abre com a mensagem pronta — é só tocar em enviar.</p>
              <pre className="mx-auto mt-7 max-h-72 max-w-xl overflow-auto whitespace-pre-wrap rounded-[24px] border border-ouro/30 bg-linho/60 p-6 text-left font-sans text-sm leading-relaxed text-tinta" tabIndex={0} aria-label="Resumo do pedido">{mensagem}</pre>
              <div className="mx-auto mt-7 flex max-w-xl flex-col gap-3 sm:flex-row">
                <a href={urlWhats(mensagem)} target="_blank" rel="noopener"
                  className="k-shine inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-full bg-cacau px-7 text-[0.9375rem] font-medium text-papel shadow-[0_18px_40px_-16px_rgb(77_91_71/0.8)] transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98] sm:flex-1">
                  <IconeWhats className="relative z-10 size-5" /><span className="relative z-10">Enviar pelo WhatsApp</span>
                </a>
                <button type="button" onClick={copiar} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-tinta/25 px-6 text-[0.9375rem] transition-colors hover:border-cacau">
                  {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copiado ? 'Copiado!' : 'Copiar resumo'}
                </button>
              </div>
              <p className="mt-4 text-xs text-pedra">Seus dados não vão para servidor nenhum: o pedido só sai quando você toca em enviar.</p>
              <button type="button" onClick={() => ir(4)} className="mt-5 inline-flex items-center gap-2 text-sm text-pedra hover:text-tinta"><ArrowLeft className="size-4" aria-hidden /> Editar dados</button>
            </div>
          )}
        </div>

        {tentou && erro && <p role="alert" className="mt-5 text-center text-sm font-medium text-red-700">{erro}</p>}

        {!pronto && (
          <div className="mt-9 flex items-center justify-between gap-3">
            <button type="button" onClick={() => ir(passo - 1)} disabled={passo === 0}
              className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm text-pedra transition-colors hover:text-tinta disabled:pointer-events-none disabled:opacity-0">
              <ArrowLeft className="size-4" aria-hidden /> Voltar
            </button>
            <button type="button" onClick={avancar}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-tinta px-7 text-[0.9375rem] font-medium text-papel transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]">
              {passo === N - 1 ? 'Ver resumo' : 'Continuar'} <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
