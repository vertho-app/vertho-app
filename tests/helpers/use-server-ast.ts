/**
 * Máquina AST compartilhada pelos guards que varrem exports `'use server'`.
 *
 * Extraída do `ownership-guard` em 23/08/2026, quando o `gate-permissao-guard`
 * (auditoria 22/08, item G-A5) precisou exatamente da mesma varredura. Duplicar
 * seria a régua em dois lugares — o padrão que esta base já pagou várias vezes:
 * os dois arquivos evoluem, um aprende uma delegação nova, o outro não, e a
 * diferença só aparece quando um bug passa pelo guard que ficou para trás.
 *
 * ⚠️ O inventário do A5 (23/08) mostrou por que a delimitação tem de ser por
 * ESCOPO DE FUNÇÃO e não por janela de N linhas: um classificador ingênuo, com
 * janela fixa, produziu 2 falsos negativos (o gate estava na linha ANTERIOR à
 * varrida) e 2 falsos positivos (a janela pegou o gate da função SEGUINTE).
 * Ele "achou" 22 problemas onde havia 14.
 */
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import ts from 'typescript';
import { semComentarios } from './fonte';

/** Arquivos .ts/.tsx VERSIONADOS, fora de tests/. */
export function trackedTsFiles(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter((f) => /\.tsx?$/.test(f) && !f.includes('/tests/') && !f.startsWith('tests/'));
  } catch {
    return [];
  }
}

export function isUseServer(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  return ts.isStringLiteral(first.expression) && first.expression.text === 'use server';
}

/** Todas as funções declaradas no arquivo, por nome (para seguir a delegação). */
export function funcoesLocais(sf: ts.SourceFile): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const node of sf.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) mapa.set(node.name.text, node.getText(sf));
    else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer) || ts.isCallExpression(d.initializer))) {
          mapa.set(d.name.getText(sf), d.getText(sf));
        }
      }
    }
  }
  return mapa;
}

/**
 * Corpo do export MAIS o das funções locais que ele chama (1 nível).
 *
 * O idioma dominante deste repo é `export async function f(x) { try { return
 * await _f(x) } catch {} }` com o gate dentro de `_f`. Lendo só o corpo do
 * export, o guard não veria gate NENHUM. Um nível basta para o padrão real; se
 * alguém empilhar dois wrappers, o guard volta a não ver — e é melhor saber
 * disso por escrito do que descobrir depois.
 */
export function corpoComDelegacao(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile, locais: Map<string, string>): string {
  const proprio = semComentarios(fn.getText(sf));
  const chamadas = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) chamadas.add(n.expression.text);
    ts.forEachChild(n, visit);
  };
  visit(fn);
  let extra = '';
  for (const nome of chamadas) {
    const corpo = locais.get(nome);
    if (corpo) {
      const limpo = semComentarios(corpo);
      if (limpo !== proprio) extra += `\n${limpo}`;
    }
  }
  return proprio + extra;
}

export interface ExportUseServer {
  file: string;
  line: number;
  nome: string;
  /** Corpo já com delegação de 1 nível e sem comentários. */
  corpo: string;
  /** Nomes de parâmetros + nomes de campo do tipo INLINE dos parâmetros. */
  params: string[];
  /**
   * Ids que chegam pelo cliente sem aparecer na assinatura: campo de um tipo
   * NOMEADO (`p: EnqueueKitParams`) e acesso `p.empresaId` no corpo.
   *
   * ⚠️ Ponto cego achado na Sprint 2 (24/08), corrigindo a classe A5: dois
   * exports da MESMA classe passaram batido porque o id não era um parâmetro
   * com nome de id — `enqueueKit(p: EnqueueKitParams)` (interface declarada
   * fora da assinatura) e `salvarCompetenciaBase(comp: any)` (o id vinha em
   * `comp.id`). O guard achou 20 e a classe tinha 22. Separado de `params` de
   * propósito: quem consome decide se quer o sinal mais largo, em vez de dois
   * guards mudarem de sensibilidade no mesmo commit.
   */
  paramsIndiretos: string[];
}

/** Nomes de propriedade de interfaces e type aliases declarados no arquivo. */
function camposDeTiposLocais(sf: ts.SourceFile): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const node of sf.statements) {
    if (ts.isInterfaceDeclaration(node)) {
      mapa.set(node.name.text, node.members.map((m) => m.name?.getText(sf) || '').filter(Boolean));
    } else if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
      mapa.set(node.name.text, node.type.members.map((m) => m.name?.getText(sf) || '').filter(Boolean));
    }
  }
  return mapa;
}

/**
 * Parâmetro com cara de identificador do cliente: `empresaId`, `empresa_id`,
 * `colabIds`, `id`.
 *
 * Esta é a regex do `ownership-guard`, adotada como canônica na extração de
 * 23/08. A que eu tinha escrito para o G-A5 era mais estreita — não pegava
 * `empresa_id` nem `…Ids` — e teria feito o guard antigo enxergar MENOS sem
 * ninguém notar. Só apareceu porque a extração foi verificada rodando as duas
 * implementações lado a lado contra um caso sintético; os testes do guard
 * passavam nas duas, porque a allowlist dele está vazia e ambas achavam zero.
 * Ao unificar duas réguas, a que vale é a MAIS COMPLETA.
 */
export const PARECE_ID = /(^|[a-z])(Id|_id|Ids)$|^id$/;

/**
 * Itera os exports de função de todos os arquivos `'use server'` versionados.
 * Um lugar só para percorrer; cada guard aplica o SEU predicado em cima disto.
 */
export function exportsUseServer(): ExportUseServer[] {
  const out: ExportUseServer[] = [];

  for (const file of trackedTsFiles()) {
    let src: string;
    try { src = readFileSync(file, 'utf-8'); } catch { continue; }
    if (!src.includes("'use server'")) continue; // filtro barato antes do parse
    out.push(...analisarFonte(file, src));
  }
  return out;
}

/**
 * A mesma varredura, sobre um fonte em MEMÓRIA.
 *
 * Existe para que um guard consiga exercitar o próprio predicado quando a
 * allowlist dele esvazia. Sem isto, o dia em que o último achado real é
 * corrigido é o dia em que o guard passa a rodar contra denominador zero: ele
 * fica verde por não ter o que achar, e um afrouxamento do predicado vira
 * indistinguível de "a dívida acabou". As fixtures do `gate-permissao-guard`
 * usam esta função — código sintético, mas passando pela máquina AST de
 * verdade, não por uma regex paralela que envelheceria sozinha.
 */
export function analisarFonte(file: string, src: string): ExportUseServer[] {
  const out: ExportUseServer[] = [];
  {
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (!isUseServer(sf)) return out;
    const locais = funcoesLocais(sf);
    const camposDeTipo = camposDeTiposLocais(sf);

    for (const node of sf.statements) {
      let nome: string | null = null;
      let fn: ts.FunctionLikeDeclaration | null = null;
      const exportado = (mods?: readonly ts.ModifierLike[]) =>
        mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

      if (ts.isFunctionDeclaration(node) && node.name && exportado(node.modifiers)) {
        nome = node.name.text; fn = node;
      } else if (ts.isVariableStatement(node) && exportado(node.modifiers)) {
        const d = node.declarationList.declarations[0];
        if (d?.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          nome = d.name.getText(sf); fn = d.initializer;
        }
      }
      if (!nome || !fn) continue;

      const params: string[] = [];
      const paramsIndiretos: string[] = [];
      const nomesDeParam: string[] = [];
      for (const p of fn.parameters) {
        if (ts.isIdentifier(p.name)) { params.push(p.name.text); nomesDeParam.push(p.name.text); }
        else if (ts.isObjectBindingPattern(p.name)) {
          for (const el of p.name.elements) params.push(el.name.getText(sf));
        }
        if (p.type) {
          const texto = p.type.getText(sf);
          const m = texto.match(/\b\w*[Ii]d\b/g);
          if (m) params.push(...m);
          // Tipo NOMEADO: os campos moram na declaração, não na assinatura.
          for (const campos of [camposDeTipo.get(texto.replace(/\s*\|\s*(null|undefined)/g, '').trim())]) {
            if (campos) paramsIndiretos.push(...campos);
          }
        }
      }

      // `p.empresaId` / `comp.id` — id do cliente que só aparece no corpo.
      if (nomesDeParam.length > 0) {
        const acesso = new RegExp(`\\b(?:${nomesDeParam.join('|')})\\.(\\w+)`, 'g');
        let a: RegExpExecArray | null;
        const corpoDoExport = semComentarios(fn.getText(sf));
        while ((a = acesso.exec(corpoDoExport)) !== null) paramsIndiretos.push(a[1]);
      }

      out.push({
        file,
        line: sf.getLineAndCharacterOfPosition(fn.getStart(sf)).line + 1,
        nome,
        corpo: corpoComDelegacao(fn, sf, locais),
        params,
        paramsIndiretos: [...new Set(paramsIndiretos)],
      });
    }
  }
  return out;
}
