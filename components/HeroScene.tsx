'use client';

import dynamic from 'next/dynamic';

// Loads the 3D scene only in the browser, after the page is interactive.
const ShadeCore = dynamic(() => import('./ShadeCore'), { ssr: false, loading: () => null });

export default function HeroScene({ className }: { className?: string }) {
  return <ShadeCore className={className} />;
}