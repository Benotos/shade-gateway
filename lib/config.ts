// Model catalog and server configuration.
// Models are routed through OpenRouter (or any OpenAI-compatible provider). One key reaches GPT, Claude,
// Gemini, DeepSeek, Llama and more, and OpenRouter reports the exact USD cost of every call.

export type ShadeModel = {
  id: string;            // public id used by the chat and API, e.g. "gpt-4.1"
  name: string;          // display name
  vendor: string;        // who makes the model
  description: string;
  providerModel: string; // provider's model id, e.g. "openai/gpt-4.1"
  tag: string;           // short label: FREE, FAST, SMART, CODE, REASONING
  free: boolean;         // free tier: no credits charged, rate limited per visitor
  reasoning?: boolean;   // thinking model: sends low reasoning effort and needs more output room
  aliases?: string[];    // older ids that still work in the API
  // Fallback provider prices in USD per 1M tokens, used when live prices are unavailable.
  inputPerM: number;
  outputPerM: number;
};

const defaults: ShadeModel[] = [
  { id: 'free', name: 'Llama 3.3 70B (free)', vendor: 'Meta', tag: 'FREE', free: true,
    providerModel: 'meta-llama/llama-3.3-70b-instruct:free', inputPerM: 0, outputPerM: 0,
    description: 'Free taster on an open model. Rate limited, and may log prompts.' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', vendor: 'OpenAI', tag: 'FAST', free: false, aliases: ['fast'],
    providerModel: 'openai/gpt-4o-mini', inputPerM: 0.15, outputPerM: 0.6,
    description: 'Fast and very cheap. Great for everyday questions and quick drafts.' },
  { id: 'gpt-4.1', name: 'GPT-4.1', vendor: 'OpenAI', tag: 'SMART', free: false, aliases: ['reason'],
    providerModel: 'openai/gpt-4.1', inputPerM: 2, outputPerM: 8,
    description: 'Strong all-rounder for writing, analysis and long instructions.' },
  { id: 'gpt-5', name: 'GPT-5', vendor: 'OpenAI', tag: 'REASONING', free: false, reasoning: true,
    providerModel: 'openai/gpt-5', inputPerM: 1.25, outputPerM: 10,
    description: 'OpenAI flagship that thinks before answering. Best for hard problems.' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', vendor: 'Anthropic', tag: 'SMART', free: false,
    providerModel: '~anthropic/claude-sonnet-latest', inputPerM: 3, outputPerM: 15,
    description: "Anthropic's latest Sonnet. Excellent at writing, coding and careful reasoning." },
  { id: 'gemini-flash', name: 'Gemini Flash', vendor: 'Google', tag: 'FAST', free: false,
    providerModel: '~google/gemini-flash-latest', inputPerM: 0.3, outputPerM: 2.5,
    description: "Google's latest Flash model. Quick, cheap and good with long inputs." },
  { id: 'gemini-pro', name: 'Gemini Pro', vendor: 'Google', tag: 'SMART', free: false,
    providerModel: '~google/gemini-pro-latest', inputPerM: 2, outputPerM: 12,
    description: "Google's latest Pro model for deep analysis and research." },
  { id: 'deepseek-v3', name: 'DeepSeek V3', vendor: 'DeepSeek', tag: 'CODE', free: false, aliases: ['coder'],
    providerModel: 'deepseek/deepseek-chat', inputPerM: 0.3, outputPerM: 0.9,
    description: 'Open-weight model that is strong at code and maths, at a low price.' },
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', vendor: 'Meta', tag: 'OPEN', free: false,
    providerModel: 'meta-llama/llama-3.3-70b-instruct', inputPerM: 0.13, outputPerM: 0.4,
    description: 'Open model on paid, non-logging providers. Cheap and private.' },
];

/**
 * Optional override: SHADE_MODEL_LIST = comma-separated "id|display name|provider model" entries,
 * e.g. "gpt-4.1|GPT-4.1|openai/gpt-4.1". Ids that match a built-in model keep its details.
 * (The old SHADE_MODELS variable is ignored, so the built-in lineup is used unless you opt in.)
 */
export function getModels(): ShadeModel[] {
  const raw = process.env.SHADE_MODEL_LIST;
  if (!raw) return defaults;
  const parsed = raw.split(',').map((entry): ShadeModel | null => {
    const [id, name, providerModel] = entry.split('|').map((v) => v.trim());
    if (!id || !name || !providerModel) return null;
    const known = defaults.find((d) => d.id === id || d.providerModel === providerModel);
    const free = providerModel.endsWith(':free');
    return {
      vendor: providerModel.replace(/^~/, '').split('/')[0],
      tag: free ? 'FREE' : 'MODEL',
      description: 'General purpose model',
      aliases: [],
      inputPerM: free ? 0 : 3,
      outputPerM: free ? 0 : 15,
      ...known,
      id, name, providerModel, free,
    };
  }).filter((m): m is ShadeModel => Boolean(m));
  if (!parsed.length) return defaults;
  if (!parsed.some((m) => m.free) && process.env.SHADE_FREE_DAILY_LIMIT !== '0') parsed.unshift(defaults[0]);
  return parsed;
}

export function matchesModel(m: ShadeModel, id: string) {
  return m.id === id || m.providerModel === id || Boolean(m.aliases?.includes(id));
}

export function findModel(id: string | undefined): ShadeModel | undefined {
  const models = getModels();
  if (!id) return models.find((m) => !m.free) ?? models[0];
  return models.find((m) => matchesModel(m, id));
}

export function isProviderConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && providerBaseUrl());
}

export function providerBaseUrl() {
  return (process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

export function isDatabaseConfigured() {
  return Boolean(process.env.TURSO_DATABASE_URL);
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