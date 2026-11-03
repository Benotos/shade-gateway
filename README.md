# SHADE — Private AI Gateway

Top AI models, paid per use in SOL. No account, no email, no card, no wallet connect.

## Pages

- `/` home with live usage counters
- `/chat` chat playground (free model without a key, paid models with credits)
- `/pricing` credit packs and live model rates
- `/purchase` get a key, pick a pack, pay with SOL (QR or exact amount), credits added automatically
- `/docs` OpenAI-compatible API docs

## API

- `POST /v1/chat/completions` OpenAI-compatible, `Authorization: Bearer shade_sk_...`
- `GET /v1/models` models and prices
- `GET /api/account` balance for a key
- `GET /api/stats` real usage counters

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Full setup (Turso, OpenRouter, treasury wallet, Vercel variables) is in **SETUP-BILLING.md**.
Never commit `.env.local`.
