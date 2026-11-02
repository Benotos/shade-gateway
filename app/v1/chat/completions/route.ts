import { keyFromRequest } from '@/lib/credits';
import { errorResponse, runChat, type ChatInput } from '@/lib/gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// OpenAI-compatible endpoint: works with the OpenAI SDKs by setting baseURL to https://YOUR_DOMAIN/v1
// and apiKey to a SHADE key (shade_sk_...). Each call is charged against that key's credits.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as (ChatInput & { stream?: boolean }) | null;
    if (!body) return Response.json({ error: { message: 'Invalid JSON body.', code: 'invalid_request' } }, { status: 400 });
    if (body.stream) return Response.json({ error: { message: 'Streaming is not supported yet. Send stream: false.', code: 'stream_unsupported' } }, { status: 400 });
    return Response.json(await runChat(req, keyFromRequest(req), body, 'api'), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return errorResponse(e); }
}
