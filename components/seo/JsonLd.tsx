// Server component: renders one or more schema.org JSON-LD objects.
export default function JsonLd({ data }: { data: object | object[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          // `<` escaped so content can never close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, '\\u003c') }}
        />
      ))}
    </>
  );
}
