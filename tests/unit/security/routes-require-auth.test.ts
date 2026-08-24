import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import { semComentarios } from '../../helpers/fonte';

/**
 * Guard das rotas de API mutativas: auth, CSRF e rate limit.
 *
 * ⚠️ REESCRITO EM 10/08/2026 (F18 da auditoria). A versão anterior tinha três
 * listas LITERAIS de 10 rotas e checava `code.includes('requireUser')`:
 *
 *  - **cobria 10 de 29 rotas mutativas** (medido), e rota nova nascia fora da
 *    varredura — a lista não tinha como saber que ela existia. A rota de
 *    certificado, por exemplo, não estava em nenhuma das três;
 *  - `includes` casa o IMPORT. Uma rota que importasse `requireUser` e chamasse
 *    dentro de um `if` que nunca roda passava igual.
 *
 * Agora as rotas são DESCOBERTAS (`git ls-files app/api`), o que se exige é a
 * CHAMADA, e a régua de cada exigência é derivada do que a rota faz — não de uma
 * lista que alguém precisa lembrar de atualizar:
 *
 *  · toda rota mutativa precisa de UMA forma de autenticação: gate de sessão,
 *    assinatura de webhook, segredo de cron/interno — ou estar declarada abaixo
 *    como pública por design, com o motivo escrito;
 *  · CSRF é exigido de quem autentica por COOKIE (só aí o ataque existe).
 *    Webhook e cron não têm cookie: exigir csrfCheck deles seria cerimônia, e
 *    cerimônia é o que faz guard virar ruído;
 *  · rate limit é exigido das rotas caras (IA) e das públicas pré-sessão.
 *
 * Estado quando isto foi escrito: 48 rotas, 29 mutativas, **nenhuma
 * desprotegida** — as 9 sem gate de sessão são as 7 de login (pré-sessão, por
 * definição) e 2 webhooks que validam assinatura/segredo próprio.
 */

/**
 * Chamada de gate de SESSÃO (cookie/bearer do usuário).
 *
 * ⚠️ SÓ ENTRAM AQUI GATES QUE **LANÇAM**. `requireAdminSupabase` /
 * `requireEmpresaSupabase` / `exigirAcessoPlataforma` interrompem a execução
 * quando o acesso falta, então a presença da chamada é prova de proteção.
 *
 * 🔴 `checarAcessoPlataforma` NÃO entra, de propósito: ela **retorna**
 * `{ authorized }` em vez de lançar, e quem chamar sem olhar o retorno fica
 * desprotegido com a chamada no arquivo. Aceitá-la aqui transformaria o guard
 * em carimbo — é a mesma armadilha que este arquivo descreve no topo (casar o
 * import em vez do uso).
 */
/**
 * `\.auth\.getUser\(` entra na lista porque É o gate em algumas rotas de
 * leitura (`/api/me` não chama helper nenhum: pega o client de servidor e
 * pergunta quem é). É `getUser` e não `getSession` de propósito — `getSession`
 * devolve a sessão em MEMÓRIA e não valida nada, que é a distinção que custou
 * o laço `/rota` ↔ `/login` em 22/07.
 */
const GATE_SESSAO = /\.auth\.getUser\s*\(|\b(requireUser|requireAdmin|requireRole|requirePermission|requireUserAction|requireAdminAction|requireAdminSupabase|requireEmpresaSupabase|requireLinhaSupabase|requirePlataformaSupabase|exigirAcessoPlataforma|checarAcessoPlataforma|getAuthenticatedEmail|requireRepresentative\w*|requireCommercialAdmin)\s*\(/;
/** Autenticação de MÁQUINA: assinatura de webhook ou segredo compartilhado. */
const GATE_MAQUINA = /\b(verifyQStashSignature|verifyZapiWebhook|verifyBunnyWebhook|safeSecretEqual)\s*\(|CRON_SECRET|INTERNAL_API_KEY|x-internal-secret/;
const CSRF = /\bcsrfCheck\s*\(/;
const RATE = /\b(aiLimiter|heavyLimiter|authLimiter|leadLimiter|checkRateLimit|rateLimit)\s*[.(]/;

/**
 * Rotas mutativas SEM gate de sessão de propósito. Dívida declarada: só encolhe,
 * e cada entrada diz por quê. Entrada nova aqui é o bug que o guard existe para
 * pegar — a pergunta certa é "por que esta rota não pode exigir sessão?".
 */
const PUBLICAS_POR_DESIGN: Record<string, string> = {
  'app/api/auth/check-email/route.ts': 'pré-sessão: responde se o e-mail existe para escolher o fluxo de login',
  'app/api/auth/magic-link/route.ts': 'pré-sessão: emite o link de acesso',
  'app/api/auth/magic-link-whatsapp/route.ts': 'pré-sessão: emite o link por WhatsApp',
  'app/api/auth/phone-magic-link/request/route.ts': 'pré-sessão: emite o link por telefone',
  'app/api/auth/phone-otp/request/route.ts': 'pré-sessão: envia o código',
  'app/api/auth/phone-otp/verify/route.ts': 'pré-sessão: troca o código por sessão',
  'app/api/auth/signup/route.ts': 'pré-sessão: cadastro em tenant com allow_open_signup',

  // ── Só-GET (E10, 24/08) ────────────────────────────────────────────────
  // Até aqui a regra valia só para rotas MUTATIVAS: 21 das 55 são só-GET e não
  // tinham regra nenhuma. Nada estava aberto — as quatro abaixo foram lidas uma
  // a uma —, mas "nada aberto hoje" não é um check: a rota só-GET nº 22 nascia
  // sem ninguém perguntar nada. Leitura vaza dado, não só escrita.
  'app/api/auth/cargos/route.ts':
    'pré-sessão: o modal de auto-cadastro precisa dos cargos ANTES de existir sessão. ' +
    'Devolve só { id, nome } do tenant do header — nada de PII.',
  'app/api/bunny-thumb/[videoId]/route.ts':
    'proxy de THUMBNAIL do Bunny (hotlink protection exige Referer do servidor). ' +
    'Serve imagem por guid; a mesma imagem já é pública no player.',
  'app/api/ppp/template/route.ts':
    'gera o formulário de PPP em branco — conteúdo ESTÁTICO, sem dado de tenant nenhum.',
  'app/api/version/route.ts':
    'versão do build. Existe para o cliente detectar deploy novo (Skew Protection).',
};

/** Rotas que autenticam por máquina e por isso não precisam de CSRF. */
const CSRF_DISPENSADO_POR_MAQUINA = /^app\/api\/(webhooks|internal|cron)\//;

/**
 * Exceções de CSRF com sessão por cookie. Cada uma precisa de um motivo que
 * sobreviva à pergunta "então o ataque de CSRF não existe aqui?".
 */
const CSRF_DISPENSADO: Record<string, string> = {
  'app/api/notifications/opened/route.ts':
    'chamada pelo SERVICE WORKER, que não manda `Referer` em todos os navegadores — ' +
    'e `csrfCheck` falha FECHADO sem ele, o que mataria a telemetria de push. ' +
    'Decisão já registrada no cabeçalho da própria rota.',
};

interface Rota { arquivo: string; metodos: string[]; src: string }

function rotasDeApi(): Rota[] {
  let arquivos: string[] = [];
  try {
    arquivos = execFileSync('git', ['ls-files', '-z', 'app/api'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter((f) => /route\.tsx?$/.test(f));
  } catch { return []; }

  return arquivos.map((arquivo) => {
    // `semComentarios`: sem isto, `// chama requireUser(request)` satisfaz o
    // guard — verificado por mutação em 10/08. É o mesmo furo que o
    // `ownership-guard` tinha, e por isso a função vive em `helpers/fonte`.
    const src = semComentarios(readFileSync(arquivo, 'utf-8'));
    const metodos = [...new Set(
      (src.match(/export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)/g) || [])
        .map((m) => m.split(/\s+/).pop() as string),
    )];
    return { arquivo, metodos, src };
  });
}

const todas = rotasDeApi();
const mutativas = todas.filter((r) => r.metodos.some((m) => m !== 'GET'));

describe('Rotas de API mutativas', () => {
  it('o guard enxerga as rotas (não passou vazio por engano)', () => {
    expect(todas.length, 'git ls-files app/api não devolveu rota nenhuma — guard cego').toBeGreaterThan(20);
    expect(mutativas.length).toBeGreaterThan(10);
  });

  it('toda rota mutativa tem alguma autenticação (ou está declarada como pública)', () => {
    const faltando = mutativas
      .filter((r) => !GATE_SESSAO.test(r.src) && !GATE_MAQUINA.test(r.src) && !(r.arquivo in PUBLICAS_POR_DESIGN))
      .map((r) => `  ❌ ${r.arquivo} [${r.metodos.join(',')}]`);
    expect(
      faltando.join('\n'),
      faltando.length
        ? `Rota mutativa sem autenticação nenhuma:\n${faltando.join('\n')}\n\n` +
          'Ou ela exige sessão (requireUser/requireAdmin/…), ou valida assinatura/segredo ' +
          '(webhook, cron, interno), ou entra em PUBLICAS_POR_DESIGN com o motivo escrito.'
        : '',
    ).toBe('');
  });

  /**
   * E10 (auditoria 22/08) — a regra passou a valer para LEITURA também.
   *
   * `Medido em 24/08:` 21 das 55 rotas são só-GET. Nenhuma estava aberta, e é
   * justamente por isso que valia a pena escrever a regra agora: enquanto o
   * estado é bom, declarar as exceções é barato. Depois, cada rota nova de
   * leitura entra sem ninguém perguntar — e leitura sem gate vaza dado igual.
   */
  it('toda rota só-GET tem autenticação (ou está declarada como pública)', () => {
    const soGet = todas.filter((r) => r.metodos.length > 0 && r.metodos.every((m) => m === 'GET'));
    expect(soGet.length, 'nenhuma rota só-GET encontrada — o classificador quebrou').toBeGreaterThan(10);

    const faltando = soGet
      .filter((r) => !GATE_SESSAO.test(r.src) && !GATE_MAQUINA.test(r.src) && !(r.arquivo in PUBLICAS_POR_DESIGN))
      .map((r) => `  ❌ ${r.arquivo}`);
    expect(
      faltando.join('\n'),
      faltando.length
        ? 'Rota de LEITURA sem autenticação nenhuma:\n' + faltando.join('\n') + '\n\n' +
          'Ou ela exige sessão, ou valida segredo/assinatura, ou entra em ' +
          'PUBLICAS_POR_DESIGN com o motivo escrito. Leitura sem gate vaza dado igual.'
        : '',
    ).toBe('');
  });

  it('quem autentica por COOKIE tem csrfCheck', () => {
    const faltando = mutativas
      .filter((r) => GATE_SESSAO.test(r.src))
      .filter((r) => !CSRF.test(r.src) && !CSRF_DISPENSADO_POR_MAQUINA.test(r.arquivo) && !(r.arquivo in CSRF_DISPENSADO))
      .map((r) => `  ❌ ${r.arquivo} [${r.metodos.join(',')}]`);
    expect(
      faltando.join('\n'),
      faltando.length
        ? `Rota mutativa com sessão por cookie e sem csrfCheck:\n${faltando.join('\n')}\n\n` +
          'Sessão por cookie viaja sozinha em requisição cross-site — é aí que o CSRF existe.'
        : '',
    ).toBe('');
  });

  it('rotas públicas pré-sessão têm rate limit (senão viram porta de enumeração/spam)', () => {
    // A régua é "toca o BANCO ou escreve", não "é pública": o teto existe contra
    // enumeração e spam, e uma pública que serve conteúdo ESTÁTICO (o formulário
    // de PPP em branco, a versão do build) ou proxeia uma imagem já pública não
    // enumera nada. Exigir teto delas seria cerimônia — e cerimônia é como um
    // guard vira ruído e depois vira `skip`.
    // `.from('<tabela>')` com literal — `Buffer.from(bytes)` não é consulta ao
    // banco, e um predicado que não distingue os dois acusa a rota que gera o
    // PDF em branco.
    const enumeraOuEscreve = (r: Rota) => /\.\s*from\s*\(\s*['"]/.test(r.src) || r.metodos.some((m) => m !== 'GET');

    const faltando = Object.keys(PUBLICAS_POR_DESIGN)
      .filter((f) => todas.some((r) => r.arquivo === f))
      .filter((f) => enumeraOuEscreve(todas.find((r) => r.arquivo === f)!))
      .filter((f) => !RATE.test(todas.find((r) => r.arquivo === f)!.src))
      .map((f) => `  ❌ ${f}`);
    expect(
      faltando.join('\n'),
      faltando.length
        ? `Rota pública sem rate limit:\n${faltando.join('\n')}\n\n` +
          'Sem sessão e sem teto, ela é um canal aberto de enumeração ou de envio.'
        : '',
    ).toBe('');
  });

  it('rotas de IA têm rate limit (custo por request)', () => {
    // Detecta pelo CONTEÚDO, não pelo caminho: `/api/temporada/**/pdf` mora sob
    // `temporada/` e não chama IA nenhuma — classificar por pasta acusa quem
    // não tem nada com isso, e guard que erra o alvo é abandonado.
    const deIA = todas.filter((r) => /\bcallAI(Chat)?\s*\(/.test(r.src) || /\/(chat|chat-simulador)\//.test(r.arquivo));
    const faltando = deIA.filter((r) => !RATE.test(r.src)).map((r) => `  ❌ ${r.arquivo}`);
    expect(
      faltando.join('\n'),
      faltando.length ? `Rota que chama IA sem rate limit:\n${faltando.join('\n')}` : '',
    ).toBe('');
  });

  it('nenhuma entrada stale em PUBLICAS_POR_DESIGN', () => {
    const stale = Object.keys(PUBLICAS_POR_DESIGN).filter((f) => !todas.some((r) => r.arquivo === f));
    expect(stale.join(', '), stale.length ? `entradas de rota que não existem mais: ${stale.join(', ')}` : '').toBe('');
  });
});
