// A cena 3D usa o MESMO React do bundle principal (duas cópias quebrariam os hooks).
type R = typeof import('react');
const R = (window as unknown as { __React: R }).__React;
export default R;
export const { useEffect, useRef, useState, useMemo, useCallback, createElement, Fragment } = R;
