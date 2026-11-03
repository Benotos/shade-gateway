'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import c from './chat.module.css';
import { emitBalance, getKey } from '@/components/shadeKey';
import Markdown from '@/components/Markdown';

type Model = { id: string; name: string; vendor: string; description: string; tag: string; free: boolean; inputCreditsPerM: number; outputCreditsPerM: number };
type Msg = { role: 'user' | 'assistant'; content: string; meta?: string; model?: string };
type Err = { message: string; code?: string };
type Shade = { charged_credits: number; balance_credits: number | null; free: boolean };

const NEEDS_PURCHASE = new Set(['insufficient_credits', 'invalid_key', 'free_limit_reached']);
const MODEL_STORE = 'shade_model';
const store = {
  get: (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const fmtCredits = (n: number) => (n < 0.01 ? '<0.01' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));

/** Rough cost of a typical message (~1,000 tokens in, ~500 out). */
const typical = (m: Model) => (m.inputCreditsPerM * 1000 + m.outputCreditsPerM * 500) / 1_000_000;

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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const k = getKey();
    setKey(k);
    fetch('/api/config').then((r) => r.json()).then((cfg) => {
      const list: Model[] = cfg.models ?? [];
      setModels(list);
      const saved = store.get(MODEL_STORE);
      const usable = (m: Model) => m.free || Boolean(k);
      const pick = list.find((m) => m.id === saved && usable(m))
        ?? (k ? list.find((m) => !m.free) : list.find((m) => m.free)) ?? list[0];
      setModel(pick?.id ?? '');
    }).catch(() => setError({ message: 'Could not load models. Refresh the page.' }));
    if (k) {
      fetch('/api/account', { headers: { Authorization: `Bearer ${k}` } })
        .then((r) => (r.ok ? r.json() : null)).then((a) => a && setBalance(a.balance_credits)).catch(() => {});
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const groups = useMemo(() => {
    const map = new Map<string, Model[]>();
    for (const m of models) {
      const g = m.free ? 'Free' : m.vendor;
      map.set(g, [...(map.get(g) ?? []), m]);
    }
    return [...map.entries()];
  }, [models]);

  const current = models.find((m) => m.id === model);
  const needsKey = current && !current.free && !key;

  function choose(id: string) {
    setModel(id);
    store.set(MODEL_STORE, id);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !model || !current) return;
    setError(null);
    const history: Msg[] = [...messages, { role: 'user', content: text }];
    const name = current.name;
    setMessages([...history, { role: 'assistant', content: '', model: name }]);
    setInput(''); setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let got = '';
    const update = (content: string, meta?: string) =>
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content, meta, model: name }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model, stream: true, messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError({ message: data?.error?.message || `Request failed (${res.status})`, code: data?.error?.code });
        setMessages(messages); setInput(text); // put the message back so nothing is lost
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', shade: Shade | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            if (chunk.error) setError({ message: chunk.error.message, code: chunk.error.code });
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) { got += delta; update(got); }
            if (chunk.shade) shade = chunk.shade;
          } catch { /* ignore partial line */ }
        }
      }
      const meta = shade ? (shade.free ? `${name} · free` : `${name} · ${fmtCredits(shade.charged_credits)} credits`) : name;
      update(got || '_No answer was returned. You were not charged for an empty reply._', meta);
      if (shade && typeof shade.balance_credits === 'number') { setBalance(shade.balance_credits); emitBalance(shade.balance_credits); }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        update(got || '_Stopped._', `${name} · stopped`);
        if (key) {
          fetch('/api/account', { headers: { Authorization: `Bearer ${key}` } })
            .then((r) => (r.ok ? r.json() : null)).then((a) => { if (a) { setBalance(a.balance_credits); emitBalance(a.balance_credits); } }).catch(() => {});
        }
      } else {
        setError({ message: 'Network error. Check your connection and try again.' });
        if (!got) { setMessages(messages); setInput(text); }
      }
    } finally {
      abortRef.current = null;
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
            <select value={model} onChange={(e) => choose(e.target.value)} className={c.select} disabled={busy}>
              {groups.map(([g, list]) => (
                <optgroup key={g} label={g}>
                  {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className={c.barRight}>
            {key ? (
              <span className={c.balance}>{balance === null ? '…' : balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} credits</span>
            ) : (
              <span className={c.balance}>No key, free model only</span>
            )}
            {messages.length > 0 && !busy && <button className="cta ctaGhost" onClick={() => { setMessages([]); setError(null); }}>New chat</button>}
          </div>
        </div>
        {current && (
          <p className={c.modelDesc}>
            <span className={c.vendor}>{current.vendor}</span> {current.description}
            {!current.free && <> About {fmtCredits(typical(current))} credits for a typical message.</>}
          </p>
        )}

        <div className={c.thread}>
          {messages.length === 0 && (
            <div className={c.empty}>
              <img src="/shade-mark.svg" alt="" width={56} height={56} />
              <h1>Ask anything</h1>
              <p>Nothing you type here is saved. Close the tab and it&apos;s gone.</p>
            </div>
          )}
          {messages.map((m, i) => {
            const last = i === messages.length - 1;
            const waiting = busy && last && m.role === 'assistant' && !m.content;
            return (
              <div key={i} className={m.role === 'user' ? c.user : c.assistant}>
                {waiting ? (
                  <div className={`${c.bubble} ${c.thinking}`}><span /><span /><span /></div>
                ) : (
                  <div className={`${c.bubble} ${m.role === 'assistant' ? c.md : ''}`}>
                    {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
                    {busy && last && m.role === 'assistant' && <span className={c.caret} aria-hidden="true" />}
                  </div>
                )}
                {m.meta && <div className={c.meta}>{m.meta}</div>}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {error && (
          <div className={c.error} role="alert">
            {error.message}
            {error.code && NEEDS_PURCHASE.has(error.code) && <> <Link href="/purchase">Buy credits</Link></>}
          </div>
        )}
        {needsKey && !error && (
          <div className={c.error}>This model needs credits. <Link href="/purchase">Get a key</Link> or switch to the free model.</div>
        )}

        <form className={c.composer} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            ref={boxRef}
            className={c.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={current ? `Message ${current.name}…` : 'Message SHADE…'}
            rows={1}
            disabled={busy}
            aria-label="Message"
          />
          {busy ? (
            <button type="button" className="cta ctaGhost" onClick={() => abortRef.current?.abort()}>Stop</button>
          ) : (
            <button type="submit" className="cta ctaPrimary" disabled={!input.trim() || Boolean(needsKey)}>Send</button>
          )}
        </form>
      </div>
    </main>
  );
}