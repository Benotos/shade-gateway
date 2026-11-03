import { keyFromRequest } from '@/lib/credits';
import { errorResponse, runChat, runChatStream, sseHeaders, type ChatInput } from '@/lib/gateway';
import { findModel } from '@/lib/config';

// Tells the model where it runs and today's date, so it doesn't claim to be another product or year.
function withContext(body: ChatInput): ChatInput {
  if (!Array.isArray(body.messages) || body.messages.some((m) => (m as { role?: string })?.role === 'system')) return body;
  const m = findModel(typeof body.model === 'string' ? body.model : undefined);
  const today = new Date().toISOString().slice(0, 10);
  const who = m && !m.free ? `${m.name} by ${m.vendor}` : 'an open-source language model';
  const system = `You are ${who}, answering through SHADE, a private AI gateway paid in SOL. Today's date is ${today}. Your training data may end before today, so for recent events say what you knew as of your training and suggest checking a live source. Use Markdown for structure when it helps.`;
  return { ...body, messages: [{ role: 'system', content: system }, ...body.messages] };
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Web chat endpoint. Same body as /v1/chat/completions, plus optional `accessKey`.
// The key can also be sent as "Authorization: Bearer shade_sk_..." or "x-shade-key".
// The free model works without a key (rate limited per visitor).
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as (ChatInput & { accessKey?: string }) | null;
    if (!body) return Response.json({ error: { message: 'Invalid JSON body.', code: 'invalid_request' } }, { status: 400 });
    const key = keyFromRequest(req) ?? (typeof body.accessKey === 'string' ? body.accessKey : null);
    const input = withContext(body);
    if (body.stream === true) return new Response(await runChatStream(req, key, input, 'chat'), { headers: sseHeaders });
    const out = await runChat(req, key, input, 'chat');
    const content = out.choices[0]?.message.content ?? '';
    return Response.json({ ...out, content, message: { role: 'assistant', content } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return errorResponse(e); }
}