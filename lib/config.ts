export type ShadeModel = { id: string; name: string; description: string; providerModel: string; tag: string };
const defaults: ShadeModel[] = [
  { id: 'fast', name: 'Shade Flash', description: 'Fast answers for everyday tasks', providerModel: 'gpt-4o-mini', tag: 'FAST' },
  { id: 'reason', name: 'Shade Core', description: 'Deep reasoning and complex work', providerModel: 'gpt-4.1', tag: 'GENERAL' },
  { id: 'coder', name: 'Shade Code', description: 'Code generation and debugging', providerModel: 'gpt-4.1', tag: 'CODING' },
];
export function getModels(): ShadeModel[] {
  const raw = process.env.SHADE_MODELS;
  if (!raw) return defaults;
  const parsed = raw.split(',').map((entry) => {
    const [id, name, providerModel] = entry.split(':').map((v) => v.trim());
    if (!id || !name || !providerModel) return null;
    return { id, name, providerModel, description: id === 'coder' ? 'Code generation and debugging' : id === 'reason' ? 'Deep reasoning and complex work' : 'Fast answers for everyday tasks', tag: id.toUpperCase() };
  }).filter((m): m is ShadeModel => Boolean(m));
  return parsed.length ? parsed : defaults;
}
export function isProviderConfigured() { return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL); }
