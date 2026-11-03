import type { Metadata } from 'next';
import Link from 'next/link';
import d from '@/components/docs.module.css';
import CodeTabs from '@/components/CodeTabs';
import { creditsPerM, pricedModels } from '@/lib/catalog';
import { freeDailyLimit, getPackages, maxOutputTokens, packageCreditUnits, unitsToCredits } from '@/lib/config';

export const metadata: Metadata = {
  title: 'API reference · SHADE',
  description: 'OpenAI-compatible API for GPT, Claude, Gemini, DeepSeek and Llama, paid per request in SOL credits. No account needed.',
};
export const revalidate = 3600;

const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://shade-gateway.vercel.app').replace(/\/+$/, '');
const base = `${site}/v1`;
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

const nav: [string, [string, string][]][] = [
  ['Getting started', [['intro', 'Introduction'], ['quickstart', 'Quickstart'], ['auth', 'Authentication']]],
  ['Reference', [['models', 'Models'], ['chat', 'Chat completions'], ['streaming', 'Streaming'], ['balance', 'Balance'], ['funding', 'Funding with SOL']]],
  ['Operations', [['billing', 'Billing'], ['errors', 'Errors'], ['limits', 'Limits'], ['privacy', 'Privacy']]],
];

export default async function Docs() {
  const models = await pricedModels();
  const paid = models.filter((m) => !m.free);
  const example = paid.find((m) => m.id === 'gpt-4o-mini') ?? paid[0] ?? models[0];
  const packages = getPackages();
  const cap = maxOutputTokens();

  return (
    <main className={d.page}>
      <div className={d.layout}>
        <nav className={d.side} aria-label="API reference">
          {nav.map(([group, items]) => (
            <div key={group} className={d.sideBlock}>
              <div className={d.sideGroup}>{group}</div>
              {items.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
            </div>
          ))}
        </nav>

        <article className={d.main}>
          <header className={d.head} id="intro">
            <h1 className={d.title}>API reference</h1>
            <p className={d.lead}>
              SHADE is an OpenAI-compatible gateway to {paid.length} leading models from {Array.from(new Set(paid.map((m) => m.vendor))).join(', ')}.
              If your code already talks to OpenAI, change the base URL and key and it works. Every request is billed from a prepaid SOL balance,
              so there is no account, no email and no card. AI agents can fund and use a key entirely through the API.
            </p>
            <div className={d.facts}>
              <div className={d.fact}><div className={d.factLabel}>Base URL</div><div className={d.factValue}>{base}</div></div>
              <div className={d.fact}><div className={d.factLabel}>Auth header</div><div className={d.factValue}>Authorization: Bearer shade_sk_…</div></div>
              <div className={d.fact}><div className={d.factLabel}>Format</div><div className={d.factValue}>OpenAI-compatible JSON and SSE</div></div>
            </div>
          </header>

          <section className={d.section} id="quickstart">
            <h2 className={d.h2}>Quickstart</h2>
            <p className={d.p}>
              Get a key on the <Link href="/purchase">purchase page</Link> (or <a href="#funding">through the API</a>), then send your first request.
              The free model (<code>free</code>) works without a key, so you can test before paying.
            </p>
            <CodeTabs tabs={[
              { label: 'cURL', code: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $SHADE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${example.id}",
    "messages": [{"role": "user", "content": "Explain Solana in one sentence."}]
  }'` },
              { label: 'Python', code: `# pip install openai
import os
from openai import OpenAI

client = OpenAI(base_url="${base}", api_key=os.environ["SHADE_KEY"])

r = client.chat.completions.create(
    model="${example.id}",
    messages=[{"role": "user", "content": "Explain Solana in one sentence."}],
)
print(r.choices[0].message.content)` },
              { label: 'JavaScript', code: `// npm install openai
import OpenAI from 'openai';

const client = new OpenAI({ baseURL: '${base}', apiKey: process.env.SHADE_KEY });

const r = await client.chat.completions.create({
  model: '${example.id}',
  messages: [{ role: 'user', content: 'Explain Solana in one sentence.' }],
});
console.log(r.choices[0].message.content);` },
              { label: 'fetch', code: `const res = await fetch('${base}/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.SHADE_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '${example.id}',
    messages: [{ role: 'user', content: 'Explain Solana in one sentence.' }],
  }),
});
const data = await res.json();
console.log(data.choices[0].message.content, data.shade.balance_credits);` },
            ]} />
            <p className={d.p}>Tools built on the OpenAI API, such as LangChain, LlamaIndex, the Vercel AI SDK and most agent frameworks, work the same way: set the base URL to <code>{base}</code> and the API key to your SHADE key.</p>
          </section>

          <section className={d.section} id="auth">
            <h2 className={d.h2}>Authentication</h2>
            <p className={d.p}>
              Every paid request needs a SHADE key, a secret that starts with <code>shade_sk_</code>. The key is the account: it holds the credit
              balance and is the only thing that identifies you. Send it as a bearer token:
            </p>
            <CodeTabs title="Header" tabs={[{ label: 'Header', code: 'Authorization: Bearer shade_sk_your_key_here' }]} />
            <ul className={d.ul}>
              <li>We store only a one-way hash of each key, so a lost key can&apos;t be recovered. Keep it in a password manager or secret store.</li>
              <li>Anyone with the key can spend its credits. Never ship it in front-end code or commit it to a repository.</li>
              <li>Use separate keys for separate apps or agents. Each one has its own balance and limits.</li>
            </ul>
          </section>

          <section className={d.section} id="models">
            <h2 className={d.h2}>Models</h2>
            <p className={d.p}>
              Pass the id in the <code>model</code> field. Prices are in credits per million tokens (1,000 credits = $1) and follow the providers&apos; current rates.
              Requests are routed only to providers that don&apos;t store or train on prompts, except the free model.
            </p>
            <div className={d.tableWrap}>
              <table className={d.table}>
                <thead><tr><th>model</th><th>Model</th><th>Input / 1M</th><th>Output / 1M</th><th>Notes</th></tr></thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.id}>
                      <td className={d.mono}>{m.id}</td>
                      <td>{m.name}<div style={{ fontSize: 12.5 }}>{m.vendor}</div></td>
                      <td className={d.num}>{m.free ? 'Free' : fmt(creditsPerM(m.inputPerM))}</td>
                      <td className={d.num}>{m.free ? 'Free' : fmt(creditsPerM(m.outputPerM))}</td>
                      <td>
                        {m.free ? `${freeDailyLimit()} requests a day, no key needed. May log prompts.` : m.description}
                        {m.reasoning && <span className={d.pill}>reasoning</span>}
                        {m.aliases?.length ? <div style={{ fontSize: 12.5, marginTop: 4 }}>Also accepts <code>{m.aliases.join(', ')}</code></div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={d.endpoint}><span className={`${d.verb} ${d.verbGet}`}>GET</span>/v1/models</div>
            <p className={d.p}>Returns the live list in the OpenAI format, with SHADE pricing. No key needed.</p>
            <CodeTabs title="Response" tabs={[{ label: 'Response', code: `{
  "object": "list",
  "data": [
    {
      "id": "${example.id}",
      "object": "model",
      "owned_by": "${example.vendor.toLowerCase()}",
      "name": "${example.name}",
      "free": false,
      "reasoning": false,
      "pricing": { "input_credits_per_m": ${creditsPerM(example.inputPerM)}, "output_credits_per_m": ${creditsPerM(example.outputPerM)} }
    }
  ]
}` }]} />
          </section>

          <section className={d.section} id="chat">
            <h2 className={d.h2}>Chat completions</h2>
            <div className={d.endpoint}><span className={d.verb}>POST</span>/v1/chat/completions</div>
            <p className={d.p}>Generates a reply to a conversation. Request and response bodies follow the OpenAI chat completions format.</p>
            <h3 className={d.h3}>Request body</h3>
            <div className={d.tableWrap}>
              <table className={d.table}>
                <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td className={d.mono}>model<span className={d.req}>required</span></td><td className={d.mono}>string</td><td>A model id from the table above.</td></tr>
                  <tr><td className={d.mono}>messages<span className={d.req}>required</span></td><td className={d.mono}>array</td><td>The conversation. Each item has a <code>role</code> (<code>system</code>, <code>developer</code>, <code>user</code> or <code>assistant</code>) and <code>content</code>, either a string or an array of <code>{'{ "type": "text", "text": "…" }'}</code> parts. Up to 200 messages.</td></tr>
                  <tr><td className={d.mono}>stream</td><td className={d.mono}>boolean</td><td>Send the reply as Server-Sent Events while it&apos;s generated. Default <code>false</code>. See <a href="#streaming">Streaming</a>.</td></tr>
                  <tr><td className={d.mono}>max_tokens</td><td className={d.mono}>integer</td><td>Maximum tokens to generate, up to {fmt(cap)}. Default 2,048. <code>max_completion_tokens</code> is accepted too. Reasoning models always get the full {fmt(cap)}.</td></tr>
                  <tr><td className={d.mono}>temperature</td><td className={d.mono}>number</td><td>0 to 2. Higher is more random.</td></tr>
                  <tr><td className={d.mono}>top_p</td><td className={d.mono}>number</td><td>0 to 1. Nucleus sampling.</td></tr>
                  <tr><td className={d.mono}>stop</td><td className={d.mono}>string | array</td><td>Up to 4 sequences where generation stops.</td></tr>
                  <tr><td className={d.mono}>presence_penalty</td><td className={d.mono}>number</td><td>-2 to 2.</td></tr>
                  <tr><td className={d.mono}>frequency_penalty</td><td className={d.mono}>number</td><td>-2 to 2.</td></tr>
                  <tr><td className={d.mono}>seed</td><td className={d.mono}>integer</td><td>Best-effort deterministic sampling, where the model supports it.</td></tr>
                </tbody>
              </table>
            </div>
            <div className={`${d.note} ${d.warn}`}>Not supported yet: tool and function calling, image or file inputs, and <code>n</code> greater than 1. Requests that use them return a clear <code>invalid_request</code> error rather than being silently ignored.</div>
            <h3 className={d.h3}>Response</h3>
            <p className={d.p}>The standard OpenAI response, plus a <code>shade</code> object with the exact credits charged and the remaining balance.</p>
            <CodeTabs title="200 OK" tabs={[{ label: '200 OK', code: `{
  "id": "gen-1762167420-x8Kq2",
  "object": "chat.completion",
  "created": 1762167420,
  "model": "${example.id}",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Solana is a high-speed blockchain..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 14, "completion_tokens": 31, "total_tokens": 45 },
  "shade": { "charged_credits": 0.03, "balance_credits": 4987.12, "free": false }
}` }]} />
          </section>

          <section className={d.section} id="streaming">
            <h2 className={d.h2}>Streaming</h2>
            <p className={d.p}>
              Set <code>&quot;stream&quot;: true</code> to receive the reply token by token as Server-Sent Events, in the same chunk format as OpenAI.
              The last chunk before <code>[DONE]</code> has an empty <code>choices</code> array, the token <code>usage</code> and the <code>shade</code> billing summary.
              If you disconnect early, generation stops and you pay only for what was produced.
            </p>
            <CodeTabs tabs={[
              { label: 'Python', code: `stream = client.chat.completions.create(
    model="${example.id}",
    messages=[{"role": "user", "content": "Write a haiku about privacy."}],
    stream=True,
)
for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)` },
              { label: 'JavaScript', code: `const stream = await client.chat.completions.create({
  model: '${example.id}',
  messages: [{ role: 'user', content: 'Write a haiku about privacy.' }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}` },
              { label: 'Raw events', code: `data: {"id":"gen-…","object":"chat.completion.chunk","model":"${example.id}","choices":[{"index":0,"delta":{"content":"Keys"}}]}

data: {"id":"gen-…","object":"chat.completion.chunk","model":"${example.id}","choices":[{"index":0,"delta":{"content":" not names"}}]}

data: {"id":"gen-…","object":"chat.completion.chunk","model":"${example.id}","choices":[],"usage":{"prompt_tokens":15,"completion_tokens":17,"total_tokens":32},"shade":{"charged_credits":0.02,"balance_credits":4987.1,"free":false}}

data: [DONE]` },
            ]} />
          </section>

          <section className={d.section} id="balance">
            <h2 className={d.h2}>Balance</h2>
            <div className={d.endpoint}><span className={`${d.verb} ${d.verbGet}`}>GET</span>/api/account</div>
            <p className={d.p}>Returns the balance of the key in the <code>Authorization</code> header.</p>
            <CodeTabs tabs={[
              { label: 'cURL', code: `curl ${site}/api/account -H "Authorization: Bearer $SHADE_KEY"` },
              { label: 'Response', code: `{
  "key_prefix": "shade_sk_YPah",
  "balance_credits": 4987.12,
  "balance_usd": 4.98712,
  "created_at": "2026-11-03T01:14:09.512Z"
}` },
            ]} />
          </section>

          <section className={d.section} id="funding">
            <h2 className={d.h2}>Funding with SOL</h2>
            <p className={d.p}>
              Keys can be created and topped up without a browser, so an agent with a Solana wallet can pay for its own inference.
              Each top-up gets a unique SOL amount and a Solana Pay reference, priced at the live SOL/USD rate and valid for 30 minutes.
              The transfer is detected on-chain and credited automatically, usually within seconds of confirmation.
            </p>
            <h3 className={d.h3}>1. Create a key</h3>
            <div className={d.endpoint}><span className={d.verb}>POST</span>/api/account</div>
            <CodeTabs title="Response · 201" tabs={[{ label: 'Response', code: `{ "key": "shade_sk_…", "key_prefix": "shade_sk_ab12", "balance_credits": 0 }` }]} />
            <p className={d.p}>The full key is returned only once. Store it before doing anything else.</p>
            <h3 className={d.h3}>2. Start a top-up</h3>
            <div className={d.endpoint}><span className={d.verb}>POST</span>/api/deposits</div>
            <p className={d.p}>Body: <code>{'{ "package_id": "…" }'}</code>. Available packages:</p>
            <div className={d.tableWrap}>
              <table className={d.table} style={{ minWidth: 0 }}>
                <thead><tr><th>package_id</th><th>Price</th><th>Credits</th></tr></thead>
                <tbody>
                  {packages.map((p) => (
                    <tr key={p.id}><td className={d.mono}>{p.id}</td><td className={d.num}>${fmt(p.usdCents / 100)}</td><td className={d.num}>{fmt(unitsToCredits(packageCreditUnits(p)))}{p.bonusPct ? ` (+${p.bonusPct}% bonus)` : ''}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CodeTabs tabs={[
              { label: 'cURL', code: `curl -X POST ${site}/api/deposits \\
  -H "Authorization: Bearer $SHADE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"package_id": "${packages[0]?.id ?? 'starter'}"}'` },
              { label: 'Response', code: `{
  "id": "6f1c2b8e-…",
  "status": "pending",
  "usd": ${(packages[0]?.usdCents ?? 500) / 100},
  "credits": ${unitsToCredits(packages[0] ? packageCreditUnits(packages[0]) : 5_000_000)},
  "amount_sol": "0.03421007",
  "address": "<deposit address>",
  "reference": "<Solana Pay reference>",
  "solana_pay_url": "solana:<address>?amount=0.03421007&reference=…",
  "expires_at": "2026-11-03T02:00:00.000Z"
}` },
            ]} />
            <h3 className={d.h3}>3. Send SOL</h3>
            <p className={d.p}>
              Send exactly <code>amount_sol</code> to <code>address</code> on Solana mainnet, ideally with <code>reference</code> attached as a read-only
              account key (Solana Pay). Wallets that open <code>solana_pay_url</code> do this for you.
            </p>
            <h3 className={d.h3}>4. Confirm</h3>
            <div className={d.endpoint}><span className={`${d.verb} ${d.verbGet}`}>GET</span>/api/deposits/{'{id}'}</div>
            <p className={d.p}>
              Poll every few seconds. <code>status</code> becomes <code>credited</code> and <code>balance_credits</code> shows the new balance.
              If a manual transfer isn&apos;t picked up, <code>POST /api/deposits/{'{id}'}</code> with <code>{'{ "signature": "<tx signature>" }'}</code> to claim it.
              One transaction can credit only one top-up.
            </p>
          </section>

          <section className={d.section} id="billing">
            <h2 className={d.h2}>Billing</h2>
            <ul className={d.ul}>
              <li><strong>1,000 credits = $1.</strong> Credits never expire and there are no subscriptions or minimums.</li>
              <li>Before each request, the maximum it could cost is held from the balance. When it finishes, the exact cost reported by the provider is charged and the rest is released.</li>
              <li>Requests that fail are not charged. A balance can never go below zero.</li>
              <li>Reasoning models count their internal thinking as output tokens, so they cost more per answer.</li>
              <li>Every response tells you what it cost in <code>shade.charged_credits</code>.</li>
            </ul>
          </section>

          <section className={d.section} id="errors">
            <h2 className={d.h2}>Errors</h2>
            <p className={d.p}>Errors use standard HTTP status codes and a consistent body:</p>
            <CodeTabs title="402 Payment Required" tabs={[{ label: '402', code: `{
  "error": {
    "message": "Not enough credits for this request. Top up on the purchase page.",
    "code": "insufficient_credits",
    "required_credits": 9.41,
    "balance_credits": 2.03
  }
}` }]} />
            <div className={d.tableWrap}>
              <table className={d.table}>
                <thead><tr><th>Status</th><th>code</th><th>What to do</th></tr></thead>
                <tbody>
                  {[
                    ['400', 'invalid_request', 'Fix the request body. The message says which field is wrong.'],
                    ['400', 'unknown_model', 'Use an id from GET /v1/models.'],
                    ['401', 'invalid_key', 'Send a valid key in the Authorization header.'],
                    ['402', 'insufficient_credits', 'Top up the key, or lower max_tokens.'],
                    ['413', 'prompt_too_long', 'Shorten the conversation.'],
                    ['429', 'rate_limited', 'Wait and retry with backoff.'],
                    ['429', 'free_limit_reached', 'Use a key, or try again tomorrow.'],
                    ['502', 'provider_4xx / provider_5xx', 'The model provider failed. Retry, or pick another model. Not charged.'],
                    ['503', 'provider_429', 'The model is busy upstream. Retry shortly. Not charged.'],
                    ['504', 'provider_timeout', 'The model took too long. Retry with a shorter request. Not charged.'],
                    ['—', 'provider_stream_error', 'Sent inside a stream if the model stops mid-answer. You pay only for what was produced.'],
                  ].map(([st, code, what]) => <tr key={code}><td className={d.num}>{st}</td><td className={d.mono}>{code}</td><td>{what}</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>

          <section className={d.section} id="limits">
            <h2 className={d.h2}>Limits</h2>
            <div className={d.tableWrap}>
              <table className={d.table} style={{ minWidth: 0 }}>
                <thead><tr><th>Limit</th><th>Value</th></tr></thead>
                <tbody>
                  {[
                    ['Requests per key', '60 per minute'],
                    ['Requests per network', '120 per minute'],
                    ['Free model', `5 per minute, ${freeDailyLimit()} per day per visitor`],
                    ['Output per request', `${fmt(cap)} tokens`],
                    ['Prompt size', '400,000 characters, 200 messages'],
                    ['Request duration', '60 seconds'],
                    ['New keys', '10 per network per day'],
                    ['Top-ups', '20 per key per hour'],
                  ].map(([a, b]) => <tr key={a}><td>{a}</td><td className={d.num}>{b}</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>

          <section className={d.section} id="privacy">
            <h2 className={d.h2}>Privacy</h2>
            <ul className={d.ul}>
              <li>Prompts and responses pass through the gateway in memory and are never written to a database or log.</li>
              <li>We store a hash of each key, token counts and cost per request, and deposit transactions, which is what billing needs.</li>
              <li>IP addresses are hashed with a daily salt for rate limiting and never stored.</li>
              <li>Paid requests are routed only to providers that don&apos;t retain or train on prompts. The model provider still processes the prompt to answer it.</li>
              <li>The free model runs on community endpoints that may log prompts. Don&apos;t send anything sensitive to it.</li>
            </ul>
          </section>
        </article>
      </div>
    </main>
  );
}