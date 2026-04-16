/**
 * Logger estruturado para o Vertho.
 * Em produção, logs vão para stdout (capturados pelo Vercel).
 * Formato: [VERTHO] [LEVEL] [DOMAIN] message { context }
 */

type LogLevel = 'info' | 'warn' | 'error';
type LogContext = Record<string, any>;

function log(level: LogLevel, domain: string, message: string, context: LogContext = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    domain,
    message,
    ...context,
  };

  if (level === 'error') {
    console.error(`[VERTHO] [${level.toUpperCase()}] [${domain}] ${message}`, context);
  } else {
    console.log(`[VERTHO] [${level.toUpperCase()}] [${domain}] ${message}`, Object.keys(context).length ? context : '');
  }

  return entry;
}

export const logger = {
  info: (domain: string, msg: string, ctx?: LogContext) => log('info', domain, msg, ctx),
  warn: (domain: string, msg: string, ctx?: LogContext) => log('warn', domain, msg, ctx),
  error: (domain: string, msg: string, ctx?: LogContext) => log('error', domain, msg, ctx),

  // Domain-specific shortcuts
  chat: (msg: string, ctx?: LogContext) => log('info', 'chat', msg, ctx),
  ia: (msg: string, ctx?: LogContext) => log('info', 'ia', msg, ctx),
  cron: (msg: string, ctx?: LogContext) => log('info', 'cron', msg, ctx),
  auth: (msg: string, ctx?: LogContext) => log('info', 'auth', msg, ctx),
  ppp: (msg: string, ctx?: LogContext) => log('info', 'ppp', msg, ctx),
  whatsapp: (msg: string, ctx?: LogContext) => log('info', 'whatsapp', msg, ctx),
};
