'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { EMPRESA, urlWhats } from './dados';
import { IconeWhats } from './partes';

/*
 * Simulador de festa (5 passos), 100% no navegador, em português de Portugal. NÃO calcula preço nem confirma data:
 * monta um resumo e abre o WhatsApp da loja. O "valor de referência" em € é opcional e serve só para orientar a proposta.
 */

const FESTAS: { v: string; sub: string; img?: string; pos?: string }[] = [
  { v: 'Aniversário', sub: '1.º ano, infantil ou adulto', img: 'duarte', pos: '50% 55%' },
  { v: 'Batizado', sub: 'Cerimónia e festa', img: 'caixa', pos: '50% 55%' },
  { v: 'Baby shower', sub: 'Chá de bebé e revelação', img: 'lua', pos: '50% 50%' },
  { v: 'Jantar ou almoço', sub: 'Mesa posta à medida', img: 'mesa', pos: '45% 60%' },
  { v: 'Casamento', sub: 'Detalhes e mesas' },
  { v: 'Outra celebração', sub: 'Conte-nos no fim' },
];
const ZONAS = ['Barcelos', 'Braga', 'Guimarães', 'Viana do Castelo', 'Outra localidade'];
const CONVIDADOS = ['Até 20', '20 a 50', '50 a 100', 'Mais de 100', 'Ainda não sei'];
const CORES = ['Azul e branco', 'Tons neutros e dourado', 'Rosa suave', 'Verde e eucalipto', 'Cores vivas', 'Ainda não decidi'];
const ESTILOS = ['Ursinhos e peluches', 'Boho', 'Clássico', 'Minimalista', 'Temático'];
const SERVICOS = ['Cenário e painel', 'Mesa do bolo e doces', 'Balões', 'Lembranças para convidados', 'Decoração de mesas', 'Flores'];
const VALORES = ['Até 300 €', '300 a 600 €', '600 a 1 000 €', 'Mais de 1 000 €', 'Prefiro não indicar'];

type Estado = {
  festa: string; data: string; semData: boolean; zona: string; local: string; convidados: string;
  cores: string[]; estilos: string[]; servicos: string[]; valor: string; nome: string; tel: string; obs: string;
};
const VAZIO: Estado = { festa: '', data: '', semData: false, zona: '', local: '', convidados: '', cores: [], estilos: [], servicos: [], valor: '', nome: '', tel: '', obs: '' };
const CHAVE = 'truz-orcamento-v1';
const TITULOS = ['A festa', 'Data e local', 'Tema e cores', 'Serviços', 'Contacto'];
const N = 5;

const digitos = (s: string) => s.replace(/\D/g, '');
/** Telemóvel português: 9 dígitos, ex.: 937 294 987 (aceita +351 à frente). */
function mascara(s: string) {
  let d = digitos(s);
  if (d.startsWith('351') && d.length > 9) d = d.slice(3);
  d = d.slice(0, 9);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(' ');
}
const dataPt = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function montarMensagem(e: Estado) {
  const l = [
    `Olá, ${EMPRESA.curto}! Pedido de orçamento feito pelo site.`,
    '',
    `• Festa: ${e.festa}`,
    `• Data: ${e.semData || !e.data ? 'ainda por definir' : dataPt(e.data)}`,
    `• Local: ${e.zona || 'não indicado'}${e.local.trim() ? ` — ${e.local.trim()}` : ''}`,
    `• Convidados: ${e.convidados || 'não indicado'}`,
    `• Cores: ${e.cores.length ? e.cores.join(', ') : 'não indicadas'}`,
    `• Estilo: ${e.estilos.length ? e.estilos.join(', ') : 'não indicado'}`,
    `• Serviços pretendidos: ${e.servicos.length ? e.servicos.join(', ') : 'por definir'}`,
    `• Valor de referência: ${e.valor || 'não indicado'}`,
    `• Nome: ${e.nome.trim()}`,
    `• Telemóvel: ${e.tel}`,
  ];
  if (e.obs.trim()) l.push('', `Mais detalhes: ${e.obs.trim()}`);
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
  const alterna = (k: 'cores' | 'estilos' | 'servicos', v: string) =>
    setE((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((i) => i !== v) : [...x[k], v] }));

  const erro = useMemo(() => {
    if (passo === 0 && !e.festa) return 'Escolha o tipo de festa para continuar.';
    if (passo === 1 && !e.semData) {
      if (!e.data) return 'Escolha uma data ou marque "ainda não tenho data".';
      if (hoje && e.data < hoje) return 'Essa data já passou. Escolha uma data futura.';
    }
    if (passo === 4) {
      if (e.nome.trim().length < 2) return 'Indique o seu nome.';
      if (digitos(e.tel).length < 9) return 'Indique um telemóvel com 9 dígitos.';
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
      ativo ? 'border-azul-esc bg-azul-esc text-creme' : 'border-tinta/20 bg-creme/70 hover:border-azul-esc/60'
    }`;
  const campo = 'mt-2 h-14 w-full rounded-full border border-tinta/20 bg-creme px-6 text-base placeholder:text-pedra/60 focus:border-azul-esc focus:outline-none aria-[invalid=true]:border-red-500';
  const rot = 'block text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-pedra';
  const titulo = 'font-[family-name:var(--font-fr)] text-[2rem] font-light leading-[1.08] sm:text-[2.6rem]';

  return (
    <div className="papel mx-auto w-full max-w-3xl rounded-[36px] border border-ouro/30 bg-creme p-6 shadow-[0_50px_100px_-40px_rgb(47_42_38/0.35)] sm:p-11">
      <div className="relative">
        <div className="mb-8 flex flex-col items-center text-center">
          <p className="font-[family-name:var(--font-script)] text-3xl text-caramelo">truz, truz…</p>
          <p className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.24em] text-pedra">{pronto ? 'O seu pedido' : `Passo ${passo + 1} de ${N} · ${TITULOS[passo]}`}</p>
          <div className="mt-4 flex gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={N} aria-valuenow={Math.min(passo, N)} aria-label="Progresso do pedido">
            {Array.from({ length: N }).map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i < passo || pronto ? 'w-6 bg-azul-esc' : i === passo ? 'w-10 bg-ouro' : 'w-6 bg-tinta/12'}`} />
            ))}
          </div>
        </div>

        <div key={passo} className={`etapa ${volta ? 'volta' : ''}`} aria-live="polite">
          {passo === 0 && (
            <fieldset>
              <legend className={titulo}>Que festa vamos <em className="italic text-azul-esc">surpreender</em>?</legend>
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de festa">
                {FESTAS.map((a) => {
                  const ativo = e.festa === a.v;
                  return (
                    <button key={a.v} type="button" role="radio" aria-checked={ativo} onClick={() => set('festa', a.v)}
                      className={`arco group relative flex min-h-[11rem] flex-col items-center justify-end overflow-hidden border p-4 pb-5 text-center transition-[border-color,transform,box-shadow] duration-300 active:scale-[0.98] ${ativo ? 'border-azul-esc shadow-[0_0_0_2px_#4b7392]' : 'border-tinta/15 hover:border-azul-esc/50'}`}>
                      {a.img ? <Foto id={a.img} alt="" posicao={a.pos} className="absolute inset-0 transition-transform duration-700 group-hover:scale-105" /> : <span className="absolute inset-0 bg-gradient-to-b from-mimo/80 to-areia" aria-hidden />}
                      {a.img && <span className="absolute inset-0 bg-gradient-to-t from-noite/85 via-noite/30 to-transparent" aria-hidden />}
                      {ativo && <span className="absolute left-1/2 top-4 grid size-7 -translate-x-1/2 place-items-center rounded-full bg-azul-esc text-creme"><Check className="size-4" strokeWidth={2.5} aria-hidden /></span>}
                      <span className={`relative font-[family-name:var(--font-fr)] text-xl leading-tight ${a.img ? 'text-creme' : ''}`}>{a.v}</span>
                      <span className={`relative mt-1 text-xs ${a.img ? 'text-creme/80' : 'text-pedra'}`}>{a.sub}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {passo === 1 && (
            <div>
              <h3 className={titulo}>Quando e <em className="italic text-azul-esc">onde</em>?</h3>
              <div className="mt-7 grid gap-6 sm:grid-cols-2">
                <div>
                  <label className={rot} htmlFor="orc-data">Data da festa</label>
                  <input id="orc-data" type="date" value={e.data} min={hoje || undefined} disabled={e.semData} onChange={(ev) => set('data', ev.target.value)} aria-invalid={tentou && !!erro} className={`${campo} disabled:opacity-40`} />
                  <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem]">
                    <input type="checkbox" checked={e.semData} onChange={(ev) => set('semData', ev.target.checked)} className="size-5 accent-[#4b7392]" />
                    Ainda não tenho data
                  </label>
                </div>
                <div>
                  <label className={rot} htmlFor="orc-local">Espaço ou localidade</label>
                  <input id="orc-local" value={e.local} onChange={(ev) => set('local', ev.target.value)} placeholder="Ex.: Quinta em Barcelos" className={campo} />
                </div>
              </div>
              <p className={`${rot} mb-3 mt-7`}>Concelho</p>
              <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Concelho">
                {ZONAS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.zona === t} onClick={() => set('zona', t)} className={chip(e.zona === t)}>{t}</button>)}
              </div>
              <p className={`${rot} mb-3 mt-7`}>Número de convidados</p>
              <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Convidados">
                {CONVIDADOS.map((t) => <button key={t} type="button" role="radio" aria-checked={e.convidados === t} onClick={() => set('convidados', t)} className={chip(e.convidados === t)}>{t}</button>)}
              </div>
            </div>
          )}

          {passo === 2 && (
            <div>
              <h3 className={titulo}>Que <em className="italic text-azul-esc">cores e estilo</em> imagina?</h3>
              <p className={`${rot} mb-3 mt-7`}>Cores (pode escolher várias)</p>
              <div className="flex flex-wrap gap-3" role="group" aria-label="Cores">
                {CORES.map((t) => <button key={t} type="button" aria-pressed={e.cores.includes(t)} onClick={() => alterna('cores', t)} className={chip(e.cores.includes(t))}>{t}</button>)}
              </div>
              <p className={`${rot} mb-3 mt-7`}>Estilo</p>
              <div className="flex flex-wrap gap-3" role="group" aria-label="Estilo">
                {ESTILOS.map((t) => <button key={t} type="button" aria-pressed={e.estilos.includes(t)} onClick={() => alterna('estilos', t)} className={chip(e.estilos.includes(t))}>{t}</button>)}
              </div>
            </div>
          )}

          {passo === 3 && (
            <div>
              <h3 className={titulo}>O que gostava de <em className="italic text-azul-esc">ter na festa</em>?</h3>
              <p className="mt-3 text-sm text-pedra">Marque o que quiser consultar. Respondemos o que está disponível e como funciona.</p>
              <div className="mt-6 flex flex-wrap gap-3" role="group" aria-label="Serviços">
                {SERVICOS.map((t) => <button key={t} type="button" aria-pressed={e.servicos.includes(t)} onClick={() => alterna('servicos', t)} className={chip(e.servicos.includes(t))}>{t}</button>)}
              </div>
              <p className={`${rot} mb-1 mt-8`}>Valor de referência (opcional)</p>
              <p className="mb-3 text-sm text-pedra">Ajuda-nos a propor algo que faça sentido. Não é um compromisso.</p>
              <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Valor de referência">
                {VALORES.map((t) => <button key={t} type="button" role="radio" aria-checked={e.valor === t} onClick={() => set('valor', t)} className={chip(e.valor === t)}>{t}</button>)}
              </div>
            </div>
          )}

          {passo === 4 && (
            <div>
              <h3 className={titulo}>Como podemos <em className="italic text-azul-esc">falar consigo</em>?</h3>
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={rot} htmlFor="orc-nome">O seu nome</label>
                  <input id="orc-nome" value={e.nome} onChange={(ev) => set('nome', ev.target.value)} autoComplete="name" aria-invalid={tentou && e.nome.trim().length < 2} className={campo} />
                </div>
                <div>
                  <label className={rot} htmlFor="orc-tel">Telemóvel</label>
                  <input id="orc-tel" value={e.tel} onChange={(ev) => set('tel', mascara(ev.target.value))} inputMode="tel" autoComplete="tel" placeholder="9xx xxx xxx" aria-invalid={tentou && digitos(e.tel).length < 9} className={campo} />
                </div>
              </div>
              <label className={`${rot} mt-5`} htmlFor="orc-obs">Quer contar mais? (opcional)</label>
              <textarea id="orc-obs" value={e.obs} onChange={(ev) => set('obs', ev.target.value)} rows={3} placeholder="Ex.: o tema é o espaço, o nome da criança, uma cor especial…"
                className="mt-2 w-full rounded-[26px] border border-tinta/20 bg-creme px-6 py-4 text-base placeholder:text-pedra/60 focus:border-azul-esc focus:outline-none" />
            </div>
          )}

          {pronto && (
            <div className="text-center">
              <p className="font-[family-name:var(--font-script)] text-5xl text-caramelo sm:text-6xl">Surpresa!</p>
              <h3 className="mt-2 font-[family-name:var(--font-fr)] text-3xl font-light sm:text-4xl">O pedido está pronto, {e.nome.trim().split(' ')[0]}.</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-pedra">Ao enviar, o WhatsApp abre com a mensagem pronta — basta tocar em enviar.</p>
              <pre className="mx-auto mt-7 max-h-72 max-w-xl overflow-auto whitespace-pre-wrap rounded-[24px] border border-ouro/30 bg-areia/60 p-6 text-left font-sans text-sm leading-relaxed" tabIndex={0} aria-label="Resumo do pedido">{mensagem}</pre>
              <div className="mx-auto mt-7 flex max-w-xl flex-col gap-3 sm:flex-row">
                <a href={urlWhats(mensagem)} target="_blank" rel="noopener"
                  className="k-shine inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-full bg-azul-esc px-7 text-[0.9375rem] font-medium text-creme shadow-[0_18px_40px_-16px_rgb(75_115_146/0.8)] transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98] sm:flex-1">
                  <IconeWhats className="relative z-10 size-5" /><span className="relative z-10">Enviar pelo WhatsApp</span>
                </a>
                <button type="button" onClick={copiar} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-tinta/25 px-6 text-[0.9375rem] transition-colors hover:border-azul-esc">
                  {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copiado ? 'Copiado!' : 'Copiar resumo'}
                </button>
              </div>
              <p className="mt-4 text-xs text-pedra">Os seus dados não saem do seu dispositivo: o pedido só segue quando tocar em enviar.</p>
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
              className="inline-flex h-12 items-center gap-2 rounded-full bg-tinta px-7 text-[0.9375rem] font-medium text-creme transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]">
              {passo === N - 1 ? 'Ver resumo' : 'Continuar'} <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
