/**
 * Política de Content-Security-Policy em MODO RELATÓRIO (`Content-Security-Policy-Report-Only`).
 *
 * Por que existe (análise de segurança de 05/10/2026): a CSP enforçada do app é só
 * `frame-ancestors 'self'`, sem `script-src`. Nenhum XSS explorável foi achado, mas um
 * futuro não encontraria barreira nenhuma, e o cookie de sessão do Supabase é legível por
 * JavaScript. Uma CSP com `script-src` enforçada de primeira poderia derrubar telas
 * (os scripts INLINE do próprio Next, o Sentry, o player do Bunny), então esta política
 * só OBSERVA: o navegador reporta o que violaria e não bloqueia nada.
 *
 * Esta é a política-ALVO, de propósito sem `'unsafe-inline'` em `script-src`. Os scripts
 * inline do Next vão aparecer nos relatórios, e é isso que se quer medir: quantos são e
 * de onde vêm, para decidir entre nonce (exige renderização dinâmica) e hashes. Enforçar
 * é um passo posterior e separado, depois de ler os relatórios.
 *
 * Os relatórios chegam em `/api/csp-report` (ver a rota: tira a query string das URLs, que
 * em `/entrar`, `/auth/callback` e `/r/<token>` carrega token, e deduplica).
 *
 * ESM puro (`.mjs`) porque o `next.config.mjs` não importa TypeScript.
 */

export const CSP_REPORT_PATH = '/api/csp-report';

/** Domínios externos que o código de navegador usa de fato (levantado em 05/10/2026). */
const SCRIPT_EXTERNOS = [
  'https://cdn.embed.ly', // player.js que fala com o iframe do Bunny (components/video e use-bunny-tracking)
];
const FRAME_EXTERNOS = [
  'https://iframe.mediadelivery.net', // player Bunny
];
const CONNECT_EXTERNOS = [
  'https://*.supabase.co', 'wss://*.supabase.co', // Auth/REST/Realtime do navegador
  'https://*.ingest.sentry.io', 'https://*.ingest.us.sentry.io', 'https://*.ingest.de.sentry.io', // Sentry (DSN pública)
  'ws://127.0.0.1:*', 'ws://localhost:*', // Copiloto ao vivo: ASR local (NEXT_PUBLIC_COPILOTO_ASR_URL)
];

const diretivas = {
  'default-src': ["'self'"],
  // 'report-sample': sem a palavra-chave o navegador manda o relatório com a amostra VAZIA, e aí o
  // script inline do Next não se distingue de qualquer outro. Ela só pede o começo (40 caracteres).
  'script-src': ["'self'", ...SCRIPT_EXTERNOS, "'report-sample'"],
  // O Next injeta <style> inline e há muito `style={{...}}` no app: nem o relatório vai
  // querer saber disso agora, e CSS inline não executa código.
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", ...CONNECT_EXTERNOS],
  'frame-src': [...FRAME_EXTERNOS],
  'media-src': ["'self'", 'blob:', 'https:'],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  // SÓ `report-uri` (Chrome, Firefox e Safari entregam na hora). `report-to` NÃO entra, de
  // propósito: com os dois presentes o Chromium usa só o `report-to` e ignora o `report-uri`, e
  // num Chromium de verdade (Playwright) o `report-to` não entregou nenhum relatório em 75 s,
  // enquanto o `report-uri` entregou o primeiro na hora (medido em 05/10/2026). Relatório que
  // não chega é um modo relatório que não relata.
  'report-uri': [CSP_REPORT_PATH],
};

/** Valor do header `Content-Security-Policy-Report-Only`. */
export const CSP_RELATORIO = Object.entries(diretivas)
  .map(([nome, valores]) => `${nome} ${valores.join(' ')}`)
  .join('; ');
