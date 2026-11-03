import { keyFromRequest } from '@/lib/credits';
import { errorResponse, runChat, runChatStream, sseHeaders, type ChatInput } from '@/lib/gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// OpenAI-compatible endpoint: works with the OpenAI SDKs by setting baseURL to https://YOUR_DOMAIN/v1
// and apiKey to a SHADE key (shade_sk_...). Each call is charged against that key's credits.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as ChatInput | null;
    if (!body) return Response.json({ error: { message: 'Invalid JSON body.', code: 'invalid_request' } }, { status: 400 });
    if (body.stream === true) return new Response(await runChatStream(req, keyFromRequest(req), body, 'api'), { headers: sseHeaders });
    return Response.json(await runChat(req, keyFromRequest(req), body, 'api'), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return errorResponse(e); }
}