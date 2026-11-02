import { pricedModels, creditsPerM } from '@/lib/catalog';
import { freeDailyLimit, getPackages, isDatabaseConfigured, isDepositConfigured, isProviderConfigured, packageCreditUnits, treasuryAddress, unitsToCredits } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Public configuration for the UI. Never includes secrets.
export async function GET() {
  const models = await pricedModels();
  return Response.json({
    providerConfigured: isProviderConfigured(),
    creditSystemReady: isDatabaseConfigured() && isDepositConfigured(),
    demoMode: process.env.SHADE_DEMO_MODE === 'true',
    depositAddress: treasuryAddress() || null,
    network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta',
    freeDailyLimit: freeDailyLimit(),
    models: models.map((m) => ({
      id: m.id, name: m.name, description: m.description, tag: m.tag, free: m.free,
      inputCreditsPerM: m.free ? 0 : creditsPerM(m.inputPerM),
      outputCreditsPerM: m.free ? 0 : creditsPerM(m.outputPerM),
    })),
    packages: getPackages().map((p) => ({ ...p, usd: p.usdCents / 100, credits: unitsToCredits(packageCreditUnits(p)) })),
  });
}
