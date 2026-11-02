# SHADE: pricing, purchase and credit billing

This adds a pricing page, a purchase page (SOL deposit address + QR, no wallet connect), multi-model routing through OpenRouter, and per-call credit charging for both the playground and the API.

## 1. Add the files

Copy everything from this zip into the project root, keeping the folders.

**New files**

| File | What it does |
|---|---|
| `app/pricing/page.tsx` | Pricing page: credit packs, live model rates, free/paid/private tiers, FAQ |
| `app/purchase/page.tsx`, `app/purchase/PurchaseClient.tsx` | Purchase page: create key → pick pack → QR + exact SOL amount → auto-detects payment |
| `components/billing.module.css` | Styles for both pages |
| `app/api/account/route.ts` | Create an anonymous key / read balance |
| `app/api/deposits/route.ts`, `app/api/deposits/[id]/route.ts` | Create a deposit, poll status, claim by tx signature |
| `app/api/stats/route.ts` | Real live counters (requests served, tokens, deposits) |
| `app/v1/models/route.ts` | OpenAI-style model list with prices |
| `lib/db.ts`, `lib/credits.ts`, `lib/deposits.ts`, `lib/solana.ts`, `lib/price.ts`, `lib/gateway.ts`, `lib/catalog.ts` | Server logic |
| `supabase/schema.sql` | Database tables and atomic credit functions |
| `.env.example` | Every environment variable, explained |

**Files that replace yours**

| File | Change |
|---|---|
| `lib/config.ts` | Same exports (`getModels`, `isProviderConfigured`, `ShadeModel`) plus prices, packs, free tier |
| `app/api/chat/route.ts` | Now charges credits. Free model works without a key |
| `app/v1/chat/completions/route.ts` | Now charges credits per key instead of static `SHADE_API_KEYS` |
| `app/api/config/route.ts` | Reports real readiness, models with prices, packs |
| `.gitignore` | Now ignores `.env*.local`, `.next` |
| `package.json` | Adds `server-only` (then run `npm install`) |

Back up your old `app/api/chat/route.ts`, `app/v1/chat/completions/route.ts` and `app/api/config/route.ts` first, in case your playground or dashboard read fields from them that aren't in the new ones (see step 4).

## 2. Remove `.env.local` from GitHub

It's committed to a public repo. In VS Code's terminal:

```bash
git rm --cached .env.local
git commit -m "Stop tracking .env.local"
git push
```

## 3. Set up services (all have free tiers)

1. **Supabase** (supabase.com): new project → SQL Editor → paste `supabase/schema.sql` → Run. Then Project Settings → API: copy the Project URL into `SUPABASE_URL` and the `service_role` key into `SUPABASE_SERVICE_ROLE_KEY`.
2. **OpenRouter** (openrouter.ai): create a key, add a small balance, and set a credit limit on the key. Put it in `OPENAI_API_KEY`, and set `OPENAI_BASE_URL=https://openrouter.ai/api/v1`. Check the model IDs in `SHADE_MODELS` still exist on openrouter.ai/models.
3. **Treasury wallet**: use a fresh wallet just for deposits. Put its public address in `SOLANA_TREASURY_ADDRESS` and `NEXT_PUBLIC_SOLANA_DEPOSIT_ADDRESS`. Never put a private key anywhere in this app.
4. **RPC**: get a free Helius or QuickNode mainnet URL for `SOLANA_RPC_URL`. The public RPC rate limits quickly.
5. `SHADE_IP_SALT`: any long random string.
6. Add all of these in Vercel → Settings → Environment Variables, then redeploy.

## 4. Connect your playground and dashboard

The purchase page saves the user's key in the browser as `localStorage['shade_key']`. In the playground, send it with each chat request:

```ts
const key = typeof window !== 'undefined' ? localStorage.getItem('shade_key') : null;
const res = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
  body: JSON.stringify({ model, messages }),   // model: 'free' | 'fast' | 'reason' | 'coder'
});
const data = await res.json();
if (!res.ok) {
  // data.error.code: 'insufficient_credits' | 'invalid_key' | 'free_limit_reached' | 'rate_limited' ...
  // For insufficient_credits / invalid_key / free_limit_reached, show a link to /purchase
  showError(data.error.message);
} else {
  showReply(data.content);                       // assistant text
  setBalance(data.shade.balance_credits);        // null on the free model
}
```

Dashboard balance: `GET /api/account` with the same `Authorization` header returns `{ balance_credits, balance_usd }`.
Live counter: `GET /api/stats` returns `{ requests_total, requests_24h, tokens_total, deposits_total }`. These are real numbers from the database.

Add `/pricing` and `/purchase` to your nav.

## 5. Developer API

```bash
curl https://YOUR_DOMAIN/v1/chat/completions \
  -H "Authorization: Bearer shade_sk_..." \
  -H "Content-Type: application/json" \
  -d '{"model":"fast","messages":[{"role":"user","content":"Hello"}]}'
```

Works with any OpenAI SDK (`baseURL: "https://YOUR_DOMAIN/v1"`, `apiKey: "shade_sk_..."`). The response has an extra `shade` field with credits charged and the remaining balance.

## How charging works

- 1,000 credits = $1. Price = provider cost × `SHADE_MARKUP` (default 1.5, a 50% margin).
- Before each call, the max possible cost is held from the balance. After the call, the exact cost (OpenRouter reports it) is charged and the rest is refunded. Failed calls are refunded in full. A balance can never go negative.
- Paid models are routed only to OpenRouter providers that don't store or train on prompts (`data_collection: deny`). The free model usually does allow logging, and the pricing page says so.
- No prompts or answers are stored. The database keeps token counts and cost per call, and an append-only ledger of every balance change.

## How deposits work

- Each purchase gets a unique exact SOL amount (the last decimals differ) and a Solana Pay reference in the QR code, both locked for 30 minutes.
- The page polls every 6 seconds. QR payments are found through their reference. Manual sends are matched by their exact amount. One transaction can only ever credit one purchase.
- If a user sends a different amount by hand, it won't match automatically; they can contact you with the signature and you can credit them manually in Supabase.

## Not included yet

- Streaming responses (API returns an error if `stream: true`).
- The token discount and buyback/burn (needs the coin to exist first).
- The private GPU tier (shown as "Coming later" on the pricing page).
- A support contact link: the purchase page and FAQ say "contact support", so add your Telegram/X/email there.
