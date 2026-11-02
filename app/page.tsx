import Link from 'next/link';
import s from '@/components/billing.module.css';
import h from '@/components/home.module.css';
import LiveStats from '@/components/LiveStats';
import { creditsPerM, pricedModels } from '@/lib/catalog';
import { freeDailyLimit } from '@/lib/config';

export const revalidate = 3600;

export default async function Home() {
  const models = await pricedModels();
  return (
    <main className={s.page} style={{ paddingTop: 56 }}>
      <div className={s.wrap}>
        <section className={h.hero}>
          <span className={s.eyebrow}><span className={s.dot} /> Beta · private by default</span>
          <h1 className={h.heroTitle}>Top AI models.<br /><em>Paid in SOL. No account.</em></h1>
          <p className={h.heroLead}>
            One site and one API for the best AI models. Send SOL, get credits, start chatting.
            No email, no card, no sign-up, no wallet connect.
          </p>
          <div className={h.heroCtas}>
            <Link href="/chat" className="cta ctaPrimary ctaLg">Try it free</Link>
            <Link href="/purchase" className="cta ctaGhost ctaLg">Buy credits</Link>
          </div>
          <p className={s.fine} style={{ marginTop: 14 }}>{freeDailyLimit()} free messages a day. No SOL needed to try.</p>
        </section>

        <LiveStats />

        <section className={s.section}>
          <h2 className={s.h2}>How it works</h2>
          <p className={s.sub}>First message in under a minute.</p>
          <div className={s.grid3}>
            {[
              ['01', 'Send SOL', 'Pick a credit pack and scan the QR with any Solana wallet. No wallet connect.'],
              ['02', 'Get a key', 'Your key holds your credits. It works in the chat and as your API key.'],
              ['03', 'Use any model', 'Chat on the site or call the API. You only pay for the tokens you use.'],
            ].map(([n, t, d]) => (
              <div key={n} className={s.card}>
                <div className={h.stepNum}>{n}</div>
                <h3 className={h.cardTitle}>{t}</h3>
                <p className={s.fine}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>Models</h2>
          <p className={s.sub}>Switch any time. Full rates on the <Link href="/pricing" style={{ color: 'var(--accent)' }}>pricing page</Link>.</p>
          <div className={h.models}>
            {models.map((m) => (
              <div key={m.id} className={s.card}>
                <div className={h.modelTop}><strong>{m.name}</strong><span className={s.tag}>{m.tag}</span></div>
                <p className={s.fine} style={{ margin: '8px 0 12px' }}>{m.description}</p>
                <div className={h.modelPrice}>
                  {m.free ? 'Free · rate limited' : `${creditsPerM(m.inputPerM).toLocaleString()} / ${creditsPerM(m.outputPerM).toLocaleString()} credits per 1M tokens`}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={s.section}>
          <div className={h.devGrid}>
            <div>
              <h2 className={s.h2}>Built for developers and agents</h2>
              <p className={s.sub}>OpenAI-compatible. Swap the base URL and key, keep your code. AI agents can pay per call with no credit card.</p>
              <Link href="/docs" className="cta ctaGhost">Read the API docs</Link>
            </div>
            <pre className={h.code}>{`from openai import OpenAI

client = OpenAI(
    base_url="https://shade-gateway.vercel.app/v1",
    api_key="shade_sk_...",
)

r = client.chat.completions.create(
    model="fast",
    messages=[{"role": "user", "content": "gm"}],
)
print(r.choices[0].message.content)`}</pre>
          </div>
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>What &ldquo;private&rdquo; means here</h2>
          <p className={s.sub}>We only claim what we can stand behind.</p>
          <div className={s.split}>
            <div className={s.card}>
              <h3 className={h.cardTitle}>What we do</h3>
              <ul className={s.list}>
                <li>No accounts, emails or cards. Your key is your account.</li>
                <li>We don&apos;t store your prompts or answers.</li>
                <li>Paid models only go to providers that don&apos;t store or train on prompts.</li>
                <li>IP addresses are hashed for rate limits, never stored.</li>
              </ul>
            </div>
            <div className={s.card}>
              <h3 className={h.cardTitle}>What we can&apos;t promise</h3>
              <ul className={s.list}>
                <li>The model provider still processes your prompt to answer it.</li>
                <li>The free model may log prompts. Don&apos;t send anything sensitive on it.</li>
                <li>SOL payments are public on-chain, like any Solana transfer.</li>
                <li>A fully private tier on our own GPUs is coming later.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
