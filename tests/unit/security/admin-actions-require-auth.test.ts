/**
 * Guard: toda action de admin exige gate server-side — **por EXPORT**.
 *
 * Num arquivo `'use server'` todo export é endpoint HTTP. Um gate em algum lugar
 * do arquivo não protege os outros exports dele.
 *
 * 🔴 REESCRITO EM 23/08/2026 (auditoria 22/08, achado E3). A versão anterior tinha
 * os três defeitos que a reescrita de 10/08 (F18) já havia corrigido no
 * `routes-require-auth` e que ninguém replicou aqui:
 *
 *  (a) **lista LITERAL de 15 arquivos.** O denominador real é **29** — e o
 *      `/admin-v2` INTEIRO (5 arquivos, incluindo o inbox) estava fora. Action de
 *      admin nova nascia invisível ao guard, sem ninguém perceber.
 *  (b) **`includes()` no fonte cru**, que casa o `import` e até um comentário. O
 *      helper `semComentarios` existe no repo desde 10/08 e não era usado aqui.
 *  (c) **asserção por ARQUIVO**: uma única ocorrência da string satisfazia o
 *      arquivo inteiro. `app/admin/vertho/knowledge-base/actions.ts` tem 9 exports
 *      e 2 chamadas de `requireAdmin*` — apagar o gate dos outros 8 mantinha o
 *      teste verde.
 *
 * Agora: descobre por `git ls-files`, percorre por AST (com delegação de 1 nível,
 * porque o idioma da casa é `export f() { return _f() }` com o gate no `_f`), e
 * exige o gate em CADA export. Exceção vive na allowlist, com motivo escrito.
 *
 * `Medido na reescrita:` 174 exports em 29 arquivos, 173 já com gate. O guard
 * antigo não estava escondendo um buraco — estava deixando de EXIGIR o que o time
 * já fazia por disciplina. É a diferença entre "está certo hoje" e "não pode
 * regredir amanhã".
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import { exportsUseServer } from '../../helpers/use-server-ast';

const config = JSON.parse(readFileSync('config/admin-actions-auth-allowlist.json', 'utf-8'));
const allowlist: Record<string, { motivo: string; exports: string[] }> = config.allowlist;

/** Arquivos de action sob qualquer painel de admin — `/admin` e `/admin-v2`. */
const PADRAO_ARQUIVO = /^app\/admin.*actions\.ts$/;

function arquivosDeAdmin(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter((f) => PADRAO_ARQUIVO.test(f));
  } catch {
    return [];
  }
}

/**
 * Gate server-side aceito.
 *
 * ⚠️ `isPlatformAdmin` só conta como CHAMADA (`isPlatformAdmin(email)`), nunca como
 * propriedade (`ctx.isPlatformAdmin`) — a propriedade costuma ser o *bypass* do
 * admin dentro de uma regra maior, não a régua. Mesma distinção do `ownership-guard`.
 * Onde a propriedade É o gate (early return), a saída é a allowlist com motivo, não
 * afrouxar o regex aqui.
 */
const GATE = /require(AdminAction|AdminSupabase|PermissionAction|EmpresaSupabase|UserAction|RoleAction|AdminOrCron)|checarAcessoPlataforma|\bisPlatformAdmin\s*\(/;

/** Autorização por parâmetro é autorização escolhida pelo CLIENTE. */
const AUTH_POR_PARAMETRO = /guardAdmin|callerEmail/;

const arquivos = new Set(arquivosDeAdmin());
const exports_ = exportsUseServer().filter((e) => arquivos.has(e.file));

const semGate = exports_.filter((e) => !GATE.test(e.corpo));
const porParametro = exports_.filter((e) => AUTH_POR_PARAMETRO.test(e.corpo));
const permitido = (f: string, n: string) => allowlist[f]?.exports.includes(n) ?? false;

describe('Guard: toda action de admin tem gate server-side, por export', () => {
  it('o guard enxerga o repositório (não passou vazio por engano)', () => {
    // O guard antigo tinha 15 caminhos digitados à mão; se a descoberta quebrar,
    // este teste falha em vez de o guard passar verde varrendo nada.
    expect(arquivos.size).toBeGreaterThanOrEqual(25);
    expect(exports_.length).toBeGreaterThan(100);
  });

  it('a descoberta cobre /admin-v2 (que a lista literal ignorava)', () => {
    const v2 = [...arquivos].filter((f) => f.startsWith('app/admin-v2/'));
    expect(v2.length).toBeGreaterThan(0);
  });

  it('todo export de action de admin tem gate — sem exceção fora da allowlist', () => {
    const fora = semGate.filter((e) => !permitido(e.file, e.nome));
    if (fora.length > 0) {
      throw new Error(
        `${fora.length} export de action de admin SEM gate server-side:\n` +
        fora.map((e) => `  ❌ ${e.file}::${e.nome}  :${e.line}`).join('\n') +
        "\n\nTodo export 'use server' é endpoint HTTP: o gate do vizinho não protege este.\n" +
        'Use requireAdminAction(perm) para plataforma, ou requireEmpresaSupabase(empresaId, perm, "<acao>")\n' +
        'quando a action recebe o tenant do cliente. Exceção legítima vai na allowlist COM MOTIVO.',
      );
    }
  });

  it('nenhuma action de admin recebe autorização por PARÂMETRO', () => {
    if (porParametro.length > 0) {
      throw new Error(
        `autorização vinda do cliente em:\n` +
        porParametro.map((e) => `  ❌ ${e.file}::${e.nome}`).join('\n') +
        '\n\n`guardAdmin(callerEmail)` deixa o CLIENTE dizer quem ele é.',
      );
    }
  });

  it('a allowlist só encolhe (nenhuma entrada stale)', () => {
    const stale = Object.entries(allowlist).flatMap(([f, cfg]) => {
      if (!existsSync(f)) return [`  ⚠️ ${f}: arquivo não existe mais`];
      return cfg.exports
        .filter((n) => !semGate.some((e) => e.file === f && e.nome === n))
        .map((n) => `  ⚠️ ${f}::${n}: já tem gate — remova a entrada`);
    });
    if (stale.length > 0) {
      throw new Error(`allowlist desatualizada:\n${stale.join('\n')}\n\nEla só encolhe.`);
    }
  });

  it('toda entrada da allowlist tem MOTIVO escrito', () => {
    const semMotivo = Object.entries(allowlist).filter(([, c]) => !c.motivo || c.motivo.length < 20);
    expect(semMotivo.map(([f]) => f)).toEqual([]);
  });
});

/**
 * Âncora do defeito (c): o arquivo que provou que "1 gate por arquivo" não basta.
 * Se um dia ele voltar a ter menos chamadas de gate que exports, é regressão da
 * régua — não do arquivo.
 */
describe('regressão do E3: gate é por export, não por arquivo', () => {
  it('knowledge-base/actions.ts — todos os exports gatados, não só 2 de 9', () => {
    const f = 'app/admin/vertho/knowledge-base/actions.ts';
    const doArquivo = exports_.filter((e) => e.file === f);
    expect(doArquivo.length).toBeGreaterThan(2);
    expect(doArquivo.filter((e) => !GATE.test(e.corpo)).map((e) => e.nome)).toEqual([]);
  });
});
