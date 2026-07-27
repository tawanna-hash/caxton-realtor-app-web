import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

// First, count what we'll delete
const count = await sql`
  SELECT COUNT(*) as cnt FROM builder_inventory
  WHERE builder_name = 'La Cima'
    AND external_id IS NULL
    AND home_type = 'showcase'
    AND kind = 'listing'
`;
console.log('Rows to delete:', count[0].cnt);

// Delete them
const deleted = await sql`
  DELETE FROM builder_inventory
  WHERE builder_name = 'La Cima'
    AND external_id IS NULL
    AND home_type = 'showcase'
    AND kind = 'listing'
  RETURNING id
`;
console.log('Deleted:', deleted.length, 'rows');
console.log('IDs:', deleted.map(r => r.id).join(', '));

// Verify remaining La Cima rows
const remaining = await sql`
  SELECT builder_name, COUNT(*) as cnt, 
         COUNT(external_id) as with_ext_id
  FROM builder_inventory
  WHERE developer_name = 'La Cima'
    AND status = 'active'
  GROUP BY builder_name
  ORDER BY builder_name
`;
console.log('\nRemaining active La Cima rows:');
for (const r of remaining) {
  console.log(`  ${r.builder_name}: ${r.cnt} (${r.with_ext_id} with externalId)`);
}
