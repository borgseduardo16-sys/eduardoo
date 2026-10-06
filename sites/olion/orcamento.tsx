'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { EMPRESA, urlWhats } from './dados';
import { IconeWhats } from './partes';

/*
 * Simulador de evento: pedido em 6 etapas, 100% no navegador. NÃO calcula preço nem confirma data
 * (a Casa Olion responde depois); monta um resumo e abre o WhatsApp da casa com tudo preenchido.
 * As listas abaixo são o padrão de cerimoniais — ajustar quando o cliente informar seus serviços reais.
 */

type Tipo = { v: string; sub: string; img?: string };
const TIPOS: Tipo[] = [
  { v: 'Casamento', sub: 'Cerimônia e/ou recepção', img: 'arcos' },
  { v: 'Aniversário', sub: 'Adulto, família e amigos', img: 'piscina' },
  { v: 'Festa infantil', sub: 'Temática e decorada', img: 'mesa' },
  { v: 'Debutante (15 anos)', sub: 'Baile e recepção', img: 'noite' },
  { v: 'Formatura', sub: 'Colação e comemoração', img: 'salao' },
  { v: 'Confraternização', sub: 'Empresa, turma ou família' },
  { v: 'Chá de bebê / revelação', sub: 'Encontros íntimos' },
  { v: 'Outro evento', sub: 'Conte no final' },
];
const PERIODOS = ['Manhã / almoço', 'Tarde', 'Noite', 'Ainda não sei'];
const CONVIDADOS = ['Até 50', '50 a 100', '100 a 200', 'Mais de 200', 'Ainda não sei'];
const ESPACOS = ['Salão envidraçado', 'Área da piscina', 'Jardim e alameda', 'Gramado amplo', 'Quero visitar o espaço'];
const SERVICOS = ['Decoração', 'Buffet / alimentação', 'Bolo e doces', 'Som e iluminação', 'Fotografia e vídeo', 'Cerimonial / assessoria', 'Recepção e segurança', 'Bebidas / bar'];

type Estado = {
  tipo: string; data: string; semData: boolean; periodo: string; convidados: string;
  espacos: string[]; servicos: string[]; nome: string; whats: string; obs: string;
};
const VAZIO: Estado = { tipo: '', data: '', semData: false, periodo: '', convidados: '', espacos: [], servicos: [], nome: '', whats: '', obs: '' };
const CHAVE = 'olion-orcamento-v1';
const TITULOS = ['Celebração', 'Data', 'Convidados', 'Espaços', 'Serviços', 'Contato'];

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
  const l = [
    `Olá, ${EMPRESA.nome}! Pedido de orçamento feito pelo site.`,
    '',
    `• Celebração: ${e.tipo}`,
    `• Data: ${e.semData || !e.data ? 'ainda não definida' : dataBr(e.data)}`,
    `• Período: ${e.periodo || 'não informado'}`,
    `• Convidados: ${e.convidados || 'não informado'}`,
    `• Espaços de interesse: ${e.espacos.length ? e.espacos.join(', ') : 'não informado'}`,
    `• Serviços que gostaria de ter: ${e.servicos.length ? e.servicos.join(', ') : 'nenhum por enquanto'}`,
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
  const [hoje, setHoje] = useState('');

  useEffect(() => {
    // depois da hidratação (o HTML pré-renderizado parte do estado vazio)
    const id = window.setTimeout(() => {
      setHoje(hojeIso());
      try {
        const salvo = localStorage.getItem(CHAVE);
        if (salvo) setE({ ...VAZIO, ...JSON.parse(salvo) });
      } catch { /* sem armazenamento: segue sem rascunho */ }
      setCarregado(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!carregado) return;
    try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* ignora */ }
  }, [e, carregado]);

  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setE((x) => ({ ...x, [k]: v }));
  const alterna = (k: 'espacos' | 'servicos', v: string) =>
    setE((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((i) => i !== v) : [...x[k], v] }));

  const erro = useMemo(() => {
    if (passo === 0 && !e.tipo) return 'Escolha o tipo de celebração para continuar.';
    if (passo === 1 && !e.semData) {
      if (!e.data) return 'Escolha uma data ou marque "ainda não defini a data".';
      if (hoje && e.data < hoje) return 'Essa data já passou. Escolha uma data futura.';
    }
    if (passo === 5) {
      if (e.nome.trim().length < 2) return 'Informe seu nome.';
      if (digitos(e.whats).length < 10) return 'Informe um WhatsApp com DDD.';
    }
    return '';
  }, [passo, e, hoje]);

  const ir = (n: number) => { setVolta(n < passo); setTentou(false); setPasso(n); };
  const avancar = () => { if (erro) return setTentou(true); ir(passo + 1); };
  const mensagem = montarMensagem(e);
  const link = urlWhats(mensagem);
  const pronto = passo === 6;

  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensagem); setCopiado(true); setTimeout(() => setCopiado(false), 2200); } catch { /* sem permissão */ }
  };
  const recomecar = () => { setE(VAZIO); setVolta(true); setPasso(0); };

  const chip = (ativo: boolean) =>
    `min-h-12 rounded-full border px-5 text-[0.9375rem] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97] ${
      ativo ? 'border-ouro bg-ouro text-noite' : 'border-white/20 text-marfim hover:border-ouro/70'
    }`;
  const campo = 'mt-2 h-14 w-full rounded-2xl border border-white/20 bg-noite/50 px-5 text-base text-marfim placeholder:text-marfim/35 focus:border-ouro focus:outline-none aria-[invalid=true]:border-red-400';
  const rot = 'block text-sm font-semibold uppercase tracking-[0.16em] text-marfim/60';
  const titulo = 'font-serif text-3xl font-light leading-tight text-marfim sm:text-4xl';

  return (
    <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-white/10 bg-floresta/80 p-5 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.8)] backdrop-blur-md sm:p-9">
      <div className="mb-7">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-marfim/60">
          <span>{pronto ? 'Resumo' : `Etapa ${passo + 1} de 6 · ${TITULOS[passo]}`}</span>
          {passo > 0 && !pronto && <button type="button" onClick={recomecar} className="underline-offset-4 hover:underline">Recomeçar</button>}
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={6} aria-valuenow={Math.min(passo, 6)} aria-label="Progresso do orçamento">
          <div className="h-full origin-left rounded-full bg-ouro transition-transform duration-500 ease-[var(--ease-out-soft)]" style={{ transform: `scaleX(${(pronto ? 6 : passo + 1) / 6})` }} />
        </div>
      </div>

      <div key={passo} className={`etapa ${volta ? 'volta' : ''}`} aria-live="polite">
        {passo === 0 && (
          <fieldset>
            <legend className={titulo}>Qual celebração você quer fazer?</legend>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de celebração">
              {TIPOS.map((a) => {
                const ativo = e.tipo === a.v;
                return (
                  <button key={a.v} type="button" role="radio" aria-checked={ativo} onClick={() => set('tipo', a.v)}
                    className={`group relative flex min-h-[8.5rem] flex-col justify-end overflow-hidden rounded-2xl border p-3 text-left transition-[border-color,transform] duration-300 active:scale-[0.98] ${ativo ? 'border-ouro' : 'border-white/15 hover:border-ouro/60'}`}>
                    {a.img ? <Foto id={a.img} alt="" className={`absolute inset-0 transition-transform duration-700 group-hover:scale-105 ${ativo ? 'opacity-100' : 'opacity-70'}`} /> : <span className="absolute inset-0 bg-gradient-to-br from-floresta to-noite" aria-hidden />}
                    <span className={`absolute inset-0 ${ativo ? 'bg-gradient-to-t from-noite/95 via-noite/45 to-noite/10' : 'bg-gradient-to-t from-noite/95 via-noite/60 to-noite/30'}`} aria-hidden />
                    {ativo && <span className="absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full bg-ouro text-noite"><Check className="size-3.5" strokeWidth={3} aria-hidden /></span>}
                    <span className="relative text-[0.9375rem] font-semibold leading-tight text-marfim">{a.v}</span>
                    <span className="relative mt-0.5 text-xs leading-snug text-marfim/65">{a.sub}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {passo === 1 && (
          <div>
            <h3 className={titulo}>Para quando é o seu evento?</h3>
            <p className="mt-3 text-sm text-marfim/65">A disponibilidade da data é confirmada pela equipe.</p>
            <label className={`${rot} mt-6`} htmlFor="orc-data">Data do evento</label>
            <input id="orc-data" type="date" value={e.data} min={hoje || undefined} disabled={e.semData} onChange={(ev) => set('data', ev.target.value)}
              aria-invalid={tentou && !!erro} className={`${campo} max-w-xs disabled:opacity-40 [color-scheme:dark]`} />
            <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 text-[0.9375rem] text-marfim/85">
              <input type="checkbox" checked={e.semData} onChange={(ev) => set('semData', ev.target.checked)} className="size-5 accent-[#dcc08a]" />
              Ainda não defini a data
            </label>
            <p className={`${rot} mb-3 mt-7`}>Período do dia</p>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Período">
              {PERIODOS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.periodo === t} onClick={() => set('periodo', t)} className={chip(e.periodo === t)}>{t}</button>)}
            </div>
          </div>
        )}

        {passo === 2 && (
          <fieldset>
            <legend className={titulo}>Quantos convidados você espera?</legend>
            <p className="mt-3 text-sm text-marfim/65">Um número aproximado já ajuda a equipe a indicar o melhor espaço.</p>
            <div className="mt-6 flex flex-wrap gap-3" role="radiogroup" aria-label="Convidados">
              {CONVIDADOS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.convidados === t} onClick={() => set('convidados', t)} className={chip(e.convidados === t)}>{t}</button>)}
            </div>
          </fieldset>
        )}

        {passo === 3 && (
          <div>
            <h3 className={titulo}>Quais espaços te interessam?</h3>
            <p className="mt-3 text-sm text-marfim/65">Pode marcar mais de um.</p>
            <div className="mt-6 flex flex-wrap gap-3" role="group" aria-label="Espaços">
              {ESPACOS.map((t) => <button key={t} type="button" aria-pressed={e.espacos.includes(t)} onClick={() => alterna('espacos', t)} className={chip(e.espacos.includes(t))}>{t}</button>)}
            </div>
          </div>
        )}

        {passo === 4 && (
          <div>
            <h3 className={titulo}>O que você gostaria de ter no evento?</h3>
            <p className="mt-3 text-sm text-marfim/65">Marque o que quiser consultar. A equipe responde o que está disponível e como funciona.</p>
            <div className="mt-6 flex flex-wrap gap-3" role="group" aria-label="Serviços">
              {SERVICOS.map((t) => <button key={t} type="button" aria-pressed={e.servicos.includes(t)} onClick={() => alterna('servicos', t)} className={chip(e.servicos.includes(t))}>{t}</button>)}
            </div>
          </div>
        )}

        {passo === 5 && (
          <div>
            <h3 className={titulo}>Como a gente fala com você?</h3>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className={rot} htmlFor="orc-nome">Seu nome</label>
                <input id="orc-nome" value={e.nome} onChange={(ev) => set('nome', ev.target.value)} autoComplete="name" aria-invalid={tentou && e.nome.trim().length < 2} className={campo} />
              </div>
              <div>
                <label className={rot} htmlFor="orc-whats">Seu WhatsApp</label>
                <input id="orc-whats" value={e.whats} onChange={(ev) => set('whats', mascara(ev.target.value))} inputMode="tel" autoComplete="tel" placeholder="(66) 90000-0000" aria-invalid={tentou && digitos(e.whats).length < 10} className={campo} />
              </div>
            </div>
            <label className={`${rot} mt-5`} htmlFor="orc-obs">Quer contar mais? (opcional)</label>
            <textarea id="orc-obs" value={e.obs} onChange={(ev) => set('obs', ev.target.value)} rows={3} placeholder="Ex.: cerimônia ao pôr do sol, tema jardim encantado…"
              className="mt-2 w-full rounded-2xl border border-white/20 bg-noite/50 px-5 py-4 text-base text-marfim placeholder:text-marfim/35 focus:border-ouro focus:outline-none" />
          </div>
        )}

        {pronto && (
          <div>
            <h3 className={titulo}>Tudo certo, {e.nome.split(' ')[0]}!</h3>
            <p className="mt-3 text-sm leading-relaxed text-marfim/70">Confira o resumo. Ao enviar, o WhatsApp da {EMPRESA.nome} abre com a mensagem pronta — basta tocar em enviar.</p>
            <pre className="mt-6 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-noite/60 p-5 font-sans text-sm leading-relaxed text-marfim/90" tabIndex={0} aria-label="Resumo do pedido">{mensagem}</pre>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a href={link} target="_blank" rel="noopener"
                className="k-shine inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-full bg-ouro px-7 text-[0.9375rem] font-semibold text-noite shadow-[0_18px_50px_-14px_rgb(220_192_138/0.55)] transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98] sm:flex-1">
                <IconeWhats className="relative z-10 size-5" /><span className="relative z-10">Enviar pelo WhatsApp</span>
              </a>
              <button type="button" onClick={copiar} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-white/25 px-6 text-[0.9375rem] font-medium text-marfim transition-colors hover:border-ouro/70">
                {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copiado ? 'Copiado!' : 'Copiar resumo'}
              </button>
            </div>
            <p className="mt-4 text-xs text-marfim/50">O site não envia seus dados a servidor nenhum: o pedido só sai quando você toca em enviar no WhatsApp.</p>
          </div>
        )}
      </div>

      {tentou && erro && <p role="alert" className="mt-5 text-sm font-medium text-red-300">{erro}</p>}

      {!pronto && (
        <div className="mt-8 flex items-center justify-between gap-3">
          <button type="button" onClick={() => ir(passo - 1)} disabled={passo === 0}
            className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-marfim/75 transition-colors hover:text-marfim disabled:pointer-events-none disabled:opacity-0">
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </button>
          <button type="button" onClick={avancar}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-marfim px-7 text-[0.9375rem] font-semibold text-noite transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]">
            {passo === 5 ? 'Ver resumo' : 'Continuar'} <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {pronto && <div className="mt-6"><button type="button" onClick={() => ir(5)} className="inline-flex items-center gap-2 text-sm font-medium text-marfim/75 hover:text-marfim"><ArrowLeft className="size-4" aria-hidden /> Editar dados</button></div>}
    </div>
  );
}
