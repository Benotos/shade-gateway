import 'server-only';

// SOL/USD price, cached for 60s. The price is locked into each deposit when it is created.
let cache: { price: number; at: number } | null = null;

export async function solUsd(): Promise<number> {
  if (cache && Date.now() - cache.at < 60_000) return cache.price;
  const sources: (() => Promise<number>)[] = [
    async () => {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { cache: 'no-store' });
      return Number((await r.json())?.solana?.usd);
    },
    async () => {
      const r = await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot', { cache: 'no-store' });
      return Number((await r.json())?.data?.amount);
    },
  ];
  for (const s of sources) {
    try {
      const p = await s();
      if (Number.isFinite(p) && p > 1) { cache = { price: p, at: Date.now() }; return p; }
    } catch { /* try next source */ }
  }
  const fallback = Number(process.env.SOL_USD_FALLBACK);
  if (Number.isFinite(fallback) && fallback > 1) return fallback;
  throw new Error('SOL price unavailable');
}
