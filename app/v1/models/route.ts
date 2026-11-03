import { pricedModels, creditsPerM } from '@/lib/catalog';

export const revalidate = 3600;

// OpenAI-compatible model list, with SHADE prices (credits per 1M tokens; 1 credit = $0.001).
export async function GET() {
  const models = await pricedModels();
  return Response.json({
    object: 'list',
    data: models.map((m) => ({
      id: m.id, object: 'model', created: 0, owned_by: m.vendor.toLowerCase(), name: m.name, description: m.description, free: m.free, reasoning: Boolean(m.reasoning),
      pricing: m.free ? { input_credits_per_m: 0, output_credits_per_m: 0 } : { input_credits_per_m: creditsPerM(m.inputPerM), output_credits_per_m: creditsPerM(m.outputPerM) },
    })),
  });
}