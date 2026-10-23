// Test shim: makes @neondatabase/serverless's neon() run on an in-memory PGlite instance.
export const db = globalThis.__pgliteTest;
export function neon() {
  const f = async (strings, ...values) => {
    if (typeof strings === 'string') return (await db.query(strings, values[0] ?? [])).rows;
    const text = strings.reduce((a, s, i) => a + s + (i < values.length ? `$${i + 1}` : ''), '');
    return (await db.query(text, values)).rows;
  };
  f.query = async (text, params) => (await db.query(text, params ?? [])).rows;
  f.transaction = async (qs) => Promise.all(qs);
  return f;
}
export class Pool { constructor() { return { query: (t, v) => db.query(t, v), on() {}, connect: async () => ({ query: (t, v) => db.query(t, v), release() {} }) }; } }
