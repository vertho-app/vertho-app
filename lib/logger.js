/**
 * Logger estruturado para o Vertho.
 * Em produção, logs vão para stdout (capturados pelo Vercel).
 * Formato: [VERTHO] [LEVEL] [DOMAIN] message { context }
 */

function log(level, domain, message, context = {}) {
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
  info: (domain, msg, ctx) => log('info', domain, msg, ctx),
  warn: (domain, msg, ctx) => log('warn', domain, msg, ctx),
  error: (domain, msg, ctx) => log('error', domain, msg, ctx),

  // Domain-specific shortcuts
  chat: (msg, ctx) => log('info', 'chat', msg, ctx),
  ia: (msg, ctx) => log('info', 'ia', msg, ctx),
  cron: (msg, ctx) => log('info', 'cron', msg, ctx),
  auth: (msg, ctx) => log('info', 'auth', msg, ctx),
  ppp: (msg, ctx) => log('info', 'ppp', msg, ctx),
  whatsapp: (msg, ctx) => log('info', 'whatsapp', msg, ctx),
};
