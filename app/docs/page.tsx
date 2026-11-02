import type { Metadata } from 'next';
import Link from 'next/link';
import s from '@/components/billing.module.css';
import h from '@/components/home.module.css';
import { pricedModels } from '@/lib/catalog';

export const metadata: Metadata = { title: 'API docs · SHADE', description: 'OpenAI-compatible API, paid per call in SOL credits.' };
export const revalidate = 3600;

const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://shade-gateway.vercel.app').replace(/\/+$/, '');

export default async function Docs() {
  const models = await pricedModels();
  return (
    <main className={s.page} style={{ paddingTop: 56 }}>
      <div className={s.narrow}>
        <span className={s.eyebrow}><span className={s.dot} /> OpenAI-compatible</span>
        <h1 className={s.title}>API <em>docs</em></h1>
        <p className={s.lead}>Use SHADE from any OpenAI SDK, script or AI agent. Every call is charged from your key&apos;s credits.</p>

        <section className={s.section}>
          <h2 className={s.h2}>1. Get a key</h2>
          <p className={s.sub}>Buy credits on the <Link href="/purchase" style={{ color: 'var(--accent)' }}>purchase page</Link>. Your key (<code>shade_sk_…</code>) is shown there. Keep it secret.</p>
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>2. Make a request</h2>
          <pre className={h.code}>{`curl ${base}/v1/chat/completions \\
  -H "Authorization: Bearer shade_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"fast","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
          <p className={s.sub} style={{ marginTop: 18 }}>JavaScript:</p>
          <pre className={h.code}>{`import OpenAI from 'openai';

const client = new OpenAI({ baseURL: '${base}/v1', apiKey: process.env.SHADE_KEY });
const r = await client.chat.completions.create({
  model: 'fast',
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(r.choices[0].message.content);`}</pre>
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>Models</h2>
          <div className={s.tableWrap}>
            <table className={s.table} style={{ minWidth: 0 }}>
              <thead><tr><th>model</th><th>Name</th><th>Use for</th></tr></thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id}><td className={s.mono}>{m.id}</td><td>{m.name}</td><td className={s.fine}>{m.description}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.fine} style={{ marginTop: 10 }}>Live list with prices: <code>GET {base}/v1/models</code></p>
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>Responses and billing</h2>
          <p className={s.sub}>Responses follow the OpenAI format, plus a <code>shade</code> field:</p>
          <pre className={h.code}>{`"shade": { "charged_credits": 0.42, "balance_credits": 20981.6, "free": false }`}</pre>
          <ul className={s.list}>
            <li>1,000 credits = $1. You pay for the exact tokens used; failed calls are free.</li>
            <li>Check your balance: <code>GET /api/account</code> with your key.</li>
            <li>Limits: 60 requests per minute per key, 4,096 output tokens per request.</li>
            <li>Streaming isn&apos;t supported yet. Send <code>stream: false</code> (the default).</li>
          </ul>
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>Errors</h2>
          <div className={s.tableWrap}>
            <table className={s.table} style={{ minWidth: 0 }}>
              <thead><tr><th>Status</th><th>code</th><th>Meaning</th></tr></thead>
              <tbody>
                {[
                  ['401', 'invalid_key', 'Missing or wrong key'],
                  ['402', 'insufficient_credits', 'Top up on the purchase page'],
                  ['429', 'rate_limited', 'Too many requests, slow down'],
                  ['400', 'unknown_model', 'Use an id from /v1/models'],
                  ['502/503', 'provider_error', 'Model busy or down, not charged'],
                ].map(([a, b, d]) => <tr key={b}><td className={s.num}>{a}</td><td className={s.mono}>{b}</td><td className={s.fine}>{d}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
