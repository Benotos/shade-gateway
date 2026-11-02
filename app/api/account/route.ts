import { createAccount, findAccountByKey, keyFromRequest, rateHit, visitorBucket } from '@/lib/credits';
import { isDatabaseConfigured, unitsToCredits } from '@/lib/config';
import { errorResponse } from '@/lib/gateway';

export const dynamic = 'force-dynamic';

// POST /api/account -> creates an anonymous account and returns its secret key ONCE.
export async function POST(req: Request) {
  try {
    if (!isDatabaseConfigured()) return Response.json({ error: { message: 'Credits are not configured yet.', code: 'not_configured' } }, { status: 503 });
    if (!(await rateHit(`${visitorBucket(req)}:acct:day`, 86_400, 10))) {
      return Response.json({ error: { message: 'Too many keys created from this network today.', code: 'rate_limited' } }, { status: 429 });
    }
    const { key, account } = await createAccount();
    return Response.json({ key, key_prefix: account.key_prefix, balance_credits: 0 }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return errorResponse(e); }
}

// GET /api/account with "Authorization: Bearer shade_sk_..." -> balance.
export async function GET(req: Request) {
  try {
    const account = await findAccountByKey(keyFromRequest(req));
    if (!account) return Response.json({ error: { message: 'Invalid or missing key.', code: 'invalid_key' } }, { status: 401 });
    return Response.json(
      { key_prefix: account.key_prefix, balance_credits: unitsToCredits(account.balance_units), balance_usd: account.balance_units / 1_000_000, created_at: account.created_at },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) { return errorResponse(e); }
}
