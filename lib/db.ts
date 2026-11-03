import 'server-only';
import { createClient, type Client, type InArgs, type Transaction } from '@libsql/client';

// Turso (libSQL / SQLite) database. Server only.
// Tables are created automatically on first use, so there is no SQL to run by hand.
//
// Units: all money is integer "units", 1,000,000 units = $1. 1 credit = 1,000 units.
// No prompts or answers are ever stored. Usage rows hold model, token counts and cost only.

export class DbError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS shade_accounts (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    balance_units INTEGER NOT NULL DEFAULT 0 CHECK (balance_units >= 0),
    created_at TEXT NOT NULL,
    revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS shade_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES shade_accounts(id),
    delta_units INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('deposit','usage','refund','adjustment')),
    ref TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS shade_ledger_account_idx ON shade_ledger(account_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS shade_deposits (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES shade_accounts(id),
    package_id TEXT NOT NULL,
    usd_cents INTEGER NOT NULL,
    credit_units INTEGER NOT NULL,
    sol_usd REAL NOT NULL,
    expected_lamports INTEGER NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','credited','expired')),
    signature TEXT UNIQUE,
    received_lamports INTEGER,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    credited_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS shade_deposits_status_idx ON shade_deposits(status, expires_at)`,
  // No two open deposits may share the same exact amount.
  `CREATE UNIQUE INDEX IF NOT EXISTS shade_deposits_open_amount_idx ON shade_deposits(expected_lamports) WHERE status = 'pending'`,
  `CREATE TABLE IF NOT EXISTS shade_usage (
    id TEXT PRIMARY KEY,
    account_id TEXT,
    model_id TEXT NOT NULL,
    provider_model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost_units INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL CHECK (source IN ('chat','api','free')),
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS shade_usage_created_idx ON shade_usage(created_at)`,
  `CREATE TABLE IF NOT EXISTS shade_rate_buckets (
    bucket TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, window_start)
  )`,
];

let client: Client | null = null;
let ready: Promise<void> | null = null;

function getClient() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new DbError('Database is not configured (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).', 503);
  if (!client) client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}

/** The connected client, with tables created on first use. */
export async function db(): Promise<Client> {
  const c = getClient();
  if (!ready) {
    ready = c.batch(SCHEMA, 'write').then(() => undefined).catch((e) => { ready = null; throw e; });
  }
  await ready;
  return c;
}

export async function query<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  const r = await (await db()).execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function exec(sql: string, args: InArgs = []) {
  return (await db()).execute({ sql, args });
}

/** Runs fn inside a write transaction; commits on success, rolls back on error. */
export async function tx<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
  const t = await (await db()).transaction('write');
  try {
    const out = await fn(t);
    await t.commit();
    return out;
  } catch (e) {
    await t.rollback().catch(() => {});
    throw e;
  } finally {
    t.close();
  }
}

export function isUniqueViolation(e: unknown) {
  const m = String((e as { message?: string })?.message ?? e);
  return m.includes('UNIQUE constraint failed') || m.includes('SQLITE_CONSTRAINT');
}

export const now = () => new Date().toISOString();
export const num = (v: unknown) => Number(v ?? 0);
