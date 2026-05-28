/**
 * Structured logger for server code. Outputs JSON lines to stdout/stderr so
 * Vercel Logs and any log drains can parse them. Mirrors the pino-style
 * `logger.info(obj, msg)` API used by the ported Express code so call sites
 * don't need to change.
 */

type LogObj = Record<string, unknown>;

function resolve(obj: unknown): LogObj {
  if (obj == null) return {};
  if (typeof obj === 'object') {
    // Error objects don't JSON.stringify nicely; pull out useful fields.
    if (obj instanceof Error) {
      return { err: { name: obj.name, message: obj.message, stack: obj.stack } };
    }
    return obj as LogObj;
  }
  return { msg: String(obj) };
}

function emit(stream: 'log' | 'warn' | 'error' | 'debug', level: string, a: unknown, b?: string) {
  // Allow either logger.info('msg') or logger.info({k:v}, 'msg')
  const obj = typeof a === 'string' ? {} : resolve(a);
  const msg = typeof a === 'string' ? a : b;
  console[stream](JSON.stringify({ level, time: new Date().toISOString(), ...obj, ...(msg ? { msg } : {}) }));
}

export const logger = {
  info: (a: unknown, b?: string) => emit('log', 'info', a, b),
  warn: (a: unknown, b?: string) => emit('warn', 'warn', a, b),
  error: (a: unknown, b?: string) => emit('error', 'error', a, b),
  debug: (a: unknown, b?: string) => {
    if (process.env.LOG_LEVEL === 'debug') emit('debug', 'debug', a, b);
  },
};
