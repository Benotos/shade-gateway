<p align="center"><img src="public/shade-mark.svg" width="72" alt="SHADE"></p>

<h1 align="center">SHADE</h1>
<p align="center">Private AI gateway. Leading AI models, paid per request in SOL. No account, no card, no wallet connect.</p>
<p align="center"><a href="https://shade-gateway.vercel.app">Website</a> · <a href="https://shade-gateway.vercel.app/chat">Chat</a> · <a href="https://shade-gateway.vercel.app/docs">API reference</a> · <a href="https://shade-gateway.vercel.app/pricing">Pricing</a></p>

---

## What it does

- **One chat app and one OpenAI-compatible API** for GPT-4o mini, GPT-4.1, GPT-5, Claude Sonnet, Gemini Flash and Pro, DeepSeek V3 and Llama 3.3.
- **Pay per request from a prepaid SOL balance.** A purchase gets a unique SOL amount and a Solana Pay QR code. The transfer is detected on-chain and credited automatically, with no wallet connection.
- **Anonymous keys.** A random `shade_sk_…` key is the account. Only its hash is stored.
- **No prompt storage.** Prompts and responses pass through in memory. Billing keeps token counts and cost only.
- **Private routing.** Paid requests go only to model providers that don't retain or train on prompts.
- **Built for agents.** Keys can be created and funded entirely through the API, so an agent with a Solana wallet can pay for its own inference.

## Use the API

```python
from openai import OpenAI

client = OpenAI(base_url="https://shade-gateway.vercel.app/v1", api_key="shade_sk_...")
r = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "gm"}],
)
print(r.choices[0].message.content)
```

Streaming, the full model list, errors, limits and funding with SOL are covered in the [API reference](https://shade-gateway.vercel.app/docs).

| Endpoint | |
|---|---|
| `POST /v1/chat/completions` | Chat completion, JSON or streaming (SSE) |
| `GET /v1/models` | Models with live prices |
| `GET /api/account` | Balance for a key |
| `POST /api/account` | Create a key |
| `POST /api/deposits` · `GET /api/deposits/{id}` | Top up a key with SOL |
| `GET /api/stats` | Public usage counters |

## How it works

```
client ──► SHADE gateway ──► model provider (OpenRouter, non-logging providers only)
            │  validate, rate limit
            │  hold max cost from balance
            │  stream answer back
            │  charge exact cost, release the rest
            ▼
         ledger (Turso / libSQL): key hashes, balances, token counts, deposits. Never prompts.

wallet ──SOL──► treasury address ◄── watched via Solana RPC, matched by Solana Pay reference or exact amount
```

## Stack

Next.js 15 (App Router) on Vercel · Turso (libSQL) · OpenRouter · Solana JSON-RPC (Helius) · three.js

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Never commit `.env.local`. The list of environment variables is in `.env.example`.

## Status

Beta. Not yet supported: tool calling, image inputs, and the self-hosted private tier on dedicated GPUs.