import type { Metadata } from 'next';
import { getPackages, isDepositConfigured, packageCreditUnits, unitsToCredits } from '@/lib/config';
import PurchaseClient from './PurchaseClient';

export const metadata: Metadata = {
  title: 'Buy credits · SHADE',
  description: 'Buy SHADE credits with SOL. No account, no wallet connect.',
};
export const dynamic = 'force-dynamic';

export default async function PurchasePage({ searchParams }: { searchParams: Promise<{ pkg?: string }> }) {
  const { pkg } = await searchParams;
  const packages = getPackages().map((p) => ({
    id: p.id, label: p.label, usdCents: p.usdCents, bonusPct: p.bonusPct, highlight: Boolean(p.highlight),
    credits: unitsToCredits(packageCreditUnits(p)),
  }));
  const initial = packages.find((p) => p.id === pkg)?.id ?? packages.find((p) => p.highlight)?.id ?? packages[0]?.id;
  return <PurchaseClient packages={packages} initialPackage={initial} ready={isDepositConfigured()} />;
}
