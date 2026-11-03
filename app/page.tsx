import Link from 'next/link';
import s from '@/components/billing.module.css';
import h from '@/components/home.module.css';
import LiveStats from '@/components/LiveStats';
import HeroScene from '@/components/HeroScene';
import Tilt from '@/components/Tilt';
import Reveal from '@/components/Reveal';
import { creditsPerM, pricedModels } from '@/lib/catalog';
import { freeDailyLimit, getPackages, packageCreditUnits, unitsToCredits } from '@/lib/config';

export const revalidate = 3600;

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default async function Home() {
  const models = await pricedModels();
  const paid = models.filter((m) => !m.free);
  const packages = getPackages();
  const starter = packages[0];

  return (
    <main className={s.page} style={{ paddingTop: 56 }}>
      <div className={s.wrap}>
        {/* Hero */}
        <section className={h.hero}>
          <div className={h.heroText}>
            <span className={`${s.eyebrow} ${h.in1}`}><span className={s.dot} /> Private AI gateway, now in beta</span>
            <h1 className={`${h.heroTitle} ${h.in2}`}>Ask anything.<br />Leave no trace.</h1>
            <p className={`${h.heroLead} ${h.in3}`}>
              One chat app and one OpenAI-compatible API for leading AI models, paid per request from a prepaid SOL balance.
              No email, no card and no wallet connection. Your key is your account, and your conversations never touch our database.
            </p>
            <div className={`${h.heroCtas} ${h.in4}`}>
              <Link href="/chat" className="cta ctaPrimary ctaLg">Start chatting free</Link>
              <Link href="/purchase" className="cta ctaGhost ctaLg">Buy credits with SOL</Link>
            </div>
            <ul className={`${h.heroPoints} ${h.in5}`}>
              <li>{freeDailyLimit()} free messages a day</li>
              <li>Credits from {starter ? `$${fmt(starter.usdCents / 100)}` : '$5'} that never expire</li>
              <li>Drop-in OpenAI replacement</li>
            </ul>
          </div>
          <div className={h.heroVisual}>
            <HeroScene className={h.scene} />
            <div className={h.sceneCaption}>Every request goes in. Nothing is kept.</div>
          </div>
        </section>

        <LiveStats />

        {/* Value props */}
        <Reveal><section className={s.section}>
          <div className={h.sectionHead}>
            <h2 className={h.h2}>AI access without handing over your identity</h2>
            <p className={h.sectionLead}>
              Mainstream AI products tie every prompt to a verified account, a card and a phone number.
              SHADE removes that layer. You pay with SOL, you hold a key, and you use frontier models on your terms.
            </p>
          </div>
          <div className={h.featureGrid}>
            {[
              ['Anonymous by default', 'No sign-up, no email and no KYC. A random access key is generated for you and kept in your browser. It is the only thing that links you to your balance.'],
              ['Zero prompt storage', 'Prompts and responses pass through our gateway in memory and are never written to a database or log. We record only token counts and cost, so your balance stays accurate.'],
              ['Privacy-filtered routing', 'Paid requests are only routed to model providers that have committed not to store or train on your data. Providers that retain prompts are excluded automatically.'],
              ['Pay only for what you use', 'No subscriptions or monthly minimums. Every request is metered by the token at transparent, published rates, and failed requests are never charged.'],
              ['Native SOL payments', 'Scan a Solana Pay QR code or send the exact amount from any wallet. Payments are verified on-chain and credited automatically, usually within a minute.'],
              ['Built for developers and agents', 'An OpenAI-compatible endpoint means existing SDKs, tools and agent frameworks work with a two-line change. Autonomous agents can pay per call without a credit card.'],
            ].map(([t, d]) => (
              <div key={t} className={s.card}>
                <h3 className={h.cardTitle}>{t}</h3>
                <p className={h.cardText}>{d}</p>
              </div>
            ))}
          </div>
        </section></Reveal>

        {/* How it works */}
        <Reveal><section className={s.section}>
          <div className={h.sectionHead}>
            <h2 className={h.h2}>From wallet to first answer in under a minute</h2>
          </div>
          <div className={h.steps}>
            {[
              ['01', 'Generate your key', 'Open the purchase page and create an access key. It is shown once and stored only in your browser, so save it somewhere safe.'],
              ['02', 'Fund it with SOL', 'Choose a credit pack. You get a unique SOL amount and a QR code, priced at the live SOL/USD rate and locked for 30 minutes.'],
              ['03', 'Credits land automatically', 'SHADE watches the Solana network and credits your key as soon as the transfer confirms. No screenshots, no tickets, no waiting on support.'],
              ['04', 'Chat or call the API', 'Use the web chat or point any OpenAI SDK at SHADE. Each request draws down your balance by its exact cost.'],
            ].map(([n, t, d]) => (
              <div key={n} className={h.step}>
                <div className={h.stepNum}>{n}</div>
                <div>
                  <h3 className={h.cardTitle}>{t}</h3>
                  <p className={h.cardText}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </section></Reveal>

        {/* Who it's for */}
        <Reveal><section className={s.section}>
          <div className={h.sectionHead}>
            <h2 className={h.h2}>One gateway, three kinds of users</h2>
          </div>
          <div className={s.grid3}>
            {[
              ['Privacy-conscious users', 'Research, write and think out loud without building a profile tied to your name, email or bank card.'],
              ['Developers and AI agents', 'Give scripts, bots and autonomous agents a funded API key they can spend from directly, with hard balance limits instead of open-ended card billing.'],
              ['Traders and researchers', 'Run market research, token due diligence and strategy analysis without that work sitting in a personal account on a big-tech platform.'],
            ].map(([t, d]) => (
              <div key={t} className={s.card}>
                <h3 className={h.cardTitle}>{t}</h3>
                <p className={h.cardText}>{d}</p>
              </div>
            ))}
          </div>
        </section></Reveal>

        {/* Models */}
        <Reveal><section className={s.section}>
          <div className={h.sectionHead}>
            <h2 className={h.h2}>The right model for every task</h2>
            <p className={h.sectionLead}>Switch models per message in the chat, or per request in the API. Rates are shown in credits per million tokens; 1,000 credits equal $1.</p>
          </div>
          <div className={h.models}>
            {models.map((m) => (
              <Tilt key={m.id}><div className={s.card}>
                <div className={h.modelTop}><strong>{m.name}</strong><span className={s.tag}>{m.tag}</span></div>
                <p className={h.cardText} style={{ margin: '8px 0 14px' }}>{m.description}</p>
                <div className={h.modelPrice}>
                  {m.free
                    ? `Free · ${freeDailyLimit()} messages per day`
                    : `${fmt(creditsPerM(m.inputPerM))} in / ${fmt(creditsPerM(m.outputPerM))} out per 1M tokens`}
                </div>
                <div className={h.modelId}>model: &quot;{m.id}&quot;</div>
              </div></Tilt>
            ))}
          </div>
          <p className={s.fine} style={{ marginTop: 14 }}>
            {paid.length} paid models live today, with more being added. See full rates and typical costs on the <Link href="/pricing" style={{ color: 'var(--accent)' }}>pricing page</Link>.
          </p>
        </section></Reveal>

        {/* Developers */}
        <Reveal><section className={s.section}>
          <div className={h.devGrid}>
            <div>
              <h2 className={h.h2}>OpenAI-compatible. Two lines to switch.</h2>
              <p className={h.sectionLead}>
                Keep your existing code, SDKs and tooling. Change the base URL and API key, and every request is billed
                from your SHADE balance. Responses follow the standard chat completions format, with an extra field
                reporting the exact credits charged and your remaining balance.
              </p>
              <ul className={s.list}>
                <li>Works with the official OpenAI SDKs for Python and JavaScript</li>
                <li>Per-key rate limits and a hard output cap protect your balance</li>
                <li>Clear error codes for low balance, invalid keys and rate limits</li>
              </ul>
              <div className={s.row}><Link href="/docs" className="cta ctaGhost">Read the API documentation</Link></div>
            </div>
            <pre className={h.code}>{`from openai import OpenAI

client = OpenAI(
    base_url="https://shade-gateway.vercel.app/v1",
    api_key="shade_sk_...",
)

r = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Summarise today's SOL news"}],
)

print(r.choices[0].message.content)`}</pre>
          </div>
        </section></Reveal>

        {/* Privacy model */}
        <Reveal><section className={s.section}>
          <div className={h.sectionHead}>
            <h2 className={h.h2}>Exactly what we keep, and what we don&apos;t</h2>
            <p className={h.sectionLead}>We publish our data handling in plain language, so you can decide what to send.</p>
          </div>
          <div className={h.privacyGrid}>
            <div className={s.card}>
              <h3 className={h.cardTitle}>Never stored</h3>
              <ul className={s.list}>
                <li>Your prompts and the model&apos;s responses</li>
                <li>Your name, email, phone number or card details</li>
                <li>Your IP address (hashed daily for rate limiting only)</li>
                <li>Your access key (stored only as a one-way hash)</li>
              </ul>
            </div>
            <div className={s.card}>
              <h3 className={h.cardTitle}>Stored to run your balance</h3>
              <ul className={s.list}>
                <li>Token counts and cost for each request</li>
                <li>Which model was used and when</li>
                <li>Deposit amounts and their Solana transaction IDs</li>
                <li>An append-only ledger of balance changes</li>
              </ul>
            </div>
            <div className={s.card}>
              <h3 className={h.cardTitle}>Good to know</h3>
              <ul className={s.list}>
                <li>The model provider processes your prompt to generate the answer</li>
                <li>The free tier runs on community endpoints that may log prompts</li>
                <li>SOL transfers are public on-chain, as with any Solana payment</li>
                <li>A self-hosted private tier on dedicated GPUs is on the roadmap</li>
              </ul>
            </div>
          </div>
        </section></Reveal>

        {/* FAQ */}
        <Reveal><section className={s.section}>
          <div className={h.sectionHead}>
            <h2 className={h.h2}>Common questions</h2>
          </div>
          <div className={s.faq}>
            <details><summary>Do I need a wallet extension or to connect my wallet?</summary><p>No. SHADE never asks you to connect a wallet or sign anything. You simply send SOL to the address shown, from any wallet or exchange that supports Solana, and the payment is detected on-chain.</p></details>
            <details><summary>What happens if I lose my key?</summary><p>Because there are no accounts, there is nothing to recover a key from. Treat it like a private key: store it in a password manager. Anyone with the key can spend its credits, and we cannot restore lost keys.</p></details>
            <details><summary>How much does a typical message cost?</summary><p>Most chat messages on the fast model cost well under one credit, a fraction of a cent. Larger models and long conversations cost more. Every response shows exactly what it cost, and the pricing page lists all rates.</p></details>
            <details><summary>Do credits expire?</summary><p>No. Credits stay on your key until you use them. There are no subscriptions, renewals or inactivity fees.</p></details>
            <details><summary>Can I use SHADE inside my own app or bot?</summary><p>Yes. The API is compatible with the OpenAI chat completions format, so any SDK, framework or agent tool that supports OpenAI works by changing the base URL and key.</p></details>
            <details><summary>Is SHADE fully anonymous?</summary><p>SHADE does not know who you are, and it never stores your conversations. Your prompt is still processed by the model provider to produce an answer, and Solana payments are public on-chain. A fully self-hosted private tier is planned.</p></details>
          </div>
        </section></Reveal>

        {/* Final CTA */}
        <Reveal><section className={h.finalCta}>
          <h2 className={h.h2}>Try SHADE in the next 30 seconds</h2>
          <p className={h.sectionLead} style={{ margin: '0 auto' }}>No sign-up and no SOL needed for your first {freeDailyLimit()} messages. Top up when you&apos;re ready for the full model lineup.</p>
          <div className={h.heroCtas}>
            <Link href="/chat" className="cta ctaPrimary ctaLg">Start chatting free</Link>
            <Link href="/pricing" className="cta ctaGhost ctaLg">View pricing</Link>
          </div>
          {starter && <p className={s.fine} style={{ marginTop: 14 }}>Credit packs from ${fmt(starter.usdCents / 100)} ({fmt(unitsToCredits(packageCreditUnits(starter)))} credits).</p>}
        </section></Reveal>
      </div>
    </main>
  );
}