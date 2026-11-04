'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getKey, onBalance } from './shadeKey';

const links = [
  { href: '/', label: 'Home' },
  { href: '/chat', label: 'Chat' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'API' },
];

const xUrl = 'https://x.com/ShadeAi_';

export default function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const tokenCa = process.env.NEXT_PUBLIC_TOKEN_CA || 'EfXpXYHgE8G6139N4rNrRFjudtjSbhyXj1dLrZRPpump';
  const copyCa = async () => {
    if (!tokenCa) return;
    try { await navigator.clipboard.writeText(tokenCa); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  };

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const key = getKey();
    if (key) {
      fetch('/api/account', { headers: { Authorization: `Bearer ${key}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((a) => a && setBalance(a.balance_credits))
        .catch(() => {});
    }
    return onBalance(setBalance);
  }, [path]);

  return (
    <nav className="nav">
      <div className="navInner">
        <Link href="/" className="brand"><img src="/shade-mark.svg" alt="" /> SHADE</Link>
        <div className={`navLinks ${open ? 'open' : ''}`}>
          {links.map((l) => <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>{l.label}</Link>)}
        </div>
        <div className="navRight">
          {balance !== null && <span className="navBal"><strong>{balance.toLocaleString('en-US', { maximumFractionDigits: 1 })}</strong> credits</span>}
          <a href="https://github.com/Benotos/shade-gateway" className="cta ctaGhost navSocial" target="_blank" rel="noreferrer">GitHub</a>
          <a href={xUrl} className="cta ctaGhost navSocial" target="_blank" rel="noreferrer">X</a>
          {tokenCa && <button type="button" className="cta ctaGhost navSocial" onClick={copyCa} aria-label="Copy SHADE contract address" title="Copy SHADE contract address">{copied ? 'Copied!' : 'Copy CA'}</button>}
          <Link href="/purchase" className="cta ctaPrimary">Buy credits</Link>
          <button className="menuBtn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>☰</button>
        </div>
      </div>
    </nav>
  );
}
