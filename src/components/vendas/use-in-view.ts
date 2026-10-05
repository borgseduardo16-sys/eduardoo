'use client';

import { useEffect, useRef, useState } from 'react';

/** true na primeira vez que o elemento cruza `margin` da viewport (e para de observar). */
export function useInViewOnce<T extends Element>(margin = '0px 0px -15% 0px') {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisto(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, visto] as const;
}
