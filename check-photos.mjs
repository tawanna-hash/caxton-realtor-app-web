import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, title, event_date, publication, description FROM event_photos ORDER BY event_date DESC, created_at DESC LIMIT 30`;
console.log(JSON.stringify(rows, null, 2));
