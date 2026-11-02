import 'server-only';
import {
  findModel, freeDailyLimit, isProviderConfigured, markup, maxOutputTokens, providerBaseUrl,
  unitsToCredits, UNITS_PER_USD, type ShadeModel,
} from './config';
import { findAccountByKey, recordFree, rateHit, release, reserve, settle, visitorBucket } from './credits';
import { pricedModels } from './catalog';

// The gateway: validate -> rate limit -> hold credits -> call the model -> charge the real cost -> refund the rest.
// Prompts and answers pass through memory only; nothing here writes them anywhere.

export class GatewayError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: Record<string, unknown> = {}) { super(message); }
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
export type ChatInput = { model?: string; messages?: unknown; max_tokens?: unknown; temperature?: unknown };

function validate(body: ChatInput) {
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new GatewayError(400, '`messages` must be a non-empty array.', 'invalid_request');
  if (body.messages.length > 100) throw new GatewayError(400, 'Too many messages (max 100).', 'invalid_request');
  let chars = 0;
  const messages: Msg[] = body.messages.map((m) => {
    const role = (m as Msg)?.role;
    const content = (m as Msg)?.content;
    if (!['system', 'user', 'assistant'].includes(role) || typeof content !== 'string') {
      throw new GatewayError(400, 'Each message needs a role (system/user/assistant) and string content.', 'invalid_request');
    }
    chars += content.length;
    return { role, content };
  });
  if (chars > 200_000) throw new GatewayError(413, 'Prompt too long (max 200,000 characters).', 'prompt_too_long');
  const cap = maxOutputTokens();
  const maxTokens = Math.min(cap, Math.max(1, Math.floor(Number(body.max_tokens) || Math.min(1024, cap))));
  const t = Number(body.temperature);
  const temperature = Number.isFinite(t) ? Math.min(2, Math.max(0, t)) : undefined;
  return { messages, maxTokens, temperature, chars };
}

/** Provider cost in USD -> what we charge, in units. */
const charge = (usd: number) => Math.ceil(usd * markup() * UNITS_PER_USD);

function estimateHoldUnits(model: ShadeModel, chars: number, maxTokens: number) {
  const inTokens = Math.ceil(chars / 3) + 50; // generous: ~3 chars per token
  const usd = (inTokens * model.inputPerM + maxTokens * model.outputPerM) / 1_000_000;
  return Math.max(charge(usd), 1);
}

type ProviderResult = {
  id: string; created: number;
  choices: { index: number; message: { role: string; content: string }; finish_reason: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
};

async function callProvider(model: ShadeModel, messages: Msg[], maxTokens: number, temperature?: number): Promise<ProviderResult> {
  if (!isProviderConfigured()) throw new GatewayError(503, 'Model provider is not configured.', 'provider_not_configured');
  const base = providerBaseUrl();
  const isOpenRouter = base.includes('openrouter.ai');
  const body: Record<string, unknown> = { model: model.providerModel, messages, max_tokens: maxTokens };
  if (temperature !== undefined) body.temperature = temperature;
  if (isOpenRouter) {
    body.usage = { include: true }; // OpenRouter returns the exact USD cost of the call
    // Paid tiers only route to upstream providers that do not store or train on prompts.
    // Free models usually require data collection, which is disclosed on the pricing page.
    if (!model.free) body.provider = { data_collection: 'deny' };
  }
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(55_000),
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        ...(isOpenRouter ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://shade-gateway.vercel.app', 'X-Title': 'SHADE' } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GatewayError(504, 'The model took too long to respond. You were not charged.', 'provider_timeout');
  }
  if (!res.ok) {
    const status = res.status === 429 ? 503 : 502;
    throw new GatewayError(status, res.status === 429 ? 'Model is busy right now, try again shortly. You were not charged.' : 'The model provider returned an error. You were not charged.', 'provider_error');
  }
  const json = await res.json() as ProviderResult;
  if (!json?.choices?.length) throw new GatewayError(502, 'Empty response from model. You were not charged.', 'provider_error');
  return json;
}

export type ChatOutput = {
  id: string; object: 'chat.completion'; created: number; model: string;
  choices: ProviderResult['choices'];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  shade: { charged_credits: number; balance_credits: number | null; free: boolean };
};

export async function runChat(req: Request, key: string | null, body: ChatInput, source: 'chat' | 'api'): Promise<ChatOutput> {
  const wanted = typeof body.model === 'string' ? body.model : findModel(undefined)?.id;
  const model = (await pricedModels()).find((m) => m.id === wanted || m.providerModel === wanted);
  if (!model) throw new GatewayError(400, `Unknown model "${String(body.model)}". See /api/config for available models.`, 'unknown_model');
  const { messages, maxTokens, temperature, chars } = validate(body);
  const visitor = visitorBucket(req);

  if (model.free) {
    if (!(await rateHit(`${visitor}:free:min`, 60, 5))) throw new GatewayError(429, 'Slow down: max 5 free requests per minute.', 'rate_limited');
    if (!(await rateHit(`${visitor}:free:day`, 86_400, freeDailyLimit()))) {
      throw new GatewayError(429, `Free tier limit reached (${freeDailyLimit()} per day). Buy credits to keep going.`, 'free_limit_reached');
    }
    const r = await callProvider(model, messages, Math.min(maxTokens, 1024), temperature);
    const pt = r.usage?.prompt_tokens ?? 0, ct = r.usage?.completion_tokens ?? 0;
    await recordFree(model.id, model.providerModel, pt, ct);
    return shape(r, model, pt, ct, 0, null, true);
  }

  const account = await findAccountByKey(key);
  if (!account) throw new GatewayError(401, 'A valid SHADE key is required for this model. Get one on the purchase page.', 'invalid_key');
  if (!(await rateHit(`acct:${account.id}:min`, 60, 60))) throw new GatewayError(429, 'Rate limit: 60 requests per minute per key.', 'rate_limited');
  if (!(await rateHit(`${visitor}:paid:min`, 60, 120))) throw new GatewayError(429, 'Too many requests from this network.', 'rate_limited');

  const hold = estimateHoldUnits(model, chars, maxTokens);
  if (!(await reserve(account.id, hold))) {
    throw new GatewayError(402, 'Not enough credits for this request. Top up on the purchase page.', 'insufficient_credits', {
      required_credits: unitsToCredits(hold), balance_credits: unitsToCredits(account.balance_units),
    });
  }

  let r: ProviderResult;
  try {
    r = await callProvider(model, messages, maxTokens, temperature);
  } catch (e) {
    await release(account.id, hold);
    throw e;
  }

  const pt = r.usage?.prompt_tokens ?? Math.ceil(chars / 4);
  const ct = r.usage?.completion_tokens ?? Math.ceil((r.choices[0]?.message?.content?.length ?? 0) / 4);
  const providerUsd = typeof r.usage?.cost === 'number'
    ? r.usage.cost
    : (pt * model.inputPerM + ct * model.outputPerM) / 1_000_000;
  const actual = Math.max(charge(providerUsd), 1);
  const balance = await settle({ accountId: account.id, reserved: hold, actual, modelId: model.id, providerModel: model.providerModel, promptTokens: pt, completionTokens: ct, source });
  return shape(r, model, pt, ct, Math.min(actual, hold), balance, false);
}

function shape(r: ProviderResult, model: ShadeModel, pt: number, ct: number, chargedUnits: number, balanceUnits: number | null, free: boolean): ChatOutput {
  return {
    id: r.id || `shade-${Date.now()}`,
    object: 'chat.completion',
    created: r.created || Math.floor(Date.now() / 1000),
    model: model.id,
    choices: r.choices.map((c, i) => ({ index: c.index ?? i, message: { role: 'assistant', content: c.message?.content ?? '' }, finish_reason: c.finish_reason ?? 'stop' })),
    usage: { prompt_tokens: pt, completion_tokens: ct, total_tokens: pt + ct },
    shade: { charged_credits: unitsToCredits(chargedUnits), balance_credits: balanceUnits === null ? null : unitsToCredits(balanceUnits), free },
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof GatewayError) {
    return Response.json({ error: { message: e.message, code: e.code, ...e.extra } }, { status: e.status });
  }
  const status = (e as { status?: number })?.status === 503 ? 503 : 500;
  console.error('[shade] gateway error:', (e as Error)?.message); // message only, never request bodies
  return Response.json({ error: { message: status === 503 ? 'Service not configured.' : 'Internal error.', code: 'internal_error' } }, { status });
}
