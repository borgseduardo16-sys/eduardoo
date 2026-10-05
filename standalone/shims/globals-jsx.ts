type J = typeof import('react/jsx-runtime');
const J = (window as unknown as { __ReactJSX: J }).__ReactJSX;
export const { jsx, jsxs, Fragment } = J;
