/**
 * Guard G-A5: "gate de PERMISSÃO sem gate de TENANT" — export `'use server'` que
 * recebe um id do CLIENTE, exige uma permissão que o papel `rh` POSSUI, e nunca
 * confronta o tenant pedido com o do contexto autenticado.
 *
 * Num arquivo `'use server'` todo export é endpoint HTTP e todo parâmetro é
 * escolhido pelo cliente. `requireAdminSupabase('content.manage')` prova que quem
 * chamou TEM a permissão — e `content.manage` está em `BASE_ROLE_PERMISSIONS.rh`.
 * Logo um RH do tenant A passa, e o `empresaId` (ou o id do recurso) que decide a
 * linha veio dele. Foi a classe A1/A2/A3/A5 da auditoria de 22/08.
 *
 * ⚠️ POR QUE ESTE GUARD PRECISOU EXISTIR — os dois candidatos naturais não veem:
 *
 *  · `tenant-mutation-guard` **SANCIONA** `escopoTenantDaLinha` e `tdb` (linha 59
 *    de lá). Mas esses escopam a ESCRITA ao tenant da linha lida — não autorizam
 *    o CHAMADOR naquele tenant. É a diferença entre "a escrita não escapa da
 *    linha" e "quem pediu tinha direito à linha". Consertar o escopo dele não
 *    traria um único export desta classe.
 *  · `ownership-guard` descarta estes exports na linha 192 (`!GATES_FRACOS`):
 *    eles não têm token de gate de SESSÃO, então saem da varredura antes de
 *    chegar ao teste de posse. Foi por isso que o achado A6 caiu — o mecanismo
 *    que ele acusava não tinha o alcance alegado.
 *
 * Ou seja: até 23/08 a classe que produziu A1/A2/A3/A5 **não tinha detector
 * nenhum**, e o inventário dos candidatos foi feito à mão.
 *
 * HEURÍSTICA (sinal, não prova — igual aos irmãos):
 *   flagra   = export 'use server' + `requireAdminSupabase(<perm de rh>)` ou
 *              `requirePermissionAction(<perm de rh>)` + parâmetro com cara de id
 *              + NENHUM gate de plataforma/tenant no corpo (com delegação de 1 nível).
 *   sanciona = requireAdminAction · requireEmpresaSupabase · assertTenantAccessAction
 *              · requireCommercialAdminAction · isPlatformAdmin(
 *
 * LIMITES ASSUMIDOS:
 *  1. Vê que EXISTE gate de tenant, não que ele está CORRETO. `assertTenantAccessAction`
 *     chamado com o id errado passa. Contra isso só revisão humana — e há fixture
 *     negativa no fim deste arquivo para que o limite fique escrito, não implícito.
 *  2. `escopoTenantDaLinha`/`tenantDb(<id da linha>)` NÃO sancionam, de propósito.
 *     Se um dia forem o padrão desejado, a decisão é declarar na allowlist com o
 *     motivo — não afrouxar o predicado.
 */
import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { exportsUseServer, trackedTsFiles, PARECE_ID } from '../../helpers/use-server-ast';
import { BASE_ROLE_PERMISSIONS } from '@/lib/permissions';

const config = JSON.parse(readFileSync('config/gate-permissao-allowlist.json', 'utf-8'));
const allowlist: Record<string, { motivo: string; exports: string[] }> = config.allowlist;

/**
 * Permissões do papel `rh` — lidas da FONTE, não copiadas.
 *
 * Copiar a lista aqui a deixaria envelhecer em silêncio: no dia em que uma
 * permissão nova entrar no `rh`, os exports gatados por ela ficariam invisíveis
 * ao guard sem ninguém tocar nele. É a classe "cobertura se lê no arquivo".
 */
const PERMS_RH = new Set<string>(BASE_ROLE_PERMISSIONS.rh as unknown as string[]);

/** Gate que prova PERMISSÃO e nada mais. Captura o argumento para cruzar com PERMS_RH. */
const GATE_PERMISSAO = /\b(?:requireAdminSupabase|requirePermissionAction)\s*\(\s*'([^']+)'/g;

/** Gate que decide PLATAFORMA ou TENANT — sanciona o export. */
const GATE_FORTE =
  /requireAdminAction|requireEmpresaSupabase|assertTenantAccessAction|requireCommercialAdminAction|requireRepresentative\w*Action|\bisPlatformAdmin\s*\(/;

interface Achado { file: string; nome: string; line: number; perm: string; ids: string[] }

function varrer(): Achado[] {
  const achados: Achado[] = [];

  for (const e of exportsUseServer()) {
    if (GATE_FORTE.test(e.corpo)) continue; // plataforma ou tenant já decidiu

    GATE_PERMISSAO.lastIndex = 0;
    let m: RegExpExecArray | null;
    let permDeRh: string | null = null;
    while ((m = GATE_PERMISSAO.exec(e.corpo)) !== null) {
      if (PERMS_RH.has(m[1])) { permDeRh = m[1]; break; }
    }
    if (!permDeRh) continue; // sem gate, ou gate com permissão exclusiva de plataforma

    const ids = [...new Set(e.params.filter((p) => PARECE_ID.test(p)))];
    if (ids.length === 0) continue; // não recebe id do cliente

    achados.push({ file: e.file, nome: e.nome, line: e.line, perm: permDeRh, ids });
  }
  return achados;
}

const achados = varrer();
const porArquivo: Record<string, Achado[]> = {};
for (const a of achados) (porArquivo[a.file] ||= []).push(a);

/**
 * Âncoras do inventário manual de 23/08 (`audit-2026-08/02-inventario-a5.md`,
 * fora do repo). São o critério de aceite deste guard, e existem porque o
 * critério ANTERIOR do plano — "achar pelo menos 20" — premia falso positivo:
 * um predicado frouxo bate a meta sinalizando código seguro.
 */
const DEVEM_SER_ACHADOS: Array<[string, string]> = [
  ['actions/conteudos.ts', 'atualizarConteudo'],
  ['actions/conteudos.ts', 'gerarPodcastAudio'],
  ['actions/conteudos.ts', 'excluirConteudoFinal'],
  ['actions/conteudos.ts', 'deletarConteudo'],
  ['actions/fase1.ts', 'removerTop10'],
  ['actions/competencias-base.ts', 'excluirCompetenciaBase'],
  ['actions/onboarding.ts', 'configurarCompetencias'],
  ['actions/onboarding.ts', 'importarColaboradoresLote'],
  ['actions/ppp.ts', 'extrairPPP'],
  ['actions/kits.ts', 'planejarKitsCoorte'],
  ['actions/kits.ts', 'statusKit'],
  // 🔎 Os 7 abaixo o guard achou e o inventário manual PERDEU (meu enumerador
  // procurava id só nas ~6 primeiras linhas do export). Estavam na lista original
  // do achado A5 — a auditoria estava mais completa que a minha varredura.
  ['actions/conteudos.ts', 'gerarConteudoIA'],
  ['actions/conteudos.ts', 'gerarConteudoLote'],
  ['actions/conteudos.ts', 'importarVideosBunny'],
  ['actions/conteudos.ts', 'aplicarTagsIA'],
  ['actions/kits.ts', 'gerarKit'],
  ['actions/kits.ts', 'gerarKitSemanal'],
  ['actions/manuscrito-batch.ts', 'analisarManuscrito'],
];

/** Confirmados SEGUROS na leitura: têm `requireAdminAction`. Se aparecerem, o predicado quebrou. */
const NAO_PODEM_SER_ACHADOS: Array<[string, string]> = [
  // 🔴 Este estava na lista de VULNERÁVEIS do inventário manual e o guard o
  // refutou: `requireAdminAction` está na PRIMEIRA linha do corpo, e minha
  // leitura começou na linha do `requireAdminSupabase`. É o mesmo erro de janela
  // que o próprio inventário documenta — cometido na revisão dele. Ficou aqui
  // como âncora: se um dia aparecer como achado, o gate sumiu.
  ['actions/competencias.ts', 'excluirCompetencia'],
  ['actions/extracao-video.ts', 'submeterMaterialAsync'],
  ['actions/extracao-video.ts', 'submeterTextoBaseAsync'],
  ['actions/extracao-video.ts', 'submeterExtracaoAsync'],
  ['actions/gerar-video.ts', 'dispararVideoDeModulo'],
  ['app/admin/whatsapp/actions.ts', 'loadTurmasEnvio'],
  ['app/admin/whatsapp/actions.ts', 'enviarMagicLinksWhatsApp'],
  ['app/admin/whatsapp/actions.ts', 'previewTemplateWhatsApp'],
  ['app/admin/whatsapp/actions.ts', 'dispararTemplateWhatsApp'],
];

const achou = (f: string, n: string) => achados.some((a) => a.file === f && a.nome === n);

describe('Guard G-A5: gate de permissão sem gate de tenant', () => {
  it('o guard enxerga o repositório (não passou vazio por engano)', () => {
    expect(trackedTsFiles().length).toBeGreaterThan(100);
    expect(PERMS_RH.size).toBeGreaterThan(5);
  });

  it('acha 100% dos confirmados VULNERÁVEIS no inventário de 23/08', () => {
    const faltando = DEVEM_SER_ACHADOS.filter(([f, n]) => !achou(f, n));
    if (faltando.length > 0) {
      throw new Error(
        `o predicado deixou de ver ${faltando.length} export confirmado vulnerável:\n` +
        faltando.map(([f, n]) => `  ❌ ${f}::${n}`).join('\n') +
        '\n\nOu o export foi corrigido (então tire-o da lista, com o commit ao lado),\n' +
        'ou o predicado afrouxou. Falso negativo aqui é escrita cross-tenant.',
      );
    }
  });

  it('NÃO acha nenhum dos confirmados SEGUROS (senão vira ruído, que é como guard morre)', () => {
    const falsos = NAO_PODEM_SER_ACHADOS.filter(([f, n]) => achou(f, n));
    if (falsos.length > 0) {
      throw new Error(
        `o guard flagrou export com gate de plataforma conhecido:\n` +
        falsos.map(([f, n]) => `  ⚠️ ${f}::${n}`).join('\n') +
        '\n\nEsses têm requireAdminAction. Ou o gate foi removido (bug de verdade),\n' +
        'ou o GATE_FORTE não reconhece mais o padrão.',
      );
    }
  });

  it('nenhum export NOVO fora da allowlist', () => {
    const fora = Object.entries(porArquivo)
      .map(([f, as]) => [f, as.filter((a) => !allowlist[f]?.exports.includes(a.nome))] as const)
      .filter(([, as]) => as.length > 0);

    if (fora.length > 0) {
      throw new Error(
        `${fora.reduce((n, [, as]) => n + as.length, 0)} export 'use server' com permissão de rh + id do cliente e SEM gate de tenant:\n` +
        fora.map(([f, as]) =>
          `  ❌ ${f}\n` + as.map((a) => `       ${a.nome}(${a.ids.join(', ')})  :${a.line}  [${a.perm}]`).join('\n'),
        ).join('\n') +
        '\n\nO gate de permissão NÃO é gate de tenant: `content.manage`, `users.manage`,\n' +
        '`settings.company.manage`, `exports.run` e `assessments.dispatch` estão no papel rh.\n' +
        'Conserto:\n' +
        '  · tenant é PARÂMETRO  → requireEmpresaSupabase(empresaId, perm, "<acao>")\n' +
        '  · tenant vem da LINHA → ler o empresa_id da linha + assertTenantAccessAction(ctx, ...)\n' +
        '  · é mesmo de plataforma → requireAdminAction(perm)\n' +
        '⚠️ escopoTenantDaLinha/tenantDb NÃO sancionam: escopam a escrita, não autorizam quem pediu.',
      );
    }
  });

  it('a allowlist só encolhe (nenhuma entrada stale)', () => {
    const stale = Object.entries(allowlist).flatMap(([f, cfg]) => {
      if (!existsSync(f)) return [`  ⚠️ ${f}: arquivo não existe mais`];
      return cfg.exports
        .filter((n) => !achou(f, n))
        .map((n) => `  ⚠️ ${f}::${n}: não é mais achado — remova a entrada`);
    });
    if (stale.length > 0) {
      throw new Error(`allowlist desatualizada:\n${stale.join('\n')}\n\nEla só encolhe.`);
    }
  });

  it('toda entrada da allowlist tem MOTIVO escrito', () => {
    const semMotivo = Object.entries(allowlist).filter(([, cfg]) => !cfg.motivo || cfg.motivo.length < 20);
    if (semMotivo.length > 0) {
      throw new Error(
        `entrada sem motivo: ${semMotivo.map(([f]) => f).join(', ')}\n` +
        'Allowlist sem motivo é dívida anônima — daqui a três meses ninguém sabe se ainda vale.',
      );
    }
  });
});

/**
 * ⚠️ LIMITE 1, POR ESCRITO E EXERCITADO.
 *
 * O guard vê que EXISTE gate de tenant, não que ele está correto. Uma chamada
 * `assertTenantAccessAction(ctx, empresaIdQueOClienteMandou)` compara o pedido com
 * o próprio pedido e SANCIONA o export — exatamente o defeito que as actions de
 * `pulse` tinham em 16/07 e que passa em revisão apressada.
 *
 * Este teste não conserta o limite: ele o torna VISÍVEL, para ninguém ler a
 * ausência de achados como ausência de risco.
 */
describe('limite conhecido: o guard não valida o ARGUMENTO do gate', () => {
  it('gate chamado com o id errado seria sancionado (por isso a revisão humana continua)', () => {
    const inseguroMasSancionado = `
      export async function f(empresaId: string) {
        const ctx = await requireUserAction();
        await assertTenantAccessAction(ctx, empresaId);  // compara o pedido com o pedido
        return tenantDb(empresaId).from('colaboradores').delete().eq('id', '1');
      }`;
    expect(GATE_FORTE.test(inseguroMasSancionado)).toBe(true);
  });
});
