import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import ts from 'typescript';
import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { upsertRelatorioAgregado } from '@/actions/fase5/_shared';

/**
 * B11 da auditoria 22/08 — `upsertRelatorioAgregado` era read-modify-write, não
 * atômico, e silencioso nos dois ramos.
 *
 * A corrida foi PROVADA no banco, em sandbox isolada, com duas conexões e
 * transações reais (24/08): `select + insert` concorrente produziu **2 linhas**;
 * o upsert nativo sobre a coluna gerada produziu **1 linha e 0 erro**. Um teste
 * unitário sequencial não consegue exprimir isso — o que ele PODE provar, e é o
 * que está aqui, é que a forma mudou: não existe mais janela entre ler e
 * escrever, e a falha não passa mais em silêncio.
 *
 * 🔴 E o achado que apareceu ao consertar: os QUATRO tipos que esta função grava
 * não cabiam em `relatorios_tipo_check`. O Postgres recusava, o erro era
 * descartado e a action devolvia `success: true` — os quatro tipos tinham ZERO
 * linhas no banco. O último bloco deste arquivo existe para isso não voltar.
 */

const TIPO = 'rh_manual';

describe('B11 — o upsert do relatório agregado é atômico', () => {
  it('é UMA operação: não há mais select antes da escrita (a janela sumiu)', async () => {
    const sb = criarSupabaseMock({});
    await upsertRelatorioAgregado(sb.client, TIPO, { a: 1 });

    expect(sb.escritas).toHaveLength(1);
    expect(sb.escritas[0].op).toBe('upsert');
    // o select prévio era a janela da corrida
    expect(sb.chamadas.filter((c) => c.metodo === 'select')).toHaveLength(0);
  });

  it('nomeia o índice certo em onConflict (a coluna GERADA, não colaborador_id)', async () => {
    const sb = criarSupabaseMock({});
    await upsertRelatorioAgregado(sb.client, TIPO, { a: 1 });

    const upsert = sb.chamadas.find((c) => c.metodo === 'upsert');
    expect(upsert?.args[1]).toEqual({ onConflict: 'empresa_id,tipo,colab_key' });
  });

  it('🔴 falha de escrita LANÇA — antes, os chamadores devolviam success:true sem ter gravado', async () => {
    const sb = criarSupabaseMock({ falhas: [{ tabela: 'relatorios', op: 'upsert', mensagem: 'violates check constraint' }] });
    await expect(upsertRelatorioAgregado(sb.client, TIPO, { a: 1 }))
      .rejects.toThrow(/não foi possível salvar o relatório "rh_manual"/);
  });
});

/**
 * Guard do achado: todo `tipo` gravado no código tem de caber no CHECK do banco.
 *
 * A lista é lida da MIGRATION, não copiada — copiar aqui a faria envelhecer em
 * silêncio, que é a mesma classe do bug. `Medido em 24/08:` quatro tipos usados
 * pelo código estavam fora do CHECK desde sempre (ele veio do baseline do GAS), e
 * o único sintoma era o relatório não existir.
 */
describe('todo tipo de relatório gravado cabe no CHECK do banco', () => {
  const migration = readFileSync('migrations/224-relatorios-tipo-check-fase5.sql', 'utf-8');
  const permitidos = new Set(
    [...migration.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]),
  );

  const arquivos = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8' })
    .split('\0')
    .filter((f) => /^(actions|lib|app|trigger)\/.*\.tsx?$/.test(f));

  /**
   * `upsertRelatorioAgregado(tdb, 'x'` e o `tipo` que vai para uma ESCRITA em
   * `relatorios` — só ele.
   *
   * 🔴 A versão anterior era `if (arquivo menciona from('relatorios'))` +
   * varredura de `tipo:\s*'...'` no ARQUIVO INTEIRO. Isso trava por engano
   * qualquer arquivo que escreva em `relatorios` e tenha um campo `tipo` de
   * outra tabela: em 30/08 um `temporada_plano` (JSONB de `trilhas`) com
   * `tipo: 'conteudo'` bloqueou o push de todo mundo com um erro que mandava
   * "amplie o CHECK numa migration nova" — quando o banco não recusaria nada. E
   * o guard lê o DISCO, então a linha nem precisava estar commitada.
   *
   * O escopo agora é o ARGUMENTO da escrita: objeto literal direto, ou, quando
   * a escrita recebe uma variável (`insert(rows)`), o que ALIMENTA essa variável
   * dentro da função (declaração, `rows.push({...})`, atribuição). Esse desenho
   * não é palpite — as duas implementações rodaram lado a lado contra os **50
   * arquivos do repo que mencionam `relatorios`** (878 varridos): a versão que
   * olhava só a cadeia sintática PERDIA 3 tipos reais (`individual`, `gestor`,
   * `rh`, todos montados por `rows.push` antes do insert) e a que olhava a
   * função inteira ainda engolia o falso positivo. Esta empata com a antiga nos
   * tipos legítimos e não vê o de outra tabela — ver o `it` do caso injetado.
   */
  function tiposDeRelatorio(file: string, src: string): string[] {
    const achados: string[] = [];
    for (const m of src.matchAll(/upsertRelatorioAgregado\s*\([^,]+,\s*'([^']+)'/g)) achados.push(m[1]);
    if (!/from\(\s*'relatorios'\s*\)/.test(src)) return achados;

    const sf = ts.createSourceFile(
      file, src, ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const ESCRITA = ['insert', 'upsert', 'update'];
    const ehFuncao = (n: ts.Node) =>
      ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isSourceFile(n);

    /** Todo `tipo: 'x'` literal dentro de um nó. */
    const colher = (no: ts.Node) => {
      const varrer = (n: ts.Node) => {
        if (
          ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) &&
          n.name.text === 'tipo' && ts.isStringLiteral(n.initializer)
        ) achados.push(n.initializer.text);
        ts.forEachChild(n, varrer);
      };
      varrer(no);
    };

    const visitar = (no: ts.Node) => {
      if (
        ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) &&
        ESCRITA.includes(no.expression.name.text) &&
        /from\(\s*'relatorios'\s*\)/.test(no.expression.expression.getText(sf))
      ) {
        const arg = no.arguments[0];
        if (arg && ts.isIdentifier(arg)) {
          const nome = arg.text;
          let escopo: ts.Node = no;
          while (escopo.parent && !ehFuncao(escopo)) escopo = escopo.parent;
          const alimentadores = (n: ts.Node) => {
            if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === nome && n.initializer) {
              colher(n.initializer);
            }
            if (
              ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
              ts.isIdentifier(n.expression.expression) && n.expression.expression.text === nome &&
              ['push', 'unshift', 'concat'].includes(n.expression.name.text)
            ) {
              for (const a of n.arguments) colher(a);
            }
            if (
              ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
              ts.isIdentifier(n.left) && n.left.text === nome
            ) colher(n.right);
            ts.forEachChild(n, alimentadores);
          };
          alimentadores(escopo);
        } else if (arg) {
          colher(arg);
        }
      }
      ts.forEachChild(no, visitar);
    };
    visitar(sf);
    return achados;
  }

  function tiposUsados(): Array<{ file: string; tipo: string }> {
    const achados: Array<{ file: string; tipo: string }> = [];
    for (const f of arquivos) {
      let src: string;
      try { src = readFileSync(f, 'utf-8'); } catch { continue; }
      if (!src.includes('relatorios')) continue;
      for (const tipo of tiposDeRelatorio(f, src)) achados.push({ file: f, tipo });
    }
    return achados;
  }

  /**
   * O caso INJETADO. Sem ele, "o guard não acusa mais o falso positivo" seria
   * uma afirmação sobre o estado do repo hoje — e o repo já mudou no meio desta
   * própria rodada (a linha que disparou tudo saiu do disco enquanto eu media).
   * Aqui as duas metades ficam presas: a que precisa acusar e a que não.
   */
  const FONTE_INJETADA = `
    async function reset(sb: any) {
      // Campo \`tipo\` de OUTRA tabela — o guard antigo travava o push por isto.
      const trilhas = [{ empresa_id: 'e', temporada_plano: [{ semana: 1, tipo: 'conteudo' }] }];
      await sb.from('trilhas').upsert(trilhas);

      // Escrita por variável: precisa ser vista, mesmo montada antes do insert.
      const rows: any[] = [];
      rows.push({ empresa_id: 'e', tipo: 'individual' });
      await sb.from('relatorios').insert(rows);

      // Escrita com objeto literal na própria cadeia.
      await sb.from('relatorios').insert({ empresa_id: 'e', tipo: 'tipo_invalido' });
    }
  `;

  it('o extrator vê o tipo que vai para `relatorios` — e só ele', () => {
    const vistos = tiposDeRelatorio('injetado.ts', FONTE_INJETADA);

    // Positivo nas duas formas de escrita (sem isto, "não acusa nada" passaria).
    expect(vistos).toContain('individual');
    expect(vistos).toContain('tipo_invalido');
    // O `tipo` do JSONB de `trilhas` não é tipo de relatório.
    expect(vistos).not.toContain('conteudo');
  });

  it('a lista de permitidos foi lida da migration (não é uma cópia vazia)', () => {
    expect(permitidos.size).toBeGreaterThanOrEqual(9);
    expect(permitidos.has('plenaria_evolucao')).toBe(true);
  });

  it('nenhum tipo gravado pelo código está fora do CHECK', () => {
    const fora = tiposUsados().filter((u) => !permitidos.has(u.tipo));
    if (fora.length > 0) {
      throw new Error(
        `${fora.length} tipo(s) de relatório que o banco vai RECUSAR:\n` +
        fora.map((u) => `  ❌ ${u.file}: '${u.tipo}'`).join('\n') +
        '\n\nO CHECK `relatorios_tipo_check` recusa, e se a escrita não checar `{ error }`\n' +
        'o relatório simplesmente não existe — foi assim que 4 tipos da fase 5 ficaram\n' +
        'com ZERO linhas sem ninguém notar. Amplie o CHECK numa migration nova.',
      );
    }
  });
});
