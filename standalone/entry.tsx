import { hydrateRoot } from 'react-dom/client';
import * as React from 'react';
import * as ReactJSX from 'react/jsx-runtime';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import PaginaDeVendas from '@/app/whatsapp-business/page';
import { SmoothScroll } from '@/components/motion/smooth-scroll';

// Compartilhados com a cena 3D (bundle separado, carregado sob demanda).
Object.assign(window, { __React: React, __ReactJSX: ReactJSX, __gsap: gsap, __ScrollTrigger: ScrollTrigger });
gsap.registerPlugin(ScrollTrigger);

window.__carregarCena = () => {
  const codigo = document.getElementById('v-cena')?.textContent ?? '';
  const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
  return import(/* webpackIgnore: true */ url);
};

hydrateRoot(
  document.getElementById('root')!,
  <>
    <SmoothScroll />
    <PaginaDeVendas />
  </>,
);
