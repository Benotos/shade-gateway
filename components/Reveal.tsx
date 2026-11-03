'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Rises into place the first time it scrolls into view. Instant under reduced motion (CSS).
export default function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.dataset.shown = 'true'; io.disconnect(); }
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className ?? ''}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}