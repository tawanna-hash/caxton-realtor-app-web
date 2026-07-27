const { execSync } = require('child_process');

// Use psql if available, otherwise use node-fetch to hit the Neon HTTP SQL API
const dbUrl = process.env.DATABASE_URL;
console.log('DB URL prefix:', dbUrl?.substring(0, 30) + '...');

// Parse connection string
const match = dbUrl?.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
if (!match) {
  console.error('Could not parse DATABASE_URL');
  process.exit(1);
}
const [, user, password, host, port, database] = match;
console.log('Host:', host, 'DB:', database, 'User:', user);

// Use psql
const env = { ...process.env, PGPASSWORD: password };
const psql = (query) => execSync(`psql "host=${host} port=${port} dbname=${database} user=${user}" -c "${query.replace(/"/g, '\\"')}" -t -A`, { env, encoding: 'utf-8' });

try {
  const count = psql("SELECT COUNT(*) FROM builder_inventory WHERE builder_name = 'La Cima' AND external_id IS NULL AND home_type = 'showcase' AND kind = 'listing';");
  console.log('Rows to delete:', count.trim());

  const deleted = psql("DELETE FROM builder_inventory WHERE builder_name = 'La Cima' AND external_id IS NULL AND home_type = 'showcase' AND kind = 'listing' RETURNING id;");
  const ids = deleted.trim().split('\n').filter(Boolean);
  console.log('Deleted:', ids.length, 'rows');

  const remaining = psql("SELECT builder_name, COUNT(*) as cnt, COUNT(external_id) as with_ext FROM builder_inventory WHERE developer_name = 'La Cima' AND status = 'active' GROUP BY builder_name ORDER BY builder_name;");
  console.log('\nRemaining active La Cima rows:');
  console.log(remaining);
} catch (e) {
  console.error('Error:', e.message);
}
