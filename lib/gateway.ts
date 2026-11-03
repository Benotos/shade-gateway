import 'server-only';
import {
  findModel, freeDailyLimit, isProviderConfigured, markup, matchesModel, maxOutputTokens, providerBaseUrl,
  unitsToCredits, UNITS_PER_USD, type ShadeModel,
} from './config';
import { findAccountByKey, recordFree, rateHit, release, reserve, settle, visitorBucket } from './credits';
import { freeModelIds, pricedModels } from './catalog';

// The gateway: validate -> rate limit -> hold credits -> call the model -> charge the real cost -> refund the rest.
// Prompts and answers pass through memory only; nothing here writes them anywhere.

export class GatewayError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: Record<string, unknown> = {}) { super(message); }
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
export type ChatInput = {
  model?: unknown; messages?: unknown; max_tokens?: unknown; max_completion_tokens?: unknown; temperature?: unknown;
  top_p?: unknown; stop?: unknown; presence_penalty?: unknown; frequency_penalty?: unknown; seed?: unknown; stream?: unknown;
  tools?: unknown; functions?: unknown; tool_choice?: unknown; function_call?: unknown; n?: unknown;
};

const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return v === undefined || v === null || !Number.isFinite(n) ? undefined : Math.min(max, Math.max(min, n));
};

/** Accepts plain strings and OpenAI-style content parts ([{ type: 'text', text }]). */
function textOf(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = content.map((p) => (p && typeof p === 'object' && (p as { type?: string }).type === 'text' ? String((p as { text?: unknown }).text ?? '') : null));
    if (parts.some((p) => p === null)) return null; // images, audio, files aren't supported yet
    return parts.join('\n');
  }
  return null;
}

function validate(body: ChatInput, model: ShadeModel) {
  if (body.tools !== undefined || body.functions !== undefined || body.tool_choice !== undefined || body.function_call !== undefined) {
    throw new GatewayError(400, 'Tool and function calling are not supported yet. Remove `tools` / `functions` from the request.', 'invalid_request');
  }
  if (body.n !== undefined && Number(body.n) !== 1) throw new GatewayError(400, '`n` must be 1. Send separate requests for multiple completions.', 'invalid_request');
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new GatewayError(400, '`messages` must be a non-empty array.', 'invalid_request');
  if (body.messages.length > 200) throw new GatewayError(400, 'Too many messages (max 200).', 'invalid_request');
  let chars = 0;
  const messages: Msg[] = body.messages.map((m, i) => {
    const rawRole = (m as { role?: string })?.role;
    const role = rawRole === 'developer' ? 'system' : rawRole;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      throw new GatewayError(400, `messages[${i}].role must be system, developer, user or assistant. Tool calls aren't supported yet.`, 'invalid_request');
    }
    const content = textOf((m as { content?: unknown })?.content);
    if (content === null) throw new GatewayError(400, `messages[${i}].content must be a string or text parts. Images and files aren't supported yet.`, 'invalid_request');
    chars += content.length;
    return { role, content };
  });
  if (chars > 400_000) throw new GatewayError(413, 'Prompt too long (max 400,000 characters).', 'prompt_too_long');

  const cap = maxOutputTokens();
  const asked = num(body.max_completion_tokens ?? body.max_tokens, 1, cap);
  // Thinking models spend part of the budget on reasoning, so they always get the full cap.
  const maxTokens = model.reasoning ? cap : Math.floor(asked ?? Math.min(2048, cap));
  const stop = typeof body.stop === 'string' ? [body.stop]
    : Array.isArray(body.stop) ? body.stop.filter((s) => typeof s === 'string').slice(0, 4) : undefined;
  const params: Record<string, unknown> = {
    temperature: num(body.temperature, 0, 2), top_p: num(body.top_p, 0, 1),
    presence_penalty: num(body.presence_penalty, -2, 2), frequency_penalty: num(body.frequency_penalty, -2, 2),
    seed: num(body.seed, 0, Number.MAX_SAFE_INTEGER), stop: stop?.length ? stop : undefined,
  };
  Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);
  return { messages, maxTokens, chars, params };
}

/** Provider cost in USD -> what we charge, in units. */
const charge = (usd: number) => Math.ceil(usd * markup() * UNITS_PER_USD);
const estimateUsd = (m: ShadeModel, inTok: number, outTok: number) => (inTok * m.inputPerM + outTok * m.outputPerM) / 1_000_000;

function estimateHoldUnits(model: ShadeModel, chars: number, maxTokens: number) {
  return Math.max(charge(estimateUsd(model, Math.ceil(chars / 3) + 50, maxTokens)), 1);
}

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
type ProviderResult = {
  id: string; created: number;
  choices: { index: number; message: { role: string; content: string | null }; finish_reason: string }[];
  usage?: Usage;
};

/** Opens a request to the provider. Returns the OK response, or throws a GatewayError with the reason. */
async function openProvider(model: ShadeModel, providerModel: string, messages: Msg[], maxTokens: number, params: Record<string, unknown>, stream: boolean): Promise<Response> {
  if (!isProviderConfigured()) throw new GatewayError(503, 'Model provider is not configured.', 'provider_not_configured');
  const base = providerBaseUrl();
  const isOpenRouter = base.includes('openrouter.ai');
  const body: Record<string, unknown> = { model: providerModel, messages, max_tokens: maxTokens, ...params };
  if (stream) { body.stream = true; body.stream_options = { include_usage: true }; }
  if (isOpenRouter) {
    body.usage = { include: true }; // OpenRouter returns the exact USD cost of the call
    // Paid tiers only route to upstream providers that do not store or train on prompts.
    // Free models usually require data collection, which is disclosed on the site.
    if (!model.free) body.provider = { data_collection: 'deny' };
    if (model.reasoning) body.reasoning = { effort: 'low', exclude: true };
  }
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(58_000),
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
    // Log the provider's reason (never the prompt) so it shows in Vercel -> Logs.
    const detail = (await res.text().catch(() => '')).slice(0, 400);
    console.error(`[shade] provider ${res.status} for ${providerModel}: ${detail}`);
    const reason =
      res.status === 401 ? 'provider key is invalid' :
      res.status === 402 ? 'provider account is out of credit' :
      res.status === 404 && /data policy|privacy/i.test(detail) ? 'no private provider is available for this model' :
      res.status === 404 ? 'model not found at provider' :
      res.status === 429 ? 'model is busy or rate limited' :
      `provider error ${res.status}`;
    throw new GatewayError(res.status === 429 ? 503 : 502, `The model couldn't answer (${reason}). You were not charged.`, `provider_${res.status}`);
  }
  return res;
}

// Remembers a working free model per server instance after a fallback.
let freeOverride: string | null = null;

/** Runs `attempt` on the model; for the free tier, falls back to other free models OpenRouter serves. */
async function withModel<T>(model: ShadeModel, attempt: (providerModel: string) => Promise<T>): Promise<{ value: T; used: string }> {
  if (!model.free) return { value: await attempt(model.providerModel), used: model.providerModel };
  const tried: string[] = [];
  const candidates = [freeOverride ?? model.providerModel];
  for (let i = 0; i < candidates.length && i < 4; i++) {
    const id = candidates[i];
    tried.push(id);
    try {
      const value = await attempt(id);
      if (id !== model.providerModel) freeOverride = id;
      return { value, used: id };
    } catch (e) {
      const retryable = e instanceof GatewayError && ['provider_404', 'provider_400', 'provider_429', 'provider_502', 'provider_503'].includes(e.code);
      if (!retryable) throw e;
      if (candidates.length === 1) candidates.push(...(await freeModelIds(tried)).slice(0, 3));
      if (i === candidates.length - 1) throw e;
    }
  }
  throw new GatewayError(503, 'No free model is available right now. Try again shortly.', 'free_unavailable');
}

type Prepared = {
  model: ShadeModel; messages: Msg[]; maxTokens: number; chars: number; params: Record<string, unknown>;
  account: { id: string } | null; hold: number;
};

/** Validates the request, applies rate limits and holds credits for paid models. */
async function prepare(req: Request, key: string | null, body: ChatInput): Promise<Prepared> {
  const wanted = typeof body.model === 'string' && body.model ? body.model : findModel(undefined)?.id ?? '';
  const model = (await pricedModels()).find((m) => matchesModel(m, wanted));
  if (!model) throw new GatewayError(400, `Unknown model "${String(body.model)}". GET /v1/models lists the available ids.`, 'unknown_model');
  const { messages, maxTokens, chars, params } = validate(body, model);
  const visitor = visitorBucket(req);

  if (model.free) {
    if (!(await rateHit(`${visitor}:free:min`, 60, 5))) throw new GatewayError(429, 'Slow down: max 5 free requests per minute.', 'rate_limited');
    if (!(await rateHit(`${visitor}:free:day`, 86_400, freeDailyLimit()))) {
      throw new GatewayError(429, `Free tier limit reached (${freeDailyLimit()} per day). Buy credits to keep going.`, 'free_limit_reached');
    }
    return { model, messages, maxTokens: Math.min(maxTokens, 2048), chars, params, account: null, hold: 0 };
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
  return { model, messages, maxTokens, chars, params, account, hold };
}

/** Charges the real cost (or records free usage). Returns charged units and the new balance. */
async function finish(p: Prepared, used: string, usage: Usage | undefined, outChars: number, source: 'chat' | 'api') {
  const pt = usage?.prompt_tokens ?? Math.ceil(p.chars / 4);
  const ct = usage?.completion_tokens ?? Math.ceil(outChars / 4);
  if (!p.account) {
    await recordFree(p.model.id, used, pt, ct).catch(() => {});
    return { pt, ct, chargedUnits: 0, balanceUnits: null as number | null };
  }
  const usd = typeof usage?.cost === 'number' ? usage.cost : estimateUsd(p.model, pt, ct);
  const actual = Math.max(charge(usd), 1);
  const balanceUnits = await settle({ accountId: p.account.id, reserved: p.hold, actual, modelId: p.model.id, providerModel: used, promptTokens: pt, completionTokens: ct, source });
  return { pt, ct, chargedUnits: Math.min(actual, p.hold), balanceUnits };
}

const shadeInfo = (chargedUnits: number, balanceUnits: number | null, free: boolean) => ({
  charged_credits: unitsToCredits(chargedUnits), balance_credits: balanceUnits === null ? null : unitsToCredits(balanceUnits), free,
});

export type ChatOutput = {
  id: string; object: 'chat.completion'; created: number; model: string;
  choices: { index: number; message: { role: 'assistant'; content: string }; finish_reason: string }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  shade: ReturnType<typeof shadeInfo>;
};

/** Non-streaming chat completion. */
export async function runChat(req: Request, key: string | null, body: ChatInput, source: 'chat' | 'api'): Promise<ChatOutput> {
  const p = await prepare(req, key, body);
  let r: ProviderResult, used: string;
  try {
    ({ value: r, used } = await withModel(p.model, async (id) => {
      const res = await openProvider(p.model, id, p.messages, p.maxTokens, p.params, false);
      const json = await res.json() as ProviderResult;
      if (!json?.choices?.length) throw new GatewayError(502, 'Empty response from model. You were not charged.', 'provider_502');
      return json;
    }));
  } catch (e) {
    if (p.account) await release(p.account.id, p.hold);
    throw e;
  }
  const out = r.choices.map((c) => c.message?.content ?? '').join('');
  const f = await finish(p, used, r.usage, out.length, source);
  return {
    id: r.id || `shade-${Date.now()}`,
    object: 'chat.completion',
    created: r.created || Math.floor(Date.now() / 1000),
    model: p.model.id,
    choices: r.choices.map((c, i) => ({ index: c.index ?? i, message: { role: 'assistant', content: c.message?.content ?? '' }, finish_reason: c.finish_reason ?? 'stop' })),
    usage: { prompt_tokens: f.pt, completion_tokens: f.ct, total_tokens: f.pt + f.ct },
    shade: shadeInfo(f.chargedUnits, f.balanceUnits, !p.account),
  };
}

/**
 * Streaming chat completion (Server-Sent Events, OpenAI chunk format).
 * The last chunk before [DONE] carries `usage` and the `shade` billing summary.
 */
export async function runChatStream(req: Request, key: string | null, body: ChatInput, source: 'chat' | 'api'): Promise<ReadableStream<Uint8Array>> {
  const p = await prepare(req, key, body);
  let upstream: Response, used: string;
  try {
    ({ value: upstream, used } = await withModel(p.model, (id) => openProvider(p.model, id, p.messages, p.maxTokens, p.params, true)));
  } catch (e) {
    if (p.account) await release(p.account.id, p.hold);
    throw e;
  }

  const enc = new TextEncoder();
  const reader = upstream.body!.getReader();
  let usage: Usage | undefined;
  let outChars = 0, id = `shade-${Date.now()}`, created = Math.floor(Date.now() / 1000);
  let settled = false;
  const settleOnce = async () => {
    if (settled) return null;
    settled = true;
    return finish(p, used, usage, outChars, source);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (text: string) => { if (!open) return; try { controller.enqueue(enc.encode(text)); } catch { open = false; } };
      const send = (obj: unknown) => write(`data: ${JSON.stringify(obj)}\n\n`);
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue; // provider comments / keep-alives
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            let chunk: { id?: string; created?: number; model?: string; choices?: { delta?: { content?: string | null } }[]; usage?: Usage; error?: { message?: string } };
            try { chunk = JSON.parse(data); } catch { continue; }
            if (chunk.error) throw new GatewayError(502, chunk.error.message || 'The model stopped with an error.', 'provider_stream_error');
            if (chunk.id) id = chunk.id;
            if (chunk.created) created = chunk.created;
            if (chunk.usage) usage = chunk.usage;
            const choices = chunk.choices ?? [];
            for (const c of choices) outChars += c.delta?.content?.length ?? 0;
            if (choices.length) {
              const { usage: _u, ...rest } = chunk;
              send({ ...rest, model: p.model.id });
            }
          }
        }
      } catch (e) {
        const err = e instanceof GatewayError ? e : new GatewayError(502, 'The stream was interrupted.', 'provider_stream_error');
        send({ error: { message: err.message, code: err.code } });
      }
      try {
        const f = await settleOnce();
        if (f) {
          send({
            id, object: 'chat.completion.chunk', created, model: p.model.id, choices: [],
            usage: { prompt_tokens: f.pt, completion_tokens: f.ct, total_tokens: f.pt + f.ct },
            shade: shadeInfo(f.chargedUnits, f.balanceUnits, !p.account),
          });
        }
      } catch (e) {
        console.error('[shade] settle failed:', (e as Error)?.message);
      }
      write('data: [DONE]\n\n');
      if (open) { try { controller.close(); } catch { /* client already gone */ } }
    },
    async cancel() {
      // Client went away: stop the model and charge only for what was generated.
      await reader.cancel().catch(() => {});
      await settleOnce().catch((e) => console.error('[shade] settle on cancel failed:', (e as Error)?.message));
    },
  });
}

export const sseHeaders = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export function errorResponse(e: unknown) {
  if (e instanceof GatewayError) {
    return Response.json({ error: { message: e.message, code: e.code, ...e.extra } }, { status: e.status });
  }
  const status = (e as { status?: number })?.status === 503 ? 503 : 500;
  console.error('[shade] gateway error:', (e as Error)?.message); // message only, never request bodies
  return Response.json({ error: { message: status === 503 ? 'Service not configured.' : 'Internal error.', code: 'internal_error' } }, { status });
}