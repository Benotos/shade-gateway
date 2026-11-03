# SHADE setup

## 1. Replace the project files

1. In `C:\Users\BENOTOS\Downloads\shade-gateway`, delete everything **except** the `.git` and `.vercel` folders (and `.env.local` if you want to keep it locally). Turn on View → Show → Hidden items to see them.
2. Unzip this zip into that folder.
3. In the VS Code terminal:

```bash
npm install
npm run build        # should finish with no errors
git add -A
git commit -m "Full SHADE app: chat, pricing, purchase, credit billing"
git push
```

## 2. Set up services (free tiers)

1. **Turso** (turso.tech): sign up → **Create Database** (pick a region near your users, e.g. Europe) → open the database → **Connect** (or Generate Token). Copy the **Database URL** (starts with `libsql://`) and the **auth token**. The tables are created automatically on the first request, so there's no SQL to run.
2. **OpenRouter** (openrouter.ai): create an API key, add a few dollars of credit, and set a credit limit on the key.
3. **Treasury wallet**: a fresh Solana wallet used only for deposits. You only need its public address.
4. **RPC**: free Helius (helius.dev) or QuickNode mainnet URL. The public RPC rate limits.

## 3. Add environment variables in Vercel

Vercel → shade-gateway → Settings → Environment Variables. Add each line from `.env.example`. The important ones:

| Name | Value |
|---|---|
| `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` |
| `OPENAI_API_KEY` | your OpenRouter key |
| `SHADE_MODELS` | copy from `.env.example` (replace any old value) |
| `TURSO_DATABASE_URL` | Turso Database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `SHADE_IP_SALT` | any long random text |
| `SOLANA_TREASURY_ADDRESS` | treasury wallet address |
| `NEXT_PUBLIC_SOLANA_DEPOSIT_ADDRESS` | same address |
| `SOLANA_RPC_URL` | Helius/QuickNode URL |
| `NEXT_PUBLIC_SUPPORT_URL` | your Telegram/X link, e.g. `https://t.me/yourname` |

Delete the old `SHADE_API_KEYS` variable; keys are now created on the purchase page.

## 4. Deploy

```bash
vercel --prod
```

## 5. Test before telling the client

1. Open `/chat`, send a message on **Shade Free**. You should get an answer.
2. Open `/purchase`, create a key, save it, pick **Starter**, scan the QR with your wallet and pay. Credits should appear within a minute.
3. Back on `/chat`, pick **Shade Flash** and send a message. The balance should drop slightly.
4. The home page counters should now show real numbers.

## How it works

- **Credits**: 1,000 credits = $1. Each call costs the provider's real price × `SHADE_MARKUP` (1.5 = 50% margin). The cost is held before the call and the unused part refunded after. Failed calls are free. Balances can't go negative.
- **Deposits**: each purchase gets a unique exact SOL amount and a Solana Pay reference, locked for 30 minutes. QR payments are found by reference, manual sends by exact amount. One transaction can only credit one purchase. If someone sends a wrong amount, find their deposit in the Turso dashboard (`shade_deposits` table) and credit it by hand.
- **Privacy**: prompts and answers are never stored. Paid models only go to providers that don't store or train on prompts. The free model may log prompts, and the site says so.

## Not built yet

Streaming responses, the coin discount and buyback/burn, and the private GPU tier (shown as "coming later").
