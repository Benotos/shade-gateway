import { findAccountByKey, keyFromRequest, rateHit } from '@/lib/credits';
import { createDeposit } from '@/lib/deposits';
import { isDepositConfigured } from '@/lib/config';
import { errorResponse } from '@/lib/gateway';
import { DbError } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/deposits { package_id } with the user's key -> a unique SOL amount + Solana Pay QR link.
export async function POST(req: Request) {
  try {
    if (!isDepositConfigured()) return Response.json({ error: { message: 'Deposits are not configured yet.', code: 'not_configured' } }, { status: 503 });
    const account = await findAccountByKey(keyFromRequest(req));
    if (!account) return Response.json({ error: { message: 'Invalid or missing key.', code: 'invalid_key' } }, { status: 401 });
    if (!(await rateHit(`acct:${account.id}:dep:hour`, 3600, 20))) {
      return Response.json({ error: { message: 'Too many deposit requests, try again later.', code: 'rate_limited' } }, { status: 429 });
    }
    const body = await req.json().catch(() => ({})) as { package_id?: string };
    const deposit = await createDeposit(account.id, String(body.package_id ?? ''));
    return Response.json(deposit, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof DbError && e.status === 400) return Response.json({ error: { message: e.message, code: 'invalid_request' } }, { status: 400 });
    return errorResponse(e);
  }
}
