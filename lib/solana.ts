import 'server-only';
import { randomBytes } from 'node:crypto';
import { solanaRpcUrl, treasuryAddress } from './config';

// Deposit detection without wallet connect.
// Every purchase gets (a) a unique Solana Pay "reference" key added to the QR transfer and
// (b) a unique exact lamport amount. A QR payment is found through its reference; a manual
// copy-paste send is matched by its exact amount. Either way, one transfer can credit one purchase.

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58(bytes: Uint8Array) {
  let n = BigInt('0x' + (Buffer.from(bytes).toString('hex') || '0'));
  let out = '';
  while (n > BigInt(0)) { out = ALPHABET[Number(n % BigInt(58))] + out; n /= BigInt(58); }
  for (const b of bytes) { if (b === 0) out = '1' + out; else break; }
  return out;
}

/** A random 32-byte value encoded like a public key: valid as a Solana Pay reference. */
export function newReference() {
  return base58(randomBytes(32));
}

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Base amount rounded down to 0.0001 SOL, plus a random tail so each open deposit is unique. */
export function uniqueLamports(usdCents: number, solUsd: number) {
  const base = Math.floor(((usdCents / 100) / solUsd) * LAMPORTS_PER_SOL / 100_000) * 100_000;
  const tail = 1 + Math.floor(Math.random() * 99_999); // < 0.0001 SOL extra
  return base + tail;
}

export function lamportsToSol(l: number) {
  return (l / LAMPORTS_PER_SOL).toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
}

export function solanaPayUrl(lamports: number, reference: string) {
  const p = new URLSearchParams({ amount: lamportsToSol(lamports), reference, label: 'SHADE', message: 'SHADE credits' });
  return `solana:${treasuryAddress()}?${p.toString()}`;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(solanaRpcUrl(), {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`Solana RPC ${method}: ${json.error.message}`);
  return json.result as T;
}

type SigInfo = { signature: string; err: unknown; blockTime: number | null; confirmationStatus?: string };
type ParsedTx = {
  blockTime: number | null;
  meta: { err: unknown; preBalances: number[]; postBalances: number[] } | null;
  transaction: { message: { accountKeys: { pubkey: string }[] } };
};

export function signatures(address: string, limit: number) {
  return rpc<SigInfo[]>('getSignaturesForAddress', [address, { limit, commitment: 'confirmed' }]);
}

// Per-instance cache: signature -> lamports the treasury received (null = not relevant).
const seen = new Map<string, { lamports: number; blockTime: number } | null>();

/** Lamports the treasury gained in this transaction, or null if failed / not a deposit. */
export async function treasuryGain(signature: string) {
  if (seen.has(signature)) return seen.get(signature)!;
  const tx = await rpc<ParsedTx | null>('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  if (!tx) return null; // not visible yet: don't cache
  let result: { lamports: number; blockTime: number } | null = null;
  if (tx.meta && !tx.meta.err && tx.blockTime) {
    const i = tx.transaction.message.accountKeys.findIndex((k) => k.pubkey === treasuryAddress());
    if (i >= 0) {
      const gain = tx.meta.postBalances[i] - tx.meta.preBalances[i];
      if (gain > 0) result = { lamports: gain, blockTime: tx.blockTime };
    }
  }
  seen.set(signature, result);
  if (seen.size > 5000) seen.delete(seen.keys().next().value as string);
  return result;
}

export type PendingDeposit = { id: string; reference: string; expected_lamports: number; created_at: string; expires_at: string };

const GRACE_SECONDS = 15 * 60;

/**
 * Looks for a confirmed payment for this deposit.
 * Reference match: accepts the payment if it is at least the expected amount.
 * Amount match (manual send): requires the exact unique amount inside the deposit's time window.
 */
export async function findPayment(d: PendingDeposit): Promise<{ signature: string; lamports: number } | null> {
  const start = Date.parse(d.created_at) / 1000 - 120;
  const end = Date.parse(d.expires_at) / 1000 + GRACE_SECONDS;
  const inWindow = (t: number) => t >= start && t <= end;

  for (const s of await signatures(d.reference, 5)) {
    if (s.err) continue;
    const g = await treasuryGain(s.signature);
    if (g && inWindow(g.blockTime) && g.lamports >= d.expected_lamports) return { signature: s.signature, lamports: g.lamports };
  }

  const recent = (await signatures(treasuryAddress(), 50)).filter((s) => !s.err && s.blockTime && inWindow(s.blockTime));
  for (const s of recent.slice(0, 25)) {
    const g = await treasuryGain(s.signature);
    if (g && g.lamports === Number(d.expected_lamports)) return { signature: s.signature, lamports: g.lamports };
  }
  return null;
}

/** Verify a signature the user pasted (manual send). Same exact-amount rule. */
export async function verifyPastedSignature(d: PendingDeposit, signature: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature)) return null;
  const g = await treasuryGain(signature);
  if (!g) return null;
  const start = Date.parse(d.created_at) / 1000 - 120;
  const end = Date.parse(d.expires_at) / 1000 + GRACE_SECONDS;
  if (g.blockTime < start || g.blockTime > end) return null;
  if (g.lamports !== Number(d.expected_lamports)) return null;
  return { signature, lamports: g.lamports };
}
