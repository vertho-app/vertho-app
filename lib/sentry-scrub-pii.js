/**
 * Hook beforeSend do Sentry — remove PII de erros antes do envio.
 * Aplicado em client/server/edge configs.
 *
 * Estratégia:
 *   - Emails → [email]
 *   - Telefones BR → [telefone]
 *   - CPF → [cpf]
 *   - UUIDs de colaborador_id/trilha_id ficam (são internos, ID opaco)
 *   - Stack traces podem conter paths com nome de dev — preserva
 *     (útil pra debug, sem PII de cliente)
 *   - Request body (se capturado) passa pelo mesmo scrub
 */

function scrubTexto(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\(?\d{2,3}\)?\s?9?\d{4,5}[-\s]?\d{4}/g, '[telefone]')
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[cpf]');
}

function scrubRecursivo(obj, depth = 0) {
  if (depth > 6) return obj; // evita loop em estruturas circulares
  if (obj == null) return obj;
  if (typeof obj === 'string') return scrubTexto(obj);
  if (Array.isArray(obj)) return obj.map(v => scrubRecursivo(v, depth + 1));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      // Chaves sensíveis são zeradas direto (authorization, cookie, etc.)
      if (/authorization|cookie|password|token|api[_-]?key|secret/i.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = scrubRecursivo(v, depth + 1);
      }
    }
    return out;
  }
  return obj;
}

export function scrubPII(event, hint) {
  try {
    if (event.message) event.message = scrubTexto(event.message);
    if (event.exception?.values) {
      event.exception.values.forEach(ex => {
        if (ex.value) ex.value = scrubTexto(ex.value);
      });
    }
    if (event.request) {
      if (event.request.data) event.request.data = scrubRecursivo(event.request.data);
      if (event.request.query_string) event.request.query_string = scrubTexto(event.request.query_string);
      if (event.request.headers) event.request.headers = scrubRecursivo(event.request.headers);
    }
    if (event.extra) event.extra = scrubRecursivo(event.extra);
    if (event.contexts) event.contexts = scrubRecursivo(event.contexts);
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(b => ({
        ...b,
        message: scrubTexto(b.message),
        data: scrubRecursivo(b.data),
      }));
    }
    // User: remove email, preserva ID opaco
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }
  } catch {
    // Se o scrub falhar, melhor não enviar que enviar com PII
    return null;
  }
  return event;
}
