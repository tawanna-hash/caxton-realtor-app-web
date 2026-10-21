import ClientDetail from './ClientDetail';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientDetail id={Number(id)} />;
}
