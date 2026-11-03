import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DbError, exec, now, num, query, tx } from './db';

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
  const account: Account = { id: randomUUID(), key_prefix: key.slice(0, KEY_PREFIX.length + 4), balance_units: 0, created_at: now(), revoked_at: null };
  await exec('INSERT INTO shade_accounts (id, key_hash, key_prefix, balance_units, created_at) VALUES (?, ?, ?, 0, ?)',
    [account.id, hashKey(key), account.key_prefix, account.created_at]);
  return { key, account };
}

export async function findAccountByKey(key: string | null | undefined): Promise<Account | null> {
  if (!key || !key.startsWith(KEY_PREFIX) || key.length < 20 || key.length > 200) return null;
  const rows = await query<Account>('SELECT id, key_prefix, balance_units, created_at, revoked_at FROM shade_accounts WHERE key_hash = ? LIMIT 1', [hashKey(key)]);
  const a = rows[0];
  if (!a || a.revoked_at) return null;
  return { ...a, balance_units: num(a.balance_units) };
}

export async function getBalance(accountId: string) {
  const rows = await query<{ balance_units: number }>('SELECT balance_units FROM shade_accounts WHERE id = ?', [accountId]);
  return num(rows[0]?.balance_units);
}

/** Reads "Authorization: Bearer <key>" or "x-shade-key". */
export function keyFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-shade-key')?.trim() || null;
}

/** Hold funds before calling a model. Atomic: fails if the balance is too low. */
export async function reserve(accountId: string, units: number) {
  const r = await exec(
    'UPDATE shade_accounts SET balance_units = balance_units - ? WHERE id = ? AND revoked_at IS NULL AND balance_units >= ?',
    [Math.ceil(units), accountId, Math.ceil(units)],
  );
  return r.rowsAffected === 1;
}

/** Release a hold completely (model call failed). */
export async function release(accountId: string, units: number) {
  await exec('UPDATE shade_accounts SET balance_units = balance_units + ? WHERE id = ?', [Math.ceil(units), accountId]);
}

/** Charge the real cost, refund the rest of the hold, record usage. Returns the new balance. */
export async function settle(args: {
  accountId: string; reserved: number; actual: number; modelId: string; providerModel: string;
  promptTokens: number; completionTokens: number; source: 'chat' | 'api';
}) {
  const reserved = Math.ceil(args.reserved);
  const charge = Math.min(Math.max(Math.ceil(args.actual), 0), reserved);
  const usageId = randomUUID();
  const ts = now();
  return tx(async (t) => {
    await t.execute({
      sql: 'INSERT INTO shade_usage (id, account_id, model_id, provider_model, prompt_tokens, completion_tokens, cost_units, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [usageId, args.accountId, args.modelId, args.providerModel, args.promptTokens, args.completionTokens, charge, args.source, ts],
    });
    await t.execute({ sql: 'UPDATE shade_accounts SET balance_units = balance_units + ? WHERE id = ?', args: [reserved - charge, args.accountId] });
    if (charge > 0) {
      await t.execute({ sql: "INSERT INTO shade_ledger (account_id, delta_units, kind, ref, created_at) VALUES (?, ?, 'usage', ?, ?)", args: [args.accountId, -charge, usageId, ts] });
    }
    const r = await t.execute({ sql: 'SELECT balance_units FROM shade_accounts WHERE id = ?', args: [args.accountId] });
    return num(r.rows[0]?.balance_units);
  });
}

export async function recordFree(modelId: string, providerModel: string, promptTokens: number, completionTokens: number) {
  await exec(
    "INSERT INTO shade_usage (id, model_id, provider_model, prompt_tokens, completion_tokens, cost_units, source, created_at) VALUES (?, ?, ?, ?, ?, 0, 'free', ?)",
    [randomUUID(), modelId, providerModel, promptTokens, completionTokens, now()],
  );
}

/** Fixed-window rate limit. Returns true if this hit is allowed. Errors propagate, so the gateway fails closed. */
export async function rateHit(bucket: string, windowSeconds: number, limit: number) {
  const w = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const rows = await query<{ hits: number }>(
    'INSERT INTO shade_rate_buckets (bucket, window_start, hits) VALUES (?, ?, 1) ON CONFLICT (bucket, window_start) DO UPDATE SET hits = hits + 1 RETURNING hits',
    [bucket, w],
  );
  if (Math.random() < 0.01) {
    exec('DELETE FROM shade_rate_buckets WHERE window_start < ?', [Math.floor(Date.now() / 1000) - 2 * 86_400]).catch(() => {});
  }
  return num(rows[0]?.hits) <= limit;
}

/** Salted hash of the client IP, so rate limits work without storing IP addresses. */
export function visitorBucket(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const salt = process.env.SHADE_IP_SALT || 'change-me';
  const day = new Date().toISOString().slice(0, 10);
  return 'ip:' + createHash('sha256').update(`${salt}:${day}:${ip}`).digest('hex').slice(0, 32);
}

export { DbError };
