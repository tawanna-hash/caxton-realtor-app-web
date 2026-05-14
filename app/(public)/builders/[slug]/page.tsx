// app/(public)/builders/[slug]/page.tsx
//
// Per-builder page. Shows all of a single builder's content with mini-tabs:
//   - Communities (home_type='community')
//   - Move-In Ready (home_type='showcase' or 'plan' or NULL+kind='listing')
//   - Promotions (kind='promotion')

import { notFound } from 'next/navigation';
import { listBuilderInventory } from '@/lib/builder-inventory';
import { slugToBuilderName } from '@/lib/builder-slug-server';
import BuilderPageClient from '@/components/builders/BuilderPageClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const builderName = await slugToBuilderName(slug);
  if (!builderName) return { title: 'Builder not found' };
  return {
    title: `${builderName} — HarmonyOne`,
    description: `Communities, move-in-ready homes, and promotions from ${builderName}.`,
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const builderName = await slugToBuilderName(slug);
  if (!builderName) {
    notFound();
  }

  const rows = await listBuilderInventory({
    status: 'active',
    builderName,
    limit: 500,
  });

  return <BuilderPageClient builderName={builderName} initialRows={rows} />;
}
