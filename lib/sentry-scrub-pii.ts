/**
 * Hook beforeSend do Sentry: remove PII e credenciais de erros antes do envio.
 * Aplicado em client/server/edge configs (erros e transações), no `replay_event` do Replay e,
 * via `scrubDados`, nos eventos de gravação dele (`lib/sentry-replay.ts`).
 *
 * Estratégia:
 *   - Emails → [email]
 *   - Telefones BR → [telefone]
 *   - CPF → [cpf]
 *   - Credencial em URL (`?t=`, `?token=`, `?codigo=`...) → [REDACTED]
 *   - UUIDs de colaborador_id/trilha_id ficam (são internos, ID opaco)
 *   - Stack traces podem conter paths com nome de dev: preserva
 *     (útil pra debug, sem PII de cliente)
 *   - Request body (se capturado) passa pelo mesmo scrub
 *
 * O que NÃO faz (R-112, 03/10/2026): não detecta NOME de pessoa em texto livre.
 * Mensagem de erro que interpola o nome sai com o nome. Por isso a política
 * fala em "dados técnicos de erro", não em "Sentry sem PII".
 */

/**
 * Parâmetros de query que carregam credencial de acesso. `t` é o link de
 * acesso do WhatsApp (`/entrar?t=`), que até 03/10/2026 ia inteiro no
 * `request.url`, no `query_string` e no breadcrumb de navegação; quem lesse o
 * evento no Sentry entrava como a pessoa. Os demais são os outros portões que
 * aceitam segredo pela URL (`/auth/callback`, webhooks, degustação). `sala` e `volta` (19/10/2026)
 * são o ticket da sala e o código de volta da degustação, que até aqui só a gravação da degustação
 * redigia (`lib/demo/degustacao-gravacao.ts`); o erro comum os mandava crus. Os `*_token` são os
 * que o Supabase põe no FRAGMENTO (`#access_token=...&refresh_token=...`) no login por link.
 */
export const PARAMETROS_SECRETOS = [
  't', 'token', 'token_hash', 'codigo', 'code', 'ticket', 'passe', 'key', 'secret', 'sala', 'volta',
  'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
];

const LISTA = PARAMETROS_SECRETOS.join('|');
// Em texto livre só depois de `?`, `&` ou `#` (uma URL, com o fragmento); no query_string cru, também no início.
const RE_URL = new RegExp(`([?&#](?:${LISTA})=)[^&#\\s"'<>]*`, 'gi');
const RE_QUERY = new RegExp(`(^|[?&;])((?:${LISTA})=)[^&#;\\s"'<>]*`, 'gi');

function redigirTokensDeUrl(s) {
  if (typeof s !== 'string') return s;
  return s.replace(RE_URL, '$1[REDACTED]');
}

/**
 * Par chave/valor com chave sensível DENTRO de texto (19/10/2026, achado da revisão de segurança do
 * `817a2da7`): `console.warn('falhou', { token: 'abc' })` limpa o objeto nos atributos do log, mas a
 * mensagem formatada leva `{ token: 'abc' }` impresso. Cobre o formato do `util.inspect`
 * (`token: 'abc'`), JSON (`"token":"abc"`), `chave=valor` e `Authorization: Bearer xyz`.
 * `\b` dos dois lados da chave: `input_tokens`, `max_tokens` e "Secretaria" NÃO casam. Valor já
 * `[REDACTED]` (pela regra de URL, que roda antes) não é redigido de novo.
 */
const RE_CHAVE_SENSIVEL = /(["']?\b(?:authorization|cookie|set-cookie|password|senha|secret|client_secret|api[_-]?key|service[_-]?role(?:[_-]?key)?|[a-z_]*token(?:_hash)?)\b["']?\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?(?!\[REDACTED\])("[^"]*"|'[^']*'|[^\s,;}\]&]+)/gi;

function scrubTexto(s) {
  if (typeof s !== 'string') return s;
  return redigirTokensDeUrl(s)
    .replace(RE_CHAVE_SENSIVEL, '$1[REDACTED]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\(?\d{2,3}\)?\s?9?\d{4,5}[-\s]?\d{4}/g, '[telefone]')
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[cpf]');
}

/** O SDK manda `query_string` como texto, lista de pares ou objeto: os três. */
function scrubQueryString(qs) {
  const secreto = (k) => PARAMETROS_SECRETOS.includes(String(k).toLowerCase());
  if (typeof qs === 'string') return scrubTexto(qs.replace(RE_QUERY, '$1$2[REDACTED]'));
  if (Array.isArray(qs)) {
    return qs.map((par) => (Array.isArray(par) && secreto(par[0]) ? [par[0], '[REDACTED]'] : scrubRecursivo(par)));
  }
  if (qs && typeof qs === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(qs)) out[k] = secreto(k) ? '[REDACTED]' : scrubRecursivo(v);
    return out;
  }
  return qs;
}

/** O scrub de estrutura, exposto para os eventos de gravação do Replay (`lib/sentry-replay.ts`). */
export function scrubDados(obj) {
  return scrubRecursivo(obj);
}

/**
 * Hook `beforeSendLog` (Sentry Logs, 19/10/2026): o aviso e o erro do servidor passam pela MESMA
 * limpeza dos eventos. O `console.warn`/`error` chega com a mensagem formatada e os argumentos em
 * atributos (`sentry.message.parameter.N`): os dois lados. Se a limpeza falhar, o log não sai.
 */
export function scrubLog(log) {
  try {
    if (!log) return log;
    return {
      ...log,
      // `ParameterizedString` pode ser um objeto String: vai como texto simples, já limpo.
      message: scrubTexto(String(log.message ?? '')),
      ...(log.attributes ? { attributes: scrubRecursivo(log.attributes) } : {}),
    };
  } catch {
    return null;
  }
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
    if (event.transaction) event.transaction = scrubTexto(event.transaction);
    if (event.exception?.values) {
      event.exception.values.forEach(ex => {
        if (ex.value) ex.value = scrubTexto(ex.value);
      });
    }
    if (event.request) {
      if (event.request.url) event.request.url = scrubTexto(event.request.url);
      if (event.request.data) event.request.data = scrubRecursivo(event.request.data);
      if (event.request.query_string) event.request.query_string = scrubQueryString(event.request.query_string);
      if (event.request.headers) event.request.headers = scrubRecursivo(event.request.headers);
    }
    if (event.extra) event.extra = scrubRecursivo(event.extra);
    if (event.contexts) event.contexts = scrubRecursivo(event.contexts);
    if (event.breadcrumbs) {
      // Navegação (`data.from`/`data.to`) e fetch (`data.url`) passam aqui.
      event.breadcrumbs = event.breadcrumbs.map(b => ({
        ...b,
        message: scrubTexto(b.message),
        data: scrubRecursivo(b.data),
      }));
    }
    // Transação: a URL da requisição também vive na descrição dos spans.
    if (Array.isArray(event.spans)) {
      event.spans = event.spans.map(s => ({
        ...s,
        description: scrubTexto(s.description),
        data: scrubRecursivo(s.data),
      }));
    }
    // Replay (`replay_event`): a lista das páginas por onde a sessão passou (19/10/2026).
    if (Array.isArray(event.urls)) event.urls = event.urls.map(scrubTexto);
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
