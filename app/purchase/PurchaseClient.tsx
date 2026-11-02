'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import s from '@/components/billing.module.css';
import { emitBalance } from '@/components/shadeKey';

type Pkg = { id: string; label: string; usdCents: number; bonusPct: number; highlight: boolean; credits: number };
type Deposit = {
  id: string; status: 'pending' | 'credited' | 'expired'; usd: number; credits: number; sol_usd: number;
  amount_sol: string; address: string; reference: string; solana_pay_url: string; expires_at: string;
  signature: string | null; balance_credits?: number; signature_rejected?: boolean;
};

const KEY_STORE = 'shade_key';
const DEP_STORE = 'shade_open_deposit';
const store = {
  get: (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del: (k: string) => { try { window.localStorage.removeItem(k); } catch { /* storage blocked */ } },
};
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

async function api<T>(path: string, key: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json as T;
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`${s.btn} ${s.ghost} ${s.small}`}
      onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>
      {done ? 'Copied' : label}
    </button>
  );
}

function useCountdown(until?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!until) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [until]);
  if (!until) return '';
  const left = Math.max(0, Date.parse(until) - now);
  const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PurchaseClient({ packages, initialPackage, ready }: { packages: Pkg[]; initialPackage?: string; ready: boolean }) {
  const [key, setKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState(false);       // just created: show the save-your-key warning
  const [keySaved, setKeySaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [pkg, setPkg] = useState(initialPackage);
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdown = useCountdown(deposit?.status === 'pending' ? deposit.expires_at : undefined);

  const refreshBalance = useCallback(async (k: string) => {
    try { const a = await api<{ balance_credits: number }>('/api/account', k); setBalance(a.balance_credits); }
    catch (e) { setError((e as Error).message); }
  }, []);

  // Restore key and any open deposit after a refresh.
  useEffect(() => {
    const k = store.get(KEY_STORE);
    if (!k) return;
    setKey(k); setKeySaved(true);
    refreshBalance(k);
    const dep = store.get(DEP_STORE);
    if (dep) api<Deposit>(`/api/deposits/${dep}`, k).then((d) => { if (d.status === 'pending') setDeposit(d); else store.del(DEP_STORE); }).catch(() => store.del(DEP_STORE));
  }, [refreshBalance]);

  // Poll the chain while a deposit is pending.
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!key || !deposit || deposit.status !== 'pending') return;
    const tick = async () => {
      try {
        const d = await api<Deposit>(`/api/deposits/${deposit.id}`, key);
        setDeposit(d);
        if (d.status !== 'pending') { store.del(DEP_STORE); if (d.balance_credits !== undefined) { setBalance(d.balance_credits); emitBalance(d.balance_credits); } }
      } catch { /* keep polling */ }
    };
    pollRef.current = setInterval(tick, 6000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [key, deposit?.id, deposit?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createKey() {
    setBusy(true); setError('');
    try {
      const r = await api<{ key: string; balance_credits: number }>('/api/account', null, { method: 'POST' });
      store.set(KEY_STORE, r.key);
      setKey(r.key); setNewKey(true); setKeySaved(false); setShowKey(true); setBalance(r.balance_credits);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function importKey() {
    const k = importValue.trim();
    if (!k) return;
    setBusy(true); setError('');
    try {
      const a = await api<{ balance_credits: number }>('/api/account', k);
      store.set(KEY_STORE, k); setKey(k); setKeySaved(true); setBalance(a.balance_credits); setImporting(false); setImportValue('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  function forgetKey() {
    if (!confirm('Remove the key from this browser? Make sure you saved it, or the credits on it are lost.')) return;
    store.del(KEY_STORE); store.del(DEP_STORE);
    setKey(null); setBalance(null); setDeposit(null); setNewKey(false); setShowKey(false);
  }

  async function startDeposit() {
    if (!key || !pkg) return;
    setBusy(true); setError('');
    try {
      const d = await api<Deposit>('/api/deposits', key, { method: 'POST', body: JSON.stringify({ package_id: pkg }) });
      store.set(DEP_STORE, d.id); setDeposit(d);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function claimSignature() {
    if (!key || !deposit || !sig.trim()) return;
    setBusy(true); setError('');
    try {
      const d = await api<Deposit>(`/api/deposits/${deposit.id}`, key, { method: 'POST', body: JSON.stringify({ signature: sig.trim() }) });
      setDeposit(d);
      if (d.status === 'credited') { store.del(DEP_STORE); if (d.balance_credits !== undefined) setBalance(d.balance_credits); setSig(''); }
      else if (d.signature_rejected) setError('That transaction doesn’t match this purchase yet. Check it sent the exact amount to the address above, or wait a few seconds for it to confirm.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const step = !key || !keySaved ? 1 : !deposit ? 2 : deposit.status === 'credited' ? 4 : 3;
  const chosen = packages.find((p) => p.id === pkg);

  return (
    <main className={s.page}>
      <div className={s.narrow}>
        <span className={s.eyebrow}><span className={s.dot} /> No wallet connect</span>
        <h1 className={s.title}>Buy <em>credits</em></h1>
        <p className={s.lead}>Get a key, pick a pack, send SOL. Your credits show up here as soon as the transfer confirms.</p>

        <div className={s.steps}>
          {['Your key', 'Pick a pack', 'Send SOL', 'Done'].map((label, i) => (
            <span key={label} className={`${s.step} ${step === i + 1 ? s.stepOn : step > i + 1 ? s.stepDone : ''}`}>{i + 1}. {label}</span>
          ))}
        </div>

        {!ready && <div className={`${s.notice} ${s.warn}`}>Purchases aren&apos;t switched on yet. Check back soon.</div>}
        {error && <div className={`${s.notice} ${s.err}`} role="alert">{error}</div>}

        {/* Step 1: key */}
        <div className={s.card} style={{ marginTop: 16 }}>
          {!key ? (
            <>
              <h2 className={s.h2}>Your key</h2>
              <p className={s.fine}>Your key is your account: it holds your credits and works as your API key. No email, no sign-up.</p>
              {!importing ? (
                <div className={s.row}>
                  <button className={`${s.btn} ${s.primary}`} onClick={createKey} disabled={busy || !ready}>Create my key</button>
                  <button className={`${s.btn} ${s.ghost}`} onClick={() => setImporting(true)}>I already have a key</button>
                </div>
              ) : (
                <>
                  <label className={s.label} htmlFor="import-key">Paste your key</label>
                  <div className={s.field}>
                    <input id="import-key" className={`${s.input} ${s.mono}`} value={importValue} onChange={(e) => setImportValue(e.target.value)} placeholder="shade_sk_…" autoComplete="off" spellCheck={false} />
                    <button className={`${s.btn} ${s.primary} ${s.small}`} onClick={importKey} disabled={busy}>Use key</button>
                  </div>
                  <button className={`${s.btn} ${s.ghost} ${s.small}`} style={{ marginTop: 10 }} onClick={() => setImporting(false)}>Cancel</button>
                </>
              )}
            </>
          ) : (
            <>
              <div className={s.balance}>
                <div>
                  <div className={s.pkgName}>Balance</div>
                  <div className={s.balanceNum}>{balance === null ? '…' : `${fmt(balance)} credits`}</div>
                  {balance !== null && <div className={s.fine}>≈ ${fmt(balance / 1000)}</div>}
                </div>
                <div className={s.row} style={{ marginTop: 0 }}>
                  <button className={`${s.btn} ${s.ghost} ${s.small}`} onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide key' : 'Show key'}</button>
                  <button className={`${s.btn} ${s.ghost} ${s.small}`} onClick={forgetKey}>Use another key</button>
                </div>
              </div>
              {showKey && (
                <div className={s.field}>
                  <div className={`${s.codeBox} ${s.mono}`}>{key}</div>
                  <CopyButton value={key} />
                </div>
              )}
              {newKey && !keySaved && (
                <div className={`${s.notice} ${s.warn}`}>
                  Save this key now, in a password manager or somewhere safe. It&apos;s the only way back to your credits, we can&apos;t recover it, and anyone who has it can spend them.
                  <div className={s.row}><button className={`${s.btn} ${s.primary} ${s.small}`} onClick={() => { setKeySaved(true); setShowKey(false); }}>I saved my key</button></div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Step 2: package */}
        {key && keySaved && !deposit && (
          <div className={s.card} style={{ marginTop: 16 }}>
            <h2 className={s.h2}>Pick a pack</h2>
            <div className={s.pkgPick}>
              {packages.map((p) => (
                <button key={p.id} type="button" className={`${s.pkgBtn} ${pkg === p.id ? s.pkgOn : ''}`} onClick={() => setPkg(p.id)} aria-pressed={pkg === p.id}>
                  <div className={s.pkgName}>{p.label}</div>
                  <div className={s.pkgPrice}>${fmt(p.usdCents / 100)}</div>
                  <div className={s.credits}>{fmt(p.credits)} credits{p.bonusPct ? ` · +${p.bonusPct}%` : ''}</div>
                </button>
              ))}
            </div>
            <button className={`${s.btn} ${s.primary} ${s.full}`} onClick={startDeposit} disabled={busy || !pkg || !ready}>
              {busy ? 'Getting your address…' : `Pay ${chosen ? `$${fmt(chosen.usdCents / 100)}` : ''} in SOL`}
            </button>
            <p className={s.fine} style={{ marginTop: 10 }}>The SOL amount is locked at the live price for 30 minutes.</p>
          </div>
        )}

        {/* Step 3: pay */}
        {key && deposit && deposit.status === 'pending' && (
          <div className={s.card} style={{ marginTop: 16 }}>
            <h2 className={s.h2}>Send exactly {deposit.amount_sol} SOL</h2>
            <p className={s.fine}>${fmt(deposit.usd)} at ${fmt(deposit.sol_usd)}/SOL · {fmt(deposit.credits)} credits · expires in {countdown}</p>
            <div className={s.payGrid} style={{ marginTop: 16 }}>
              <div className={s.qr} aria-label="Solana Pay QR code"><QRCodeSVG value={deposit.solana_pay_url} size={196} level="M" /></div>
              <div>
                <span className={s.label} style={{ marginTop: 0 }}>Amount (exact)</span>
                <div className={s.field}><div className={`${s.codeBox} ${s.mono}`}>{deposit.amount_sol} SOL</div><CopyButton value={deposit.amount_sol} /></div>
                <span className={s.label}>Deposit address</span>
                <div className={s.field}><div className={`${s.codeBox} ${s.mono}`}>{deposit.address}</div><CopyButton value={deposit.address} /></div>
                <div className={s.row}><a className={`${s.btn} ${s.primary} ${s.small}`} href={deposit.solana_pay_url}>Open in wallet</a></div>
              </div>
            </div>
            <div className={s.status}><span className={s.pulse} /> Waiting for your transfer… this page updates on its own.</div>
            <div className={`${s.notice} ${s.warn}`}>
              Scanning the QR sends the right amount for you. Sending by hand? Send the exact amount, including every decimal, so we can match it to this purchase. Send SOL on Solana mainnet only.
            </div>
            <details style={{ marginTop: 16 }}>
              <summary className={s.fine} style={{ cursor: 'pointer' }}>Sent it but nothing&apos;s happening? Paste your transaction signature</summary>
              <div className={s.field}>
                <input className={`${s.input} ${s.mono}`} value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Transaction signature" autoComplete="off" spellCheck={false} />
                <button className={`${s.btn} ${s.primary} ${s.small}`} onClick={claimSignature} disabled={busy || !sig.trim()}>Check</button>
              </div>
            </details>
            <button className={`${s.btn} ${s.ghost} ${s.small}`} style={{ marginTop: 16 }}
              onClick={() => { if (confirm('Cancel this purchase? Only do this if you have NOT sent SOL for it.')) { store.del(DEP_STORE); setDeposit(null); } }}>
              Cancel purchase
            </button>
          </div>
        )}

        {/* Step 4: done / expired */}
        {key && deposit && deposit.status === 'credited' && (
          <div className={s.card} style={{ marginTop: 16 }}>
            <div className={`${s.notice} ${s.okBox}`} style={{ marginTop: 0 }}>Payment received. {fmt(deposit.credits)} credits added to your key.</div>
            <div className={s.row}>
              <Link className={`${s.btn} ${s.primary}`} href="/chat">Start chatting</Link>
              <button className={`${s.btn} ${s.ghost}`} onClick={() => setDeposit(null)}>Buy more</button>
            </div>
            {deposit.signature && <p className={s.fine} style={{ marginTop: 12 }}>Transaction: <a className={s.mono} style={{ color: 'inherit' }} href={`https://solscan.io/tx/${deposit.signature}`} target="_blank" rel="noreferrer">{deposit.signature.slice(0, 20)}…</a></p>}
          </div>
        )}
        {key && deposit && deposit.status === 'expired' && (
          <div className={s.card} style={{ marginTop: 16 }}>
            <div className={`${s.notice} ${s.err}`} style={{ marginTop: 0 }}>This purchase expired before a matching transfer arrived. If you already sent SOL, keep your transaction signature and use the Support link at the bottom of the page.</div>
            <button className={`${s.btn} ${s.primary} ${s.full}`} onClick={() => setDeposit(null)}>Start a new purchase</button>
          </div>
        )}
      </div>
    </main>
  );
}
