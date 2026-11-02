'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import c from './chat.module.css';
import { emitBalance, getKey } from '@/components/shadeKey';

type Model = { id: string; name: string; description: string; tag: string; free: boolean; inputCreditsPerM: number; outputCreditsPerM: number };
type Msg = { role: 'user' | 'assistant'; content: string; meta?: string };
type Err = { message: string; code?: string };

const NEEDS_PURCHASE = new Set(['insufficient_credits', 'invalid_key', 'free_limit_reached']);

export default function ChatClient() {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]); // kept in memory only, gone on refresh
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Err | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const k = getKey();
    setKey(k);
    fetch('/api/config').then((r) => r.json()).then((cfg) => {
      const list: Model[] = cfg.models ?? [];
      setModels(list);
      setModel(k ? (list.find((m) => !m.free)?.id ?? list[0]?.id ?? '') : (list.find((m) => m.free)?.id ?? list[0]?.id ?? ''));
    }).catch(() => setError({ message: 'Could not load models. Refresh the page.' }));
    if (k) {
      fetch('/api/account', { headers: { Authorization: `Bearer ${k}` } })
        .then((r) => (r.ok ? r.json() : null)).then((a) => a && setBalance(a.balance_credits)).catch(() => {});
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const current = models.find((m) => m.id === model);
  const needsKey = current && !current.free && !key;

  async function send() {
    const text = input.trim();
    if (!text || busy || !model) return;
    setError(null);
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model, messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: data?.error?.message || `Request failed (${res.status})`, code: data?.error?.code });
        setMessages(messages); setInput(text); // put the message back so nothing is lost
        return;
      }
      const charged = data.shade?.charged_credits;
      const meta = data.shade?.free ? `${current?.name} · free` : `${current?.name} · ${charged < 0.01 ? '<0.01' : Number(charged).toFixed(2)} credits`;
      setMessages([...next, { role: 'assistant', content: data.content ?? '', meta }]);
      if (typeof data.shade?.balance_credits === 'number') { setBalance(data.shade.balance_credits); emitBalance(data.shade.balance_credits); }
    } catch {
      setError({ message: 'Network error. Check your connection and try again.' });
      setMessages(messages); setInput(text);
    } finally {
      setBusy(false);
      boxRef.current?.focus();
    }
  }

  return (
    <main className={c.page}>
      <div className={c.shell}>
        <div className={c.bar}>
          <label className={c.modelPick}>
            <span className={c.barLabel}>Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className={c.select}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}{m.free ? ' (free)' : ''}</option>)}
            </select>
          </label>
          <div className={c.barRight}>
            {key ? (
              <span className={c.balance}>{balance === null ? '…' : balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} credits</span>
            ) : (
              <span className={c.balance}>No key · free model only</span>
            )}
            {messages.length > 0 && <button className="cta ctaGhost" onClick={() => { setMessages([]); setError(null); }}>New chat</button>}
          </div>
        </div>
        {current && <p className={c.modelDesc}>{current.description}{current.free ? ' · may log prompts, don’t send anything sensitive' : ''}</p>}

        <div className={c.thread}>
          {messages.length === 0 && (
            <div className={c.empty}>
              <img src="/shade-mark.svg" alt="" width={56} height={56} />
              <h1>Ask anything</h1>
              <p>Nothing you type here is saved. Close the tab and it&apos;s gone.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? c.user : c.assistant}>
              <div className={c.bubble}>{m.content}</div>
              {m.meta && <div className={c.meta}>{m.meta}</div>}
            </div>
          ))}
          {busy && <div className={c.assistant}><div className={`${c.bubble} ${c.thinking}`}><span /><span /><span /></div></div>}
          <div ref={endRef} />
        </div>

        {error && (
          <div className={c.error} role="alert">
            {error.message}
            {error.code && NEEDS_PURCHASE.has(error.code) && <> <Link href="/purchase">Buy credits →</Link></>}
          </div>
        )}
        {needsKey && !error && (
          <div className={c.error}>This model needs credits. <Link href="/purchase">Get a key →</Link> or switch to the free model.</div>
        )}

        <form className={c.composer} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            ref={boxRef}
            className={c.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message SHADE…"
            rows={1}
            disabled={busy}
          />
          <button type="submit" className="cta ctaPrimary" disabled={busy || !input.trim() || Boolean(needsKey)}>Send</button>
        </form>
      </div>
    </main>
  );
}
