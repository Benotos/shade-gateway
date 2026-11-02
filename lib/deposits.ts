import 'server-only';
import { getPackages, packageCreditUnits, unitsToCredits } from './config';
import { DbError, insert, rpc, select } from './db';
import { solUsd } from './price';
import { findPayment, lamportsToSol, newReference, solanaPayUrl, uniqueLamports, verifyPastedSignature, type PendingDeposit } from './solana';
import { treasuryAddress } from './config';

const DEPOSIT_TTL_MINUTES = 30;

type DepositRow = PendingDeposit & {
  account_id: string; package_id: string; usd_cents: number; credit_units: number; sol_usd: number;
  status: 'pending' | 'credited' | 'expired'; signature: string | null; received_lamports: number | null; credited_at: string | null;
};

export function publicDeposit(d: DepositRow, balanceUnits?: number) {
  const lamports = Number(d.expected_lamports);
  return {
    id: d.id,
    status: d.status,
    package_id: d.package_id,
    usd: d.usd_cents / 100,
    credits: unitsToCredits(Number(d.credit_units)),
    sol_usd: Number(d.sol_usd),
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
  const expires = new Date(Date.now() + DEPOSIT_TTL_MINUTES * 60_000).toISOString();
  // Retry on the rare collision with another open deposit's exact amount.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await insert<DepositRow>('shade_deposits', {
        account_id: accountId, package_id: pkg.id, usd_cents: pkg.usdCents, credit_units: packageCreditUnits(pkg),
        sol_usd: price, expected_lamports: uniqueLamports(pkg.usdCents, price), reference: newReference(), expires_at: expires,
      });
      return publicDeposit(row);
    } catch (e) {
      if (!(e instanceof DbError && e.status === 409)) throw e;
    }
  }
  throw new DbError('Could not create deposit, try again.', 503);
}

async function load(id: string, accountId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await select<DepositRow>('shade_deposits', `id=eq.${id}&account_id=eq.${accountId}&limit=1`);
  return rows[0] ?? null;
}

/** Returns the deposit, checking the chain (and crediting) if it is still pending. */
export async function checkDeposit(id: string, accountId: string, pastedSignature?: string) {
  let d = await load(id, accountId);
  if (!d) return null;
  if (d.status === 'pending') {
    const pd = { ...d, expected_lamports: Number(d.expected_lamports) };
    const payment = pastedSignature ? await verifyPastedSignature(pd, pastedSignature) : await findPayment(pd);
    if (payment) {
      await rpc<boolean>('shade_credit_deposit', { p_deposit: d.id, p_signature: payment.signature, p_lamports: payment.lamports });
      d = (await load(id, accountId)) ?? d;
    } else if (Date.now() > Date.parse(d.expires_at) + 15 * 60_000) {
      await rpc('shade_expire_deposits');
      d = (await load(id, accountId)) ?? d;
    }
  }
  const acct = await select<{ balance_units: number }>('shade_accounts', `id=eq.${accountId}&select=balance_units&limit=1`);
  return { deposit: publicDeposit(d, Number(acct[0]?.balance_units ?? 0)), pastedRejected: Boolean(pastedSignature && d.status === 'pending') };
}
