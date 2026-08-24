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
 *              `requirePermissionAction(<perm de rh>)` + id vindo do cliente
 *              (na assinatura OU indireto) + NENHUM gate de plataforma/tenant
 *              no corpo (com delegação de 1 nível).
 *   sanciona = requireAdminAction · requireEmpresaSupabase · requireLinhaSupabase
 *              · requirePlataformaSupabase · assertTenantAccessAction
 *              · requireCommercialAdminAction · isPlatformAdmin(
 *
 * LIMITES ASSUMIDOS:
 *  1. Vê que EXISTE gate de tenant, não que ele está CORRETO. Contra isso só
 *     revisão humana — e há fixture no fim deste arquivo para que o limite fique
 *     escrito, não implícito.
 *  2. `escopoTenantDaLinha`/`tenantDb(<id da linha>)` NÃO sancionam, de propósito.
 *     Se um dia forem o padrão desejado, a decisão é declarar na allowlist com o
 *     motivo — não afrouxar o predicado.
 */
import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { exportsUseServer, analisarFonte, trackedTsFiles, PARECE_ID, type ExportUseServer } from '../../helpers/use-server-ast';
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

/**
 * Gate que decide PLATAFORMA ou TENANT — sanciona o export.
 *
 * `requireLinhaSupabase` e `requirePlataformaSupabase` entraram em 24/08 (Sprint 2):
 * o primeiro autoriza pelo tenant DA LINHA (o caso em que o cliente manda o id do
 * recurso, não o da empresa), o segundo exige platform admin. Os dois são
 * `lib/admin-supabase.ts` e delegam o service-role — não é token novo por
 * conveniência, é o gate que a classe A5 precisava e não existia.
 */
const GATE_FORTE =
  /requireAdminAction|requireEmpresaSupabase|requireLinhaSupabase|requirePlataformaSupabase|assertTenantAccessAction|requireCommercialAdminAction|requireRepresentative\w*Action|\bisPlatformAdmin\s*\(/;

interface Achado { file: string; nome: string; line: number; perm: string; ids: string[] }

/**
 * O predicado, isolado — para poder ser exercitado contra fixture sintética.
 *
 * `paramsIndiretos` é o sinal aprendido na Sprint 2: o id do cliente nem sempre
 * está na assinatura. `enqueueKit(p: EnqueueKitParams)` esconde `empresaId` numa
 * interface declarada fora, e `salvarCompetenciaBase(comp: any)` recebia o id em
 * `comp.id`. Os dois eram da classe A5 e o guard, olhando só a assinatura, achou
 * 20 de 22.
 */
export function classificar(e: ExportUseServer): Achado | null {
  if (GATE_FORTE.test(e.corpo)) return null; // plataforma ou tenant já decidiu

  GATE_PERMISSAO.lastIndex = 0;
  let m: RegExpExecArray | null;
  let permDeRh: string | null = null;
  while ((m = GATE_PERMISSAO.exec(e.corpo)) !== null) {
    if (PERMS_RH.has(m[1])) { permDeRh = m[1]; break; }
  }
  if (!permDeRh) return null; // sem gate, ou gate com permissão exclusiva de plataforma

  const ids = [...new Set([...e.params, ...e.paramsIndiretos].filter((p) => PARECE_ID.test(p)))];
  if (ids.length === 0) return null; // não recebe id do cliente

  return { file: e.file, nome: e.nome, line: e.line, perm: permDeRh, ids };
}

const achados = exportsUseServer().map(classificar).filter(Boolean) as Achado[];
const porArquivo: Record<string, Achado[]> = {};
for (const a of achados) (porArquivo[a.file] ||= []).push(a);

const achou = (f: string, n: string) => achados.some((a) => a.file === f && a.nome === n);

/**
 * Confirmados SEGUROS na leitura: têm `requireAdminAction`. Se aparecerem, o
 * predicado quebrou.
 */
const NAO_PODEM_SER_ACHADOS: Array<[string, string]> = [
  // 🔴 Este estava na lista de VULNERÁVEIS do inventário manual e o guard o
  // refutou: `requireAdminAction` está na PRIMEIRA linha do corpo, e minha
  // leitura começou na linha do `requireAdminSupabase`. Ficou aqui como âncora:
  // se um dia aparecer como achado, o gate sumiu.
  ['actions/competencias.ts', 'excluirCompetencia'],
  ['actions/extracao-video.ts', 'submeterMaterialAsync'],
  ['actions/extracao-video.ts', 'submeterTextoBaseAsync'],
  ['actions/extracao-video.ts', 'submeterExtracaoAsync'],
  ['actions/gerar-video.ts', 'dispararVideoDeModulo'],
  ['app/admin/whatsapp/actions.ts', 'loadTurmasEnvio'],
  ['app/admin/whatsapp/actions.ts', 'enviarMagicLinksWhatsApp'],
  ['app/admin/whatsapp/actions.ts', 'previewTemplateWhatsApp'],
  ['app/admin/whatsapp/actions.ts', 'dispararTemplateWhatsApp'],
  // Sprint 2 (24/08) — corrigidos, e por isso viram âncora NEGATIVA: se
  // reaparecerem, alguém tirou o gate. A lista dos 20 está no commit da sprint.
  ['actions/conteudos.ts', 'atualizarConteudo'],
  ['actions/conteudos.ts', 'gerarConteudoFinal'],
  ['actions/conteudos.ts', 'gerarPodcastAudio'],
  ['actions/conteudos.ts', 'aprovarRoteiroPodcastEGerarAudio'],
  ['actions/conteudos.ts', 'excluirConteudoFinal'],
  ['actions/conteudos.ts', 'deletarConteudo'],
  ['actions/conteudos.ts', 'gerarConteudoIA'],
  ['actions/conteudos.ts', 'gerarConteudoLote'],
  ['actions/conteudos.ts', 'importarVideosBunny'],
  ['actions/conteudos.ts', 'aplicarTagsIA'],
  ['actions/fase1.ts', 'removerTop10'],
  ['actions/competencias-base.ts', 'excluirCompetenciaBase'],
  ['actions/competencias-base.ts', 'salvarCompetenciaBase'],
  ['actions/onboarding.ts', 'configurarCompetencias'],
  ['actions/onboarding.ts', 'importarColaboradoresLote'],
  ['actions/ppp.ts', 'extrairPPP'],
  ['actions/kits.ts', 'planejarKitsCoorte'],
  ['actions/kits.ts', 'statusKit'],
  ['actions/kits.ts', 'gerarKit'],
  ['actions/kits.ts', 'gerarKitSemanal'],
  ['actions/kits.ts', 'enqueueKit'],
  ['actions/manuscrito-batch.ts', 'analisarManuscrito'],
];

describe('Guard G-A5: gate de permissão sem gate de tenant', () => {
  it('o guard enxerga o repositório (não passou vazio por engano)', () => {
    expect(trackedTsFiles().length).toBeGreaterThan(100);
    expect(PERMS_RH.size).toBeGreaterThan(5);
    expect(exportsUseServer().length).toBeGreaterThan(100);
  });

  it('NÃO acha nenhum dos confirmados SEGUROS (senão vira ruído, que é como guard morre)', () => {
    const falsos = NAO_PODEM_SER_ACHADOS.filter(([f, n]) => achou(f, n));
    if (falsos.length > 0) {
      throw new Error(
        `o guard flagrou export com gate conhecido:\n` +
        falsos.map(([f, n]) => `  ⚠️ ${f}::${n}`).join('\n') +
        '\n\nEsses têm gate de plataforma ou de tenant. Ou o gate foi removido (bug\n' +
        'de verdade), ou o GATE_FORTE não reconhece mais o padrão.',
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
        '  · tenant vem da LINHA → requireLinhaSupabase(tabela, id, perm, "<acao>")\n' +
        '  · é mesmo de plataforma → requirePlataformaSupabase(perm)\n' +
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
 * 🔑 AS FIXTURES — o guard tem de continuar VENDO a classe depois que ela some
 * do repositório.
 *
 * Até 24/08 o critério de aceite era uma lista de 20 exports reais que o
 * predicado tinha de achar. A Sprint 2 corrigiu os 20, e aí o critério vira
 * denominador zero: sem nenhum caso positivo, um predicado afrouxado (uma regex
 * que para de casar, um sinal que some) fica **verde por não ter o que achar**,
 * indistinguível de "a dívida acabou".
 *
 * Estas fixtures passam pela máquina AST de verdade (`analisarFonte`), não por
 * uma cópia da regra — cópia envelhece sozinha.
 */
describe('o predicado ainda vê a classe (fixtures — a allowlist real está quase vazia)', () => {
  const varrerFonte = (src: string) => analisarFonte('fixture.ts', src).map(classificar).filter(Boolean);

  it('a forma canônica: permissão de rh + id na assinatura, sem gate de tenant', () => {
    const achados = varrerFonte(`'use server';
      export async function editar(id: string, patch: any) {
        const sb = await requireAdminSupabase('content.manage');
        return sb.from('micro_conteudos').update(patch).eq('id', id);
      }`);
    expect(achados).toHaveLength(1);
    expect(achados[0]!.nome).toBe('editar');
  });

  it('id escondido em tipo NOMEADO — o ponto cego que deixou `enqueueKit` passar', () => {
    const achados = varrerFonte(`'use server';
      interface Params { empresaId?: string | null; competencia: string }
      export async function enfileirar(p: Params) {
        const sb = await requireAdminSupabase('content.manage');
        return sb.from('kit_jobs').insert({ empresa_id: p.empresaId });
      }`);
    expect(achados).toHaveLength(1);
    expect(achados[0]!.ids).toContain('empresaId');
  });

  it('id que só aparece no CORPO — o ponto cego de `salvarCompetenciaBase(comp: any)`', () => {
    const achados = varrerFonte(`'use server';
      export async function salvar(comp: any) {
        const sb = await requireAdminSupabase('content.manage');
        return sb.from('competencias_base').update(comp).eq('id', comp.id);
      }`);
    expect(achados).toHaveLength(1);
    expect(achados[0]!.ids).toContain('id');
  });

  it('permissão EXCLUSIVA de plataforma não é a classe (rh não a tem)', () => {
    expect(varrerFonte(`'use server';
      export async function auditar(empresaId: string) {
        const sb = await requireAdminSupabase('ai.audit.regenerate');
        return sb.from('x').select('*').eq('empresa_id', empresaId);
      }`)).toHaveLength(0);
  });

  it('export sem id do cliente não é a classe', () => {
    expect(varrerFonte(`'use server';
      export async function listarTudo() {
        const sb = await requireAdminSupabase('content.manage');
        return sb.from('micro_conteudos').select('id');
      }`)).toHaveLength(0);
  });

  it.each([
    ['requireEmpresaSupabase', `const sb = await requireEmpresaSupabase(empresaId, 'content.manage', 'x');`],
    ['requireLinhaSupabase', `const { sb } = await requireLinhaSupabase('t', id, 'content.manage', 'x');`],
    ['requirePlataformaSupabase', `const sb = await requirePlataformaSupabase('content.manage');`],
    ['requireAdminAction', `await requireAdminAction('content.manage'); const sb = await requireAdminSupabase('content.manage');`],
  ])('gate %s sanciona o export', (_nome, gate) => {
    expect(varrerFonte(`'use server';
      export async function f(empresaId: string, id: string) {
        ${gate}
        return sb;
      }`)).toHaveLength(0);
  });

  /**
   * A distinção que o `tenant-mutation-guard` confunde e que motivou este guard:
   * escopar a escrita ao tenant da linha NÃO autoriza quem pediu.
   */
  it('escopoTenantDaLinha e tenantDb NÃO sancionam (escopam a escrita, não autorizam o chamador)', () => {
    const achados = varrerFonte(`'use server';
      export async function apagar(id: string) {
        const sb = await requireAdminSupabase('content.manage');
        const { data: linha } = await sb.from('t').select('empresa_id').eq('id', id).maybeSingle();
        return escopoTenantDaLinha(tenantDb(linha.empresa_id).from('t').delete().eq('id', id), linha);
      }`);
    expect(achados).toHaveLength(1);
  });

  it('a delegação de 1 nível continua valendo (gate no helper local)', () => {
    expect(varrerFonte(`'use server';
      async function _editar(id: string) {
        const { sb } = await requireLinhaSupabase('t', id, 'content.manage', 'x');
        return sb;
      }
      export async function editar(id: string) { return _editar(id); }`)).toHaveLength(0);
  });
});

/**
 * ⚠️ LIMITE 1, POR ESCRITO E EXERCITADO.
 *
 * O guard vê que EXISTE gate de tenant, não que ele está correto. Um gate que
 * compara o pedido com ele mesmo — `assertTenantAccessAction(ctx, empresaId)`
 * onde `ctx.empresaId` foi tirado do MESMO parâmetro, ou um `.eq('empresa_id',
 * empresaId)` que só repete o que o cliente mandou — SANCIONA o export.
 *
 * Este teste não conserta o limite: ele o torna VISÍVEL, para ninguém ler a
 * ausência de achados como ausência de risco.
 */
describe('limite conhecido: o guard não valida o ARGUMENTO do gate', () => {
  it('gate presente mas comparando o pedido com o próprio pedido é sancionado', () => {
    const inseguroMasSancionado = `'use server';
      export async function f(empresaId: string) {
        const ctx = { empresaId, isPlatformAdmin: false };
        await assertTenantAccessAction(ctx as any, empresaId);  // compara o pedido com o pedido
        const sb = await requireAdminSupabase('content.manage');
        return sb.from('colaboradores').delete().eq('empresa_id', empresaId);
      }`;
    expect(analisarFonte('fixture.ts', inseguroMasSancionado).map(classificar).filter(Boolean)).toHaveLength(0);
  });
});
