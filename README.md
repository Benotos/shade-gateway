# SHADE — Private AI Gateway

A polished Next.js starter for the SHADE concept in the supplied client brief: anonymous-by-default AI access, SOL deposit UX, prepaid credits, model routing, a playground and an OpenAI-compatible developer endpoint.

## Included

- Responsive dashboard, model explorer, playground and API docs UI.
- `/api/config` and `/api/health` service endpoints.
- `/api/chat` routes messages to an OpenAI-compatible provider without writing prompts to an application database.
- `/v1/chat/completions` OpenAI-compatible endpoint with bearer-key authentication (`SHADE_API_KEYS`).
- Optional demo mode for UI review (`SHADE_DEMO_MODE=true`).
- SOL address + QR display when `NEXT_PUBLIC_SOLANA_DEPOSIT_ADDRESS` is configured.
- No database, accounts, cookies, wallet-connect flow or prompt-history persistence in this starter.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

For a visual demo without a provider, set `SHADE_DEMO_MODE=true`. Demo responses are explicitly labelled and are not real model output.

## Configure a model provider

Set these server environment variables:

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your-secret-provider-key
DEFAULT_MODEL=gpt-4o-mini
SHADE_MODELS=fast:Shade Flash:gpt-4o-mini,reason:Shade Core:gpt-4.1,coder:Shade Code:gpt-4.1
```

`OPENAI_BASE_URL` and `OPENAI_API_KEY` are read only on the server. Do not expose provider keys with a `NEXT_PUBLIC_` prefix. `SHADE_MODELS` is a comma-separated list of `id:display name:provider model` triples. The configured model IDs are used by both the playground and public API.

## Developer API

Configure one or more long random bearer keys:

```env
SHADE_API_KEYS=shade_live_replace_with_a_long_random_secret
```

Then call:

```bash
curl https://YOUR_DOMAIN/v1/chat/completions \
  -H 'Authorization: Bearer shade_live_replace_with_a_long_random_secret' \
  -H 'Content-Type: application/json' \
  -d '{"model":"fast","messages":[{"role":"user","content":"Hello"}]}'
```

The current endpoint accepts a single non-streaming completion request. Add per-key rate limits, usage accounting, key rotation/revocation, streaming, quotas and abuse controls before opening it to public traffic.

## SOL deposits — important production blocker

The deposit panel can display a configured Solana address and QR code. **This starter does not accept or credit deposits.** A single shared treasury address cannot reliably associate a transfer with an anonymous session. Do not publish a treasury address and promise automatic crediting based on this UI.

Before taking real money, implement:

1. A unique deposit address per anonymous session (or a trusted payment processor with a supported deposit flow).
2. Server-side transaction monitoring against Solana mainnet, including signature, recipient, mint/asset, amount, slot/finality and replay checks.
3. A durable, append-only double-entry credit ledger with idempotent transaction processing.
4. SOL/USD conversion policy, fees, minimum deposit, refund handling and rate-card snapshots.
5. Abuse controls, deposit expiry, reconciliation and operational alerts.
6. A security review of custody/key management. Never put a signing secret in the browser.

The current `/api/config` explicitly reports `creditSystemReady: false`; the dashboard uses em-dash placeholders rather than invented balances or usage.

## Privacy and logging claims

The app has no prompt-history database and the chat routes do not intentionally log request bodies. This does **not** prove end-to-end zero logging. Hosting providers, reverse proxies, observability tools, upstream model providers, RPC providers and payment services may process request metadata or content under their own terms. Review and configure those services before making public privacy claims. If a truly private tier is required, deploy an open-weight model on infrastructure you control and validate network, telemetry, backups and GPU host policies.

## Production checklist

- [ ] Choose and contract the model providers; verify resale/commercial API rights.
- [ ] Add the unique-address deposit and ledger subsystem before accepting funds.
- [ ] Implement prepaid usage metering and enforce spend caps before forwarding model requests.
- [ ] Replace static shared API keys with per-customer keys, hashed at rest, scoped, revocable and rate-limited.
- [ ] Add streaming, provider failover, timeout/retry policy and model-specific pricing.
- [ ] Add security headers, request-size limits, abuse prevention and origin controls.
- [ ] Complete privacy policy, terms, refund policy and regional compliance review.
- [ ] Configure domain, environment secrets, monitoring and incident response.
- [ ] Run load, concurrency, billing-integrity and penetration tests.

## Deploy

This is a standard Next.js 15 application and can be deployed to Vercel or any compatible Node hosting platform. Configure the environment variables in the hosting dashboard; never commit `.env.local`.
