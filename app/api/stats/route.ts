import { num, query } from '@/lib/db';
import { isDatabaseConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Real, live counters for the site ("requests served"). Cached at the edge for 30s.
export async function GET() {
  if (!isDatabaseConfigured()) return Response.json({ ready: false }, { status: 503 });
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [r] = await query(
      `SELECT
         (SELECT COUNT(*) FROM shade_usage) AS requests_total,
         (SELECT COUNT(*) FROM shade_usage WHERE created_at > ?) AS requests_24h,
         (SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) FROM shade_usage) AS tokens_total,
         (SELECT COUNT(*) FROM shade_deposits WHERE status = 'credited') AS deposits_total`,
      [since],
    );
    return Response.json(
      { ready: true, requests_total: num(r.requests_total), requests_24h: num(r.requests_24h), tokens_total: num(r.tokens_total), deposits_total: num(r.deposits_total) },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  } catch {
    return Response.json({ ready: false }, { status: 503 });
  }
}
