import { rpc } from '@/lib/db';
import { isDatabaseConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

type Stats = { requests_total: number; requests_24h: number; tokens_total: number; deposits_total: number };

// Real, live counters for the site ("requests served"). Cached at the edge for 30s.
export async function GET() {
  if (!isDatabaseConfigured()) return Response.json({ ready: false }, { status: 503 });
  try {
    const s = await rpc<Stats>('shade_public_stats');
    return Response.json({ ready: true, ...s }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
  } catch {
    return Response.json({ ready: false }, { status: 503 });
  }
}
