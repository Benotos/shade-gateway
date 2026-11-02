// Model catalog and server configuration.
// Models are routed through any OpenAI-compatible provider. OpenRouter is the default because one
// key reaches GPT, Claude, Gemini, Llama, DeepSeek, etc. and it reports the exact USD cost per call.

export type ShadeModel = {
  id: string;            // public id used by the playground and API ("fast", "coder", ...)
  name: string;          // display name
  description: string;
  providerModel: string; // provider's model id, e.g. "openai/gpt-4o-mini"
  tag: string;
  free: boolean;         // free tier: no credits charged, rate limited per visitor
  // Fallback provider prices in USD per 1M tokens, used when live prices/cost are unavailable.
  inputPerM: number;
  outputPerM: number;
};

const descriptions: Record<string, string> = {
  free: 'Free taster on an open model, rate limited',
  fast: 'Fast answers for everyday tasks',
  reason: 'Deep reasoning and complex work',
  coder: 'Code generation and debugging',
};

const defaults: ShadeModel[] = [
  { id: 'free',   name: 'Shade Free',  providerModel: 'meta-llama/llama-3.3-70b-instruct:free', tag: 'FREE',    free: true,  inputPerM: 0,    outputPerM: 0,  description: descriptions.free },
  { id: 'fast',   name: 'Shade Flash', providerModel: 'openai/gpt-4o-mini',                    tag: 'FAST',    free: false, inputPerM: 0.15, outputPerM: 0.6, description: descriptions.fast },
  { id: 'reason', name: 'Shade Core',  providerModel: 'openai/gpt-4.1',                        tag: 'GENERAL', free: false, inputPerM: 2,    outputPerM: 8,  description: descriptions.reason },
  { id: 'coder',  name: 'Shade Code',  providerModel: 'deepseek/deepseek-chat',                tag: 'CODING',  free: false, inputPerM: 0.3,  outputPerM: 0.9, description: descriptions.coder },
];

/**
 * SHADE_MODELS = comma-separated "id:display name:provider model" entries.
 * The provider model may itself contain ":" (e.g. "meta-llama/llama-3.3-70b-instruct:free").
 * A provider model ending in ":free" is treated as the free tier.
 */
export function getModels(): ShadeModel[] {
  const raw = process.env.SHADE_MODELS;
  if (!raw) return defaults;
  const parsed = raw.split(',').map((entry): ShadeModel | null => {
    const parts = entry.split(':').map((v) => v.trim());
    const [id, name] = parts;
    const providerModel = parts.slice(2).join(':');
    if (!id || !name || !providerModel) return null;
    const known = defaults.find((d) => d.providerModel === providerModel || d.id === id);
    const free = providerModel.endsWith(':free');
    return {
      id, name, providerModel, free,
      tag: free ? 'FREE' : id.toUpperCase(),
      description: descriptions[id] ?? known?.description ?? 'General purpose model',
      inputPerM: free ? 0 : known?.inputPerM ?? 2,
      outputPerM: free ? 0 : known?.outputPerM ?? 8,
    };
  }).filter((m): m is ShadeModel => Boolean(m));
  if (!parsed.length) return defaults;
  // Always keep a free taster model unless the free tier is switched off.
  if (!parsed.some((m) => m.free) && process.env.SHADE_FREE_DAILY_LIMIT !== '0') parsed.unshift(defaults[0]);
  return parsed;
}

export function findModel(id: string | undefined): ShadeModel | undefined {
  const models = getModels();
  if (!id) return models.find((m) => !m.free) ?? models[0];
  return models.find((m) => m.id === id || m.providerModel === id);
}

export function isProviderConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && providerBaseUrl());
}

export function providerBaseUrl() {
  return (process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

export function isDatabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isDepositConfigured() {
  return Boolean(treasuryAddress() && isDatabaseConfigured());
}

export function treasuryAddress() {
  return process.env.SOLANA_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_SOLANA_DEPOSIT_ADDRESS || '';
}

export function solanaRpcUrl() {
  return process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
}

/** Multiplier applied to provider cost. 1.5 = 50% margin. */
export function markup() {
  const m = Number(process.env.SHADE_MARKUP ?? '1.5');
  return Number.isFinite(m) && m >= 1 ? m : 1.5;
}

/** Hard cap on output tokens per request so one call can't drain a balance. */
export function maxOutputTokens() {
  const n = Number(process.env.SHADE_MAX_OUTPUT_TOKENS ?? '4096');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4096;
}

// 1,000,000 units = $1. 1 credit = 1,000 units = $0.001.
export const UNITS_PER_USD = 1_000_000;
export const UNITS_PER_CREDIT = 1_000;
export const unitsToCredits = (units: number) => units / UNITS_PER_CREDIT;

export type CreditPackage = { id: string; label: string; usdCents: number; bonusPct: number; highlight?: boolean };

/** Credit packs sold on the purchase page. Override with SHADE_PACKAGES="id:label:usd:bonus%,..." */
export function getPackages(): CreditPackage[] {
  const raw = process.env.SHADE_PACKAGES;
  const fallback: CreditPackage[] = [
    { id: 'starter', label: 'Starter', usdCents: 500,  bonusPct: 0 },
    { id: 'builder', label: 'Builder', usdCents: 2000, bonusPct: 5, highlight: true },
    { id: 'heavy',   label: 'Heavy',   usdCents: 5000, bonusPct: 10 },
  ];
  if (!raw) return fallback;
  const parsed = raw.split(',').map((e) => {
    const [id, label, usd, bonus] = e.split(':').map((v) => v.trim());
    const usdCents = Math.round(Number(usd) * 100);
    if (!id || !label || !Number.isFinite(usdCents) || usdCents <= 0) return null;
    return { id, label, usdCents, bonusPct: Number(bonus) || 0 };
  }).filter((p): p is CreditPackage => Boolean(p));
  return parsed.length ? parsed : fallback;
}

export function packageCreditUnits(p: CreditPackage) {
  return Math.round((p.usdCents / 100) * UNITS_PER_USD * (1 + p.bonusPct / 100));
}

/** Free tier: requests per visitor per day. */
export function freeDailyLimit() {
  const n = Number(process.env.SHADE_FREE_DAILY_LIMIT ?? '20');
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 20;
}
