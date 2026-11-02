import { findAccountByKey, keyFromRequest, rateHit } from '@/lib/credits';
import { checkDeposit } from '@/lib/deposits';
import { errorResponse } from '@/lib/gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function handle(req: Request, id: string, signature?: string) {
  const account = await findAccountByKey(keyFromRequest(req));
  if (!account) return Response.json({ error: { message: 'Invalid or missing key.', code: 'invalid_key' } }, { status: 401 });
  if (!(await rateHit(`acct:${account.id}:poll:min`, 60, 30))) {
    return Response.json({ error: { message: 'Checking too often, slow down.', code: 'rate_limited' } }, { status: 429 });
  }
  const result = await checkDeposit(id, account.id, signature);
  if (!result) return Response.json({ error: { message: 'Deposit not found.', code: 'not_found' } }, { status: 404 });
  return Response.json({ ...result.deposit, signature_rejected: result.pastedRejected }, { headers: { 'Cache-Control': 'no-store' } });
}

// GET /api/deposits/:id -> status (checks the chain while pending)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return await handle(req, (await params).id); } catch (e) { return errorResponse(e); }
}

// POST /api/deposits/:id { signature } -> claim a manual transfer by its transaction signature
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json().catch(() => ({})) as { signature?: string };
    return await handle(req, (await params).id, String(body.signature ?? '').trim());
  } catch (e) { return errorResponse(e); }
}
