// A cena 3D (bundle separado) reutiliza o GSAP do bundle principal em vez de carregar outra cópia.
const g = (window as unknown as { __gsap: typeof import('gsap').gsap }).__gsap;
export const gsap = g;
export default g;
