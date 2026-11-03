import 'server-only';
import { getModels, markup, providerBaseUrl, type ShadeModel } from './config';

// Live model list and prices from OpenRouter (/api/v1/models), cached for an hour.
// Used to (1) show current prices and (2) hide models the provider no longer serves.
// If the list can't be loaded, every configured model is shown with its fallback price.

type Live = { at: number; ok: boolean; prices: Map<string, { inputPerM: number; outputPerM: number }> };
let cache: Live | null = null;

async function live(): Promise<Live> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache;
  const prices = new Map<string, { inputPerM: number; outputPerM: number }>();
  let ok = false;
  if (providerBaseUrl().includes('openrouter.ai')) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/models', { next: { revalidate: 3600 } });
      const json = await r.json() as { data?: { id: string; pricing?: { prompt?: string; completion?: string } }[] };
      for (const m of json.data ?? []) {
        const p = Number(m.pricing?.prompt), c = Number(m.pricing?.completion);
        if (Number.isFinite(p) && Number.isFinite(c)) prices.set(m.id, { inputPerM: p * 1e6, outputPerM: c * 1e6 });
      }
      ok = prices.size > 50;
    } catch { /* fall back to configured prices */ }
  }
  cache = { at: Date.now(), ok, prices };
  return cache;
}

/** Available models with current provider prices filled in. */
export async function pricedModels(): Promise<ShadeModel[]> {
  const { ok, prices } = await live();
  return getModels().flatMap((m) => {
    const p = prices.get(m.providerModel);
    // "~vendor/x-latest" aliases and free models aren't always in the list, so they are never hidden.
    const alwaysShow = m.free || m.providerModel.startsWith('~');
    if (ok && !p && !alwaysShow) return [];
    return [p && !m.free ? { ...m, inputPerM: p.inputPerM, outputPerM: p.outputPerM } : m];
  });
}

/**
 * Free models OpenRouter currently serves, best first. Free models change often, so the free
 * tier falls back to one of these when the configured one is gone.
 */
export async function freeModelIds(exclude: string[] = []): Promise<string[]> {
  const { prices } = await live();
  const preferred = ['meta-llama/llama-3.3-70b', 'deepseek/deepseek', 'google/gemini', 'google/gemma-3', 'mistralai/mistral-small', 'qwen/qwen3', 'meta-llama/'];
  const free = [...prices.keys()].filter((id) => id.endsWith(':free') && !exclude.includes(id));
  const rank = (id: string) => { const i = preferred.findIndex((p) => id.startsWith(p)); return i < 0 ? preferred.length : i; };
  return free.sort((a, b) => rank(a) - rank(b));
}

/** What SHADE charges, in credits per 1M tokens (1 credit = $0.001). */
export function creditsPerM(usdPerM: number) {
  return Math.ceil(usdPerM * markup() * 1000);
}