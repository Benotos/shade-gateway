import 'server-only';
import { randomUUID } from 'node:crypto';
import { getPackages, packageCreditUnits, treasuryAddress, unitsToCredits } from './config';
import { DbError, exec, isUniqueViolation, now, num, query, tx } from './db';
import { getBalance } from './credits';
import { solUsd } from './price';
import { findPayment, lamportsToSol, newReference, solanaPayUrl, uniqueLamports, verifyPastedSignature, type PendingDeposit } from './solana';

const DEPOSIT_TTL_MINUTES = 30;

type DepositRow = PendingDeposit & {
  account_id: string; package_id: string; usd_cents: number; credit_units: number; sol_usd: number;
  status: 'pending' | 'credited' | 'expired'; signature: string | null; received_lamports: number | null; credited_at: string | null;
};

export function publicDeposit(d: DepositRow, balanceUnits?: number) {
  const lamports = num(d.expected_lamports);
  return {
    id: d.id,
    status: d.status,
    package_id: d.package_id,
    usd: num(d.usd_cents) / 100,
    credits: unitsToCredits(num(d.credit_units)),
    sol_usd: num(d.sol_usd),
    amount_sol: lamportsToSol(lamports),
    amount_lamports: lamports,
    address: treasuryAddress(),
    reference: d.reference,
    solana_pay_url: solanaPayUrl(lamports, d.reference),
    expires_at: d.expires_at,
    signature: d.signature,
    ...(balanceUnits !== undefined ? { balance_credits: unitsToCredits(balanceUnits) } : {}),
  };
}

export async function createDeposit(accountId: string, packageId: string) {
  const pkg = getPackages().find((p) => p.id === packageId);
  if (!pkg) throw new DbError('Unknown package.', 400);
  const price = await solUsd();
  const created = now();
  const expires = new Date(Date.now() + DEPOSIT_TTL_MINUTES * 60_000).toISOString();
  // Retry on the rare collision with another open deposit's exact amount.
  for (let attempt = 0; attempt < 5; attempt++) {
    const row: DepositRow = {
      id: randomUUID(), account_id: accountId, package_id: pkg.id, usd_cents: pkg.usdCents, credit_units: packageCreditUnits(pkg),
      sol_usd: price, expected_lamports: uniqueLamports(pkg.usdCents, price), reference: newReference(),
      status: 'pending', signature: null, received_lamports: null, created_at: created, expires_at: expires, credited_at: null,
    };
    try {
      await exec(
        `INSERT INTO shade_deposits (id, account_id, package_id, usd_cents, credit_units, sol_usd, expected_lamports, reference, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [row.id, row.account_id, row.package_id, row.usd_cents, row.credit_units, row.sol_usd, row.expected_lamports, row.reference, row.created_at, row.expires_at],
      );
      return publicDeposit(row);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new DbError('Could not create deposit, try again.', 503);
}

/** Credit a deposit exactly once. Returns true only on the call that actually credited it. */
export async function creditDeposit(depositId: string, signature: string, lamports: number) {
  try {
    return await tx(async (t) => {
      const ts = now();
      const u = await t.execute({
        sql: "UPDATE shade_deposits SET status = 'credited', signature = ?, received_lamports = ?, credited_at = ? WHERE id = ? AND status = 'pending'",
        args: [signature, lamports, ts, depositId],
      });
      if (u.rowsAffected !== 1) return false; // already credited or expired
      const d = await t.execute({ sql: 'SELECT account_id, credit_units FROM shade_deposits WHERE id = ?', args: [depositId] });
      const accountId = String(d.rows[0].account_id), units = num(d.rows[0].credit_units);
      await t.execute({ sql: 'UPDATE shade_accounts SET balance_units = balance_units + ? WHERE id = ?', args: [units, accountId] });
      await t.execute({ sql: "INSERT INTO shade_ledger (account_id, delta_units, kind, ref, created_at) VALUES (?, ?, 'deposit', ?, ?)", args: [accountId, units, depositId, ts] });
      return true;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return false; // this signature already credited another deposit
    throw e;
  }
}

async function expireStale() {
  await exec("UPDATE shade_deposits SET status = 'expired' WHERE status = 'pending' AND expires_at < ?", [new Date(Date.now() - 15 * 60_000).toISOString()]);
}

async function load(id: string, accountId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await query<DepositRow>('SELECT * FROM shade_deposits WHERE id = ? AND account_id = ? LIMIT 1', [id, accountId]);
  return rows[0] ?? null;
}

/** Returns the deposit, checking the chain (and crediting) if it is still pending. */
export async function checkDeposit(id: string, accountId: string, pastedSignature?: string) {
  let d = await load(id, accountId);
  if (!d) return null;
  if (d.status === 'pending') {
    const pd = { ...d, expected_lamports: num(d.expected_lamports) };
    const payment = pastedSignature ? await verifyPastedSignature(pd, pastedSignature) : await findPayment(pd);
    if (payment) {
      await creditDeposit(d.id, payment.signature, payment.lamports);
      d = (await load(id, accountId)) ?? d;
    } else if (Date.now() > Date.parse(d.expires_at) + 15 * 60_000) {
      await expireStale();
      d = (await load(id, accountId)) ?? d;
    }
  }
  return { deposit: publicDeposit(d, await getBalance(accountId)), pastedRejected: Boolean(pastedSignature && d.status === 'pending') };
}
