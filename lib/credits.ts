import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { DbError, insert, rpc, select } from './db';

// Anonymous accounts: the user's only credential is a secret key ("shade_sk_...").
// It works both in the web app (kept in the browser) and as the API bearer key.
// We store only its SHA-256 hash, so a database leak does not leak usable keys.

export type Account = { id: string; key_prefix: string; balance_units: number; created_at: string; revoked_at: string | null };

const KEY_PREFIX = 'shade_sk_';

export function hashKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

export async function createAccount(): Promise<{ key: string; account: Account }> {
  const key = KEY_PREFIX + randomBytes(24).toString('base64url');
  const account = await insert<Account>('shade_accounts', { key_hash: hashKey(key), key_prefix: key.slice(0, KEY_PREFIX.length + 4) });
  return { key, account: { ...account, balance_units: Number(account.balance_units) } };
}

export async function findAccountByKey(key: string | null | undefined): Promise<Account | null> {
  if (!key || !key.startsWith(KEY_PREFIX) || key.length < 20 || key.length > 200) return null;
  const rows = await select<Account>('shade_accounts', `key_hash=eq.${hashKey(key)}&select=id,key_prefix,balance_units,created_at,revoked_at&limit=1`);
  const a = rows[0];
  if (!a || a.revoked_at) return null;
  return { ...a, balance_units: Number(a.balance_units) };
}

/** Reads "Authorization: Bearer <key>" or "x-shade-key". */
export function keyFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-shade-key')?.trim() || null;
}

export async function reserve(accountId: string, units: number) {
  return rpc<boolean>('shade_reserve', { p_account: accountId, p_units: Math.ceil(units) });
}

export async function release(accountId: string, units: number) {
  await rpc('shade_release', { p_account: accountId, p_units: Math.ceil(units) });
}

export async function settle(args: {
  accountId: string; reserved: number; actual: number; modelId: string; providerModel: string;
  promptTokens: number; completionTokens: number; source: 'chat' | 'api';
}) {
  const bal = await rpc<number>('shade_settle', {
    p_account: args.accountId, p_reserved: Math.ceil(args.reserved), p_actual: Math.ceil(args.actual),
    p_model: args.modelId, p_provider_model: args.providerModel,
    p_prompt: args.promptTokens, p_completion: args.completionTokens, p_source: args.source,
  });
  return Number(bal);
}

export async function recordFree(modelId: string, providerModel: string, promptTokens: number, completionTokens: number) {
  await rpc('shade_record_free', { p_model: modelId, p_provider_model: providerModel, p_prompt: promptTokens, p_completion: completionTokens });
}

/** Returns true if this hit is allowed. Errors propagate, so the gateway fails closed. */
export async function rateHit(bucket: string, windowSeconds: number, limit: number) {
  return rpc<boolean>('shade_rate_hit', { p_bucket: bucket, p_window_seconds: windowSeconds, p_limit: limit });
}

export { DbError };

/** Salted hash of the client IP, so rate limits work without storing IP addresses. */
export function visitorBucket(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const salt = process.env.SHADE_IP_SALT || 'change-me';
  const day = new Date().toISOString().slice(0, 10);
  return 'ip:' + createHash('sha256').update(`${salt}:${day}:${ip}`).digest('hex').slice(0, 32);
}
