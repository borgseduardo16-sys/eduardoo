'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { urlWhats, type Textos } from './textos';
import { useLingua, useT } from './lingua';
import { IconeWhats } from './partes';

/*
 * Pedido de proposta (5 passos), 100% no navegador, em PT ou EN conforme a língua do site. NÃO calcula preço:
 * monta um resumo e abre o WhatsApp da Heartmade. Guarda índices (não textos) para sobreviver à troca de língua.
 */

type Estado = {
  evento: number; data: string; semData: boolean; zona: number; espaco: string; convidados: number;
  estilos: number[]; servicos: number[]; valor: number; nome: string; tel: string; email: string; lingua: number; obs: string;
};
const VAZIO: Estado = { evento: -1, data: '', semData: false, zona: -1, espaco: '', convidados: -1, estilos: [], servicos: [], valor: -1, nome: '', tel: '', email: '', lingua: -1, obs: '' };
const CHAVE = 'heartmade-proposta-v1';
const N = 5;

const digitos = (s: string) => s.replace(/\D/g, '');
const limpaTel = (s: string) => s.replace(/[^\d+ ]/g, '').replace(/(?!^)\+/g, '').slice(0, 20);
const emailOk = (s: string) => !s.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const dataFmt = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function montarMensagem(e: Estado, f: Textos['form'], linguaPadrao: number) {
  const m = f.msg;
  const ou = (i: number, l: string[]) => (i >= 0 ? l[i] : m.naoIndicado);
  const lista = (is: number[], l: string[]) => (is.length ? is.map((i) => l[i]).join(', ') : m.naoIndicado);
  const linhas = [
    m.ola,
    '',
    `• ${m.evento}: ${ou(e.evento, f.eventos.map((x) => x.v))}`,
    `• ${m.data}: ${e.semData || !e.data ? m.porDefinir : dataFmt(e.data)}`,
    `• ${m.local}: ${ou(e.zona, f.zonas)}${e.espaco.trim() ? ` — ${e.espaco.trim()}` : ''}`,
    `• ${m.convidados}: ${ou(e.convidados, f.convidadosOp)}`,
    `• ${m.estilo}: ${lista(e.estilos, f.estilos)}`,
    `• ${m.servicos}: ${lista(e.servicos, f.servicosOp)}`,
    `• ${m.valor}: ${ou(e.valor, f.valores)}`,
    `• ${m.nome}: ${e.nome.trim()}`,
    `• ${m.tel}: ${e.tel.trim()}`,
  ];
  if (e.email.trim()) linhas.push(`• ${m.email}: ${e.email.trim()}`);
  linhas.push(`• ${m.lingua}: ${f.linguas[e.lingua >= 0 ? e.lingua : linguaPadrao]}`);
  if (e.obs.trim()) linhas.push('', `${m.mais}: ${e.obs.trim()}`);
  return linhas.join('\n');
}

export function Proposta() {
  const f = useT().form;
  const { l } = useLingua();
  const linguaPadrao = l === 'pt' ? 0 : 1;
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
  const alterna = (k: 'estilos' | 'servicos', v: number) => setE((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((i) => i !== v) : [...x[k], v] }));

  const erro = useMemo(() => {
    if (passo === 0 && e.evento < 0) return f.erros.evento;
    if (passo === 1 && !e.semData) {
      if (!e.data) return f.erros.data;
      if (hoje && e.data < hoje) return f.erros.passada;
    }
    if (passo === 4) {
      if (e.nome.trim().length < 2) return f.erros.nome;
      const d = digitos(e.tel).length;
      if (d < 9 || d > 15) return f.erros.tel;
      if (!emailOk(e.email)) return f.erros.email;
    }
    return '';
  }, [passo, e, hoje, f]);

  const ir = (n: number) => { setVolta(n < passo); setTentou(false); setPasso(n); };
  const avancar = () => { if (erro) return setTentou(true); ir(passo + 1); };
  const mensagem = montarMensagem(e, f, linguaPadrao);
  const pronto = passo === N;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensagem); setCopiado(true); setTimeout(() => setCopiado(false), 2200); } catch { /* sem permissão */ }
  };

  const chip = (ativo: boolean) =>
    `min-h-12 rounded-full border px-5 text-[0.9375rem] transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97] ${
      ativo ? 'border-oliva bg-oliva text-marfim' : 'border-tinta/20 bg-marfim/60 hover:border-oliva/60'
    }`;
  const campo = 'mt-2 h-14 w-full border-0 border-b border-tinta/25 bg-transparent px-1 text-lg placeholder:text-pedra/60 focus:border-oliva focus:outline-none aria-[invalid=true]:border-red-600';
  const rot = 'block text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-pedra';
  const titulo = 'font-[family-name:var(--font-bd)] text-[2.1rem] leading-[1.05] sm:text-[2.9rem]';
  const pergunta = (q: string[]) => <>{q[0]} <em className="text-ouro">{q[1]}</em>{q[2]}</>;

  return (
    <div className="relative mx-auto w-full max-w-4xl bg-[#fbf8f1] p-6 shadow-[0_60px_120px_-60px_rgb(16_20_13/0.45)] sm:p-12">
      <div className="pointer-events-none absolute inset-2 border border-ouro/35 sm:inset-3" aria-hidden />
      <div className="relative">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-4 border-b border-tinta/10 pb-6">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.24em] text-pedra">{pronto ? f.pronto : <>{f.passo} {passo + 1} {f.de} {N} · <span className="text-tinta">{f.titulos[passo]}</span></>}</p>
          <div className="flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={N} aria-valuenow={Math.min(passo, N)} aria-label={f.pronto}>
            {Array.from({ length: N }).map((_, i) => (
              <span key={i} className={`h-[3px] transition-all duration-500 ${i < passo || pronto ? 'w-8 bg-oliva' : i === passo ? 'w-12 bg-ouro' : 'w-8 bg-tinta/12'}`} />
            ))}
          </div>
        </div>

        <div key={passo} className={`etapa ${volta ? 'volta' : ''}`} aria-live="polite">
          {passo === 0 && (
            <fieldset>
              <legend className={titulo}>{pergunta(f.q0)}</legend>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label={f.titulos[0]}>
                {f.eventos.map((a, k) => {
                  const ativo = e.evento === k;
                  return (
                    <button key={k} type="button" role="radio" aria-checked={ativo} onClick={() => set('evento', k)}
                      className={`group relative flex aspect-[3/4] flex-col justify-end overflow-hidden border p-4 text-left transition-[border-color,box-shadow] duration-300 active:scale-[0.98] ${ativo ? 'border-oliva shadow-[0_0_0_2px_#3d4528]' : 'border-tinta/15 hover:border-oliva/50'}`}>
                      {a.img ? <Foto id={a.img} alt="" posicao="50% 45%" className="absolute inset-0 transition-transform duration-700 group-hover:scale-105" /> : <span className="absolute inset-0 bg-gradient-to-b from-linho to-[#dfd4bf]" aria-hidden />}
                      {a.img && <span className="absolute inset-0 bg-gradient-to-t from-noite/85 via-noite/25 to-transparent" aria-hidden />}
                      {ativo && <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-marfim text-oliva"><Check className="size-4" strokeWidth={2.5} aria-hidden /></span>}
                      <span className={`relative font-[family-name:var(--font-bd)] text-xl leading-tight ${a.img ? 'text-marfim' : ''}`}>{a.v}</span>
                      <span className={`relative mt-1.5 text-xs ${a.img ? 'text-marfim/75' : 'text-pedra'}`}>{a.sub}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {passo === 1 && (
            <div>
              <h3 className={titulo}>{pergunta(f.q1)}</h3>
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div>
                  <label className={rot} htmlFor="hm-data">{f.data}</label>
                  <input id="hm-data" type="date" value={e.data} min={hoje || undefined} disabled={e.semData} onChange={(ev) => set('data', ev.target.value)} aria-invalid={tentou && !!erro} className={`${campo} disabled:opacity-40`} />
                  <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem]">
                    <input type="checkbox" checked={e.semData} onChange={(ev) => set('semData', ev.target.checked)} className="size-5 accent-[#3d4528]" />
                    {f.semData}
                  </label>
                </div>
                <div>
                  <label className={rot} htmlFor="hm-espaco">{f.espaco}</label>
                  <input id="hm-espaco" value={e.espaco} onChange={(ev) => set('espaco', ev.target.value)} placeholder={f.espacoPh} className={campo} />
                </div>
              </div>
              <p className={`${rot} mb-3 mt-7`}>{f.local}</p>
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={f.local}>
                {f.zonas.map((z, k) => <button key={k} type="button" role="radio" aria-checked={e.zona === k} onClick={() => set('zona', k)} className={chip(e.zona === k)}>{z}</button>)}
              </div>
            </div>
          )}

          {passo === 2 && (
            <div>
              <h3 className={titulo}>{pergunta(f.q2)}</h3>
              <p className={`${rot} mb-3 mt-8`}>{f.convidados}</p>
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={f.convidados}>
                {f.convidadosOp.map((z, k) => <button key={k} type="button" role="radio" aria-checked={e.convidados === k} onClick={() => set('convidados', k)} className={chip(e.convidados === k)}>{z}</button>)}
              </div>
              <p className={`${rot} mb-3 mt-7`}>{f.estilo}</p>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label={f.estilo}>
                {f.estilos.map((z, k) => <button key={k} type="button" aria-pressed={e.estilos.includes(k)} onClick={() => alterna('estilos', k)} className={chip(e.estilos.includes(k))}>{z}</button>)}
              </div>
            </div>
          )}

          {passo === 3 && (
            <div>
              <h3 className={titulo}>{pergunta(f.q3)}</h3>
              <p className={`${rot} mb-3 mt-8`}>{f.servicos}</p>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label={f.servicos}>
                {f.servicosOp.map((z, k) => <button key={k} type="button" aria-pressed={e.servicos.includes(k)} onClick={() => alterna('servicos', k)} className={chip(e.servicos.includes(k))}>{z}</button>)}
              </div>
              <p className={`${rot} mb-1 mt-8`}>{f.valor}</p>
              <p className="mb-3 text-sm text-pedra">{f.valorNota}</p>
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={f.valor}>
                {f.valores.map((z, k) => <button key={k} type="button" role="radio" aria-checked={e.valor === k} onClick={() => set('valor', k)} className={chip(e.valor === k)}>{z}</button>)}
              </div>
            </div>
          )}

          {passo === 4 && (
            <div>
              <h3 className={titulo}>{pergunta(f.q4)}</h3>
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div>
                  <label className={rot} htmlFor="hm-nome">{f.nome}</label>
                  <input id="hm-nome" value={e.nome} onChange={(ev) => set('nome', ev.target.value)} autoComplete="name" placeholder={f.nomePh} aria-invalid={tentou && e.nome.trim().length < 2} className={campo} />
                </div>
                <div>
                  <label className={rot} htmlFor="hm-tel">{f.tel}</label>
                  <input id="hm-tel" value={e.tel} onChange={(ev) => set('tel', limpaTel(ev.target.value))} inputMode="tel" autoComplete="tel" placeholder={f.telPh} aria-invalid={tentou && (digitos(e.tel).length < 9 || digitos(e.tel).length > 15)} className={campo} />
                </div>
                <div>
                  <label className={rot} htmlFor="hm-email">{f.email}</label>
                  <input id="hm-email" type="email" value={e.email} onChange={(ev) => set('email', ev.target.value)} autoComplete="email" aria-invalid={tentou && !emailOk(e.email)} className={campo} />
                </div>
                <div>
                  <p className={rot}>{f.lingua}</p>
                  <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={f.lingua}>
                    {f.linguas.map((z, k) => {
                      const ativo = (e.lingua >= 0 ? e.lingua : linguaPadrao) === k;
                      return <button key={k} type="button" role="radio" aria-checked={ativo} onClick={() => set('lingua', k)} className={`${chip(ativo)} min-h-10 px-4 text-sm`}>{z}</button>;
                    })}
                  </div>
                </div>
              </div>
              <label className={`${rot} mt-7`} htmlFor="hm-obs">{f.obs}</label>
              <textarea id="hm-obs" value={e.obs} onChange={(ev) => set('obs', ev.target.value)} rows={3} placeholder={f.obsPh}
                className="mt-2 w-full border border-tinta/20 bg-transparent px-4 py-3 text-base placeholder:text-pedra/60 focus:border-oliva focus:outline-none" />
            </div>
          )}

          {pronto && (
            <div>
              <h3 className={titulo}>{f.final[0]} <em className="text-ouro">{e.nome.trim()}</em>{f.final[1]}</h3>
              <p className="mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-pedra">{f.finalSub}</p>
              <pre className="mt-7 max-h-72 overflow-auto whitespace-pre-wrap border-l-2 border-ouro bg-linho/60 p-6 text-left font-sans text-sm leading-relaxed" tabIndex={0} aria-label={f.pronto}>{mensagem}</pre>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a href={urlWhats(mensagem)} target="_blank" rel="noopener"
                  className="k-shine inline-flex h-14 items-center justify-center gap-3 rounded-full bg-oliva px-8 text-[0.9375rem] font-medium text-marfim transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]">
                  <IconeWhats className="relative z-10 size-5" /><span className="relative z-10">{f.enviar}</span>
                </a>
                <button type="button" onClick={copiar} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-tinta/25 px-6 text-[0.9375rem] transition-colors hover:border-oliva">
                  {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copiado ? f.copiado : f.copiar}
                </button>
              </div>
              <p className="mt-4 text-xs text-pedra">{f.privado}</p>
              <button type="button" onClick={() => ir(4)} className="mt-5 inline-flex items-center gap-2 text-sm text-pedra hover:text-tinta"><ArrowLeft className="size-4" aria-hidden /> {f.editar}</button>
            </div>
          )}
        </div>

        {tentou && erro && <p role="alert" className="mt-6 text-sm font-medium text-red-700">{erro}</p>}

        {!pronto && (
          <div className="mt-10 flex items-center justify-between gap-3">
            <button type="button" onClick={() => ir(passo - 1)} disabled={passo === 0}
              className="inline-flex h-12 items-center gap-2 px-2 text-sm text-pedra transition-colors hover:text-tinta disabled:pointer-events-none disabled:opacity-0">
              <ArrowLeft className="size-4" aria-hidden /> {f.voltar}
            </button>
            <button type="button" onClick={avancar}
              className="inline-flex h-14 items-center gap-3 rounded-full bg-oliva px-8 text-[0.9375rem] font-medium text-marfim transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]">
              {passo === N - 1 ? f.resumo : f.continuar} <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
