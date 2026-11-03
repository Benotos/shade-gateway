import 'server-only';
import { getModels, markup, providerBaseUrl, type ShadeModel } from './config';

// Live provider prices (OpenRouter publishes them at /api/v1/models). Cached for an hour.
// Falls back to the static prices in lib/config.ts when the provider isn't OpenRouter or is unreachable.

let cache: { at: number; prices: Map<string, { inputPerM: number; outputPerM: number }> } | null = null;

async function livePrices() {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.prices;
  const prices = new Map<string, { inputPerM: number; outputPerM: number }>();
  if (providerBaseUrl().includes('openrouter.ai')) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/models', { next: { revalidate: 3600 } });
      const json = await r.json() as { data?: { id: string; pricing?: { prompt?: string; completion?: string } }[] };
      for (const m of json.data ?? []) {
        const p = Number(m.pricing?.prompt), c = Number(m.pricing?.completion);
        if (Number.isFinite(p) && Number.isFinite(c)) prices.set(m.id, { inputPerM: p * 1e6, outputPerM: c * 1e6 });
      }
    } catch { /* fall back to static prices */ }
  }
  cache = { at: Date.now(), prices };
  return prices;
}

/** Models with current provider prices filled in. */
export async function pricedModels(): Promise<ShadeModel[]> {
  const prices = await livePrices();
  return getModels().map((m) => {
    const live = prices.get(m.providerModel);
    return live && !m.free ? { ...m, inputPerM: live.inputPerM, outputPerM: live.outputPerM } : m;
  });
}

/**
 * Free models OpenRouter currently serves, best first. Free models change often, so the free
 * tier falls back to one of these when the configured one is gone.
 */
export async function freeModelIds(exclude: string[] = []): Promise<string[]> {
  const prices = await livePrices();
  const preferred = ['meta-llama/llama-3.3-70b', 'deepseek/deepseek', 'google/gemini', 'google/gemma-3', 'mistralai/mistral-small', 'qwen/qwen3', 'meta-llama/'];
  const free = [...prices.keys()].filter((id) => id.endsWith(':free') && !exclude.includes(id));
  const rank = (id: string) => { const i = preferred.findIndex((p) => id.startsWith(p)); return i < 0 ? preferred.length : i; };
  return free.sort((a, b) => rank(a) - rank(b));
}

/** What SHADE charges, in credits per 1M tokens (1 credit = $0.001). */
export function creditsPerM(usdPerM: number) {
  return Math.ceil(usdPerM * markup() * 1000);
}