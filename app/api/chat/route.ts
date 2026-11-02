import { keyFromRequest } from '@/lib/credits';
import { errorResponse, runChat, type ChatInput } from '@/lib/gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Playground endpoint. Body: { model, messages, max_tokens?, temperature?, accessKey? }
// The key can also be sent as "Authorization: Bearer shade_sk_..." or "x-shade-key".
// The free model works without a key (rate limited per visitor).
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as (ChatInput & { accessKey?: string }) | null;
    if (!body) return Response.json({ error: { message: 'Invalid JSON body.', code: 'invalid_request' } }, { status: 400 });
    const key = keyFromRequest(req) ?? (typeof body.accessKey === 'string' ? body.accessKey : null);
    const out = await runChat(req, key, body, 'chat');
    const content = out.choices[0]?.message.content ?? '';
    // `content` and `message` are included for simple playground UIs; the rest is OpenAI-shaped.
    return Response.json({ ...out, content, message: { role: 'assistant', content } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return errorResponse(e); }
}
