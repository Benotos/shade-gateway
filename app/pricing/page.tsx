import type { Metadata } from 'next';
import Link from 'next/link';
import s from '@/components/billing.module.css';
import { creditsPerM, pricedModels } from '@/lib/catalog';
import { freeDailyLimit, getPackages, packageCreditUnits, unitsToCredits } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Pricing · SHADE',
  description: 'Pay per call in SOL. No account, no email, no card.',
};
export const revalidate = 3600;

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export default async function PricingPage() {
  const models = await pricedModels();
  const packages = getPackages();
  const paid = models.filter((m) => !m.free);
  const free = models.find((m) => m.free);

  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <header className={s.center}>
          <span className={s.eyebrow}><span className={s.dot} /> Pay per use · SOL</span>
          <h1 className={s.title}>Top AI models.<br /><em>No account. No card.</em></h1>
          <p className={s.lead}>
            Send SOL, get credits, use them in the chat or through the API. You only pay for the tokens you use,
            and credits never expire. 1,000 credits = $1.
          </p>
        </header>

        <section className={s.section}>
          <h2 className={s.h2}>Credit packs</h2>
          <p className={s.sub}>Paid in SOL at the live rate when you check out. No wallet connect: you get a deposit address and QR.</p>
          <div className={s.grid3}>
            {packages.map((p) => (
              <div key={p.id} className={`${s.card} ${p.highlight ? s.cardHi : ''}`}>
                {p.highlight && <span className={s.badge}>Most picked</span>}
                <div className={s.pkgName}>{p.label}</div>
                <div className={s.price}>{usd(p.usdCents)}</div>
                <div className={s.credits}>
                  {fmt(unitsToCredits(packageCreditUnits(p)))} credits{p.bonusPct ? ` · +${p.bonusPct}% bonus` : ''}
                </div>
                <Link href={`/purchase?pkg=${encodeURIComponent(p.id)}`} className={`${s.btn} ${p.highlight ? s.primary : s.ghost} ${s.full}`}>
                  Buy with SOL
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>Model rates</h2>
          <p className={s.sub}>Credits per 1 million tokens. A typical chat message (~1,000 tokens in, ~500 out) is shown for scale.</p>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>Model</th><th>Input / 1M</th><th>Output / 1M</th><th>Typical message</th></tr>
              </thead>
              <tbody>
                {paid.map((m) => {
                  const inC = creditsPerM(m.inputPerM), outC = creditsPerM(m.outputPerM);
                  const typical = (inC * 1000 + outC * 500) / 1_000_000;
                  return (
                    <tr key={m.id}>
                      <td><strong>{m.name}</strong><span className={s.tag}>{m.tag}</span><div className={s.modelDesc}>{m.description}</div></td>
                      <td className={s.num}>{fmt(inC)}</td>
                      <td className={s.num}>{fmt(outC)}</td>
                      <td className={s.num}>≈ {typical < 0.01 ? '<0.01' : fmt(typical)} credits</td>
                    </tr>
                  );
                })}
                {free && (
                  <tr>
                    <td><strong>{free.name}</strong><span className={s.tag}>FREE</span><div className={s.modelDesc}>{free.description}</div></td>
                    <td className={s.num}>0</td>
                    <td className={s.num}>0</td>
                    <td className={s.num}>{freeDailyLimit()} messages / day</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className={s.fine} style={{ marginTop: 12 }}>
            Rates follow the model providers&apos; prices and can change. If a model call fails, you are not charged.
          </p>
        </section>

        <section className={s.section}>
          <div className={s.split}>
            <div className={s.card}>
              <h3 className={s.h2}>Paid models</h3>
              <ul className={s.list}>
                <li>No account, email or card. Your key is your account.</li>
                <li>We don&apos;t store prompts or answers. We keep only token counts and cost, so your balance adds up.</li>
                <li>Requests are routed only to providers that don&apos;t store or train on prompts.</li>
                <li>The model provider still processes your prompt to answer it.</li>
              </ul>
            </div>
            <div className={s.card}>
              <h3 className={s.h2}>Free tier</h3>
              <ul className={s.list}>
                <li>{freeDailyLimit()} messages a day on an open model, no SOL needed.</li>
                <li>Runs on a free provider endpoint that may log prompts. Don&apos;t send anything sensitive.</li>
                <li>Paid credits are never spent on the free model.</li>
              </ul>
            </div>
            <div className={s.card}>
              <span className={s.soon}>Coming later</span>
              <h3 className={s.h2} style={{ marginTop: 6 }}>Private tier</h3>
              <ul className={s.list}>
                <li>Open models on GPUs we run, so prompts never reach a third party.</li>
                <li>Not live yet. We&apos;ll announce it when it is.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className={s.section}>
          <h2 className={s.h2}>Questions</h2>
          <div className={s.faq}>
            <details><summary>How do I pay?</summary><p>Pick a pack, scan the QR with any Solana wallet (Phantom, Solflare, Backpack…) or send the exact amount shown to the address. Credits appear on the page once the transfer confirms, usually within a minute.</p></details>
            <details><summary>What is my key?</summary><p>When you buy, the site creates a secret key (shade_sk_…). It holds your credits and works as your API key. Save it somewhere safe: we can&apos;t recover it, and anyone with it can spend your credits.</p></details>
            <details><summary>Can I use it from code or an AI agent?</summary><p>Yes. The API is OpenAI-compatible: point any OpenAI SDK at this site&apos;s /v1 URL and use your SHADE key. Every call is charged from the same balance.</p></details>
            <details><summary>Do credits expire?</summary><p>No. Unused credits stay on your key.</p></details>
            <details><summary>What if I send the wrong amount?</summary><p>Scanning the QR sends the right amount automatically. If you send by hand, send the exact amount shown; if it doesn&apos;t match, message us through the Support link at the bottom of the page with your transaction signature.</p></details>
          </div>
        </section>
      </div>
    </main>
  );
}
