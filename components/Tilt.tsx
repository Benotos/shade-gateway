'use client';

import { useRef, type ReactNode } from 'react';

// 3D tilt that follows the pointer, with a light sheen where the pointer is.
// Off for touch screens and reduced motion (handled in CSS).
export default function Tilt({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * max}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * max}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.dataset.active = 'true';
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.dataset.active = 'false';
  };
  return (
    <div ref={ref} className={`tilt ${className ?? ''}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="tiltInner">{children}</div>
    </div>
  );
}