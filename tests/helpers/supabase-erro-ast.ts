/**
 * Varredura da classe "`error` não checado" — E11 da auditoria 22/08.
 *
 * O supabase-js **retorna** `{ data, error }`; não lança. Então `try/catch` não
 * pega falha de banco, e o código segue com `data = null` como se fosse
 * "não encontrado". É a classe nº 1 do "NÃO fazer" do CLAUDE.md, a que mordeu
 * duas vezes no mesmo dia (27/07), e a única das oito classes com disciplina no
 * repo que não tinha guard — só testes de regressão dos sites já corrigidos.
 *
 * 🔴 SÃO DOIS DETECTORES, e o segundo é o que pega B4/B5.
 *
 * O guard que a auditoria descreveu no começo procurava `const { data } = await
 * …` — destructuring sem `error`. Mas B4 e B5, os dois achados que motivaram a
 * sprint, escreviam assim:
 *
 *     await sb.from('temporada_semana_progresso').update(payload).eq('id', id);
 *
 * sem destructuring nenhum. Um guard só com o detector A teria ficado VERDE
 * sobre exatamente os sites que a sprint estava corrigindo — e essa é a pior
 * forma de guard: o que dá cobertura ao que ele não vê.
 *
 * DETECTORES
 *  A. destructuring de resultado de query SEM `error` na lista.
 *  B. resultado de MUTAÇÃO (`insert`/`update`/`upsert`/`delete`) inteiramente
 *     ignorado — `await` como statement solto.
 *  C. `error` capturado e NUNCA lido. Destruturar sem usar é a mesma falha com
 *     aparência de conformidade — e é o que um guard ingênuo premia.
 *
 * LIMITE ASSUMIDO: é sinal de TEXTO sobre a cadeia (`.from(...)` + verbo), não
 * análise de tipos. Um wrapper que devolva `{data,error}` com outro nome não é
 * visto; uma cadeia que só parece supabase é falso positivo — e por isso a
 * allowlist existe com motivo, em vez de o predicado ser afrouxado.
 */
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import ts from 'typescript';

/** Diretórios que a auditoria mediu — o código de produção que roda por request. */
const DIRS = ['actions/', 'app/', 'lib/', 'trigger/'];

/** `.from('x')…` com verbo, ou `.rpc(`. É o sinal de "isto é uma query". */
const CADEIA_QUERY = /\.\s*from\s*\(|\.\s*rpc\s*\(/;
const VERBO_MUTACAO = /\.\s*(insert|update|upsert|delete)\s*\(/;
const VERBO_LEITURA = /\.\s*select\s*\(/;

export type TipoAchado = 'A-destructuring-sem-error' | 'B-mutacao-ignorada' | 'C-error-nao-lido';

export interface AchadoErro {
  file: string;
  line: number;
  tipo: TipoAchado;
  /** `arquivo::hash8(trecho normalizado)` — estável entre mudanças de LINHA. */
  fingerprint: string;
  trecho: string;
}

export function arquivosDeProducao(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out
      .split('\0')
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => DIRS.some((d) => f.startsWith(d)))
      .filter((f) => !f.includes('/tests/') && !f.startsWith('tests/'));
  } catch {
    return [];
  }
}

/**
 * Fingerprint = arquivo + hash do trecho NORMALIZADO (sem espaços).
 *
 * Por que não `arquivo:linha` nem contagem por arquivo: o E8 mostrou o modo de
 * falha da contagem — um arquivo com 24 sites que corrige 1 e cria 1 novo segue
 * verde, e a dívida troca de lugar sem ninguém ver. E linha muda a cada edição
 * acima do site, o que faria a allowlist inteira "mudar" num commit de formatação.
 */
function fingerprintDe(file: string, trecho: string): string {
  const normal = trecho.replace(/\s+/g, ' ').trim();
  return `${file}::${createHash('sha1').update(normal).digest('hex').slice(0, 8)}`;
}

/** Nome exportado do binding `error` numa destructuring, ou null. */
function bindingDoErro(bp: ts.ObjectBindingPattern, sf: ts.SourceFile): string | null {
  for (const el of bp.elements) {
    const origem = el.propertyName ? el.propertyName.getText(sf) : el.name.getText(sf);
    if (origem === 'error') return el.name.getText(sf);
  }
  return null;
}

/** A função (ou arquivo) que contém o nó — escopo em que procuramos o uso. */
function escopoDe(node: ts.Node): ts.Node {
  let n: ts.Node | undefined = node.parent;
  while (n) {
    if (
      ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) || ts.isSourceFile(n)
    ) return n;
    n = n.parent;
  }
  return node.getSourceFile();
}

export function varrerArquivo(file: string, src: string): AchadoErro[] {
  const achados: AchadoErro[] = [];
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const linhaDe = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const registrar = (n: ts.Node, tipo: TipoAchado, trechoBruto: string) => {
    const trecho = trechoBruto.replace(/\s+/g, ' ').slice(0, 160);
    achados.push({ file, line: linhaDe(n), tipo, fingerprint: fingerprintDe(file, trechoBruto), trecho });
  };

  const visit = (node: ts.Node): void => {
    // ── A e C: `const { … } = await <query>` ────────────────────────────────
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isAwaitExpression(node.initializer)) {
      const texto = node.initializer.getText(sf);
      if (CADEIA_QUERY.test(texto) && (VERBO_MUTACAO.test(texto) || VERBO_LEITURA.test(texto) || /\.\s*rpc\s*\(/.test(texto))) {
        if (ts.isObjectBindingPattern(node.name)) {
          const nomeErro = bindingDoErro(node.name, sf);
          if (!nomeErro) {
            registrar(node, 'A-destructuring-sem-error', node.getText(sf));
          } else {
            // C — capturou e não leu. Conta os identificadores com esse nome no
            // escopo: 1 ocorrência é a própria declaração.
            const escopo = escopoDe(node);
            let usos = 0;
            const contar = (n: ts.Node): void => {
              if (ts.isIdentifier(n) && n.text === nomeErro) usos++;
              ts.forEachChild(n, contar);
            };
            contar(escopo);
            if (usos <= 1) registrar(node, 'C-error-nao-lido', node.getText(sf));
          }
        }
      }
    }

    // ── B: mutação cujo resultado é inteiramente ignorado ───────────────────
    if (ts.isExpressionStatement(node) && ts.isAwaitExpression(node.expression)) {
      const texto = node.expression.getText(sf);
      if (CADEIA_QUERY.test(texto) && VERBO_MUTACAO.test(texto)) {
        registrar(node, 'B-mutacao-ignorada', texto);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return achados;
}

export function varrerRepo(): AchadoErro[] {
  const out: AchadoErro[] = [];
  for (const file of arquivosDeProducao()) {
    let src: string;
    try { src = readFileSync(file, 'utf-8'); } catch { continue; }
    if (!CADEIA_QUERY.test(src)) continue; // filtro barato antes do parse
    out.push(...varrerArquivo(file, src));
  }
  return out;
}
