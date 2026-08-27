// Guarda ESTRUTURAL: no cron diário, TODO envio de WhatsApp passa pelo porteiro
// de volume — pelo caminho do template ou pelo da fila, tanto faz.
//
// ── POR QUE ESTE ARQUIVO EXISTE (26/08/2026) ────────────────────────────────
//
// A trava de volume (`maxPorDisparo()`, 120 por disparo) e a trava de fila suja
// moravam DENTRO de `agendarWhatsapp`, o enfileirador. Isso valia enquanto a
// cadência mandava por texto livre pela fila do QStash.
//
// Quando o canal virou template da Cloud API, `enviarPorTemplate` passou a
// devolver `tentou: true` e o `else` que chama o enfileirador deixou de ser
// alcançado. Medido no dia em que isto foi escrito: **615 de 615** mensagens de
// `origem='cadencia'` nos últimos 30 dias saíram por template, ZERO pela fila.
// A trava seguia no código, seguia importada, e não governava mensagem nenhuma.
//
// 🔴 E a guarda que existia — `whatsapp-cadencia-guard` — ficou VERDE o tempo
// todo, com razão: ela mede quem IMPORTA a política, e o arquivo importava. A
// classe do defeito não é "esqueceram de importar", é **ramo novo que contorna a
// trava dentro de um arquivo que já a importa**. Uma guarda de import é cega
// para isso por construção; é preciso olhar o CALL-SITE.
//
// Sintoma que teria aparecido: nenhum, até o dia de uma coorte grande — quando
// as mensagens sairiam todas em rajada, sem teto, contra o número de produção.
// Em 20/08, com 74 pessoas, foram 36 mensagens em 24,1s (gap médio 0,69s): dentro
// do que a Cloud API aguenta, e exatamente por isso invisível.
//
// A invariante: toda chamada de envio de WhatsApp neste arquivo está sob um `if`
// guardado por uma variável que veio de `vagaWhatsapp()`.
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ARQUIVO = 'lib/fase4/trigger-diario-empresa.ts';
const CAMINHO = join(__dirname, '..', '..', '..', ARQUIVO);
const TEXTO = readFileSync(CAMINHO, 'utf8');
const FONTE = ts.createSourceFile(ARQUIVO, TEXTO, ts.ScriptTarget.Latest, true);

/** Funções que colocam uma mensagem de WhatsApp na rua, por qualquer caminho. */
const ENVIOS = ['enviarPorTemplate', 'enviarPilulaPorTemplate', 'agendarWhatsapp'];

const PORTEIRO = 'vagaWhatsapp';

function nomeChamado(no: ts.CallExpression): string | null {
  const alvo = no.expression;
  if (ts.isIdentifier(alvo)) return alvo.text;
  if (ts.isPropertyAccessExpression(alvo)) return alvo.name.text;
  return null;
}

function percorrer(no: ts.Node, visitar: (n: ts.Node) => void) {
  visitar(no);
  no.forEachChild((f) => percorrer(f, visitar));
}

/** Variáveis inicializadas com `vagaWhatsapp()` — os porteiros declarados. */
const VARS_PORTEIRO = new Set<string>();
percorrer(FONTE, (no) => {
  if (!ts.isVariableDeclaration(no) || !no.initializer || !ts.isIdentifier(no.name)) return;
  if (no.initializer.getText(FONTE).includes(`${PORTEIRO}()`)) VARS_PORTEIRO.add(no.name.text);
});

/** A chamada está dentro do ramo `then` de um `if` que testa um porteiro? */
function guardadoPorPorteiro(chamada: ts.Node): boolean {
  let filho: ts.Node = chamada;
  let pai = chamada.parent;
  while (pai) {
    if (ts.isIfStatement(pai) && ehDescendente(pai.thenStatement, filho)) {
      const cond = pai.expression.getText(FONTE);
      // A condição tem que MENCIONAR um porteiro. Basta um `if` na cadeia: os
      // blocos aninham (try dentro do if, if/else dentro do try).
      for (const v of VARS_PORTEIRO) {
        if (new RegExp(`\\b${v}\\b`).test(cond)) return true;
      }
    }
    filho = pai;
    pai = pai.parent;
  }
  return false;
}

function ehDescendente(raiz: ts.Node, alvo: ts.Node): boolean {
  if (raiz === alvo) return true;
  let achou = false;
  raiz.forEachChild((f) => { if (!achou) achou = ehDescendente(f, alvo); });
  return achou;
}

const CHAMADAS: { nome: string; linha: number; guardada: boolean; args: number }[] = [];
percorrer(FONTE, (no) => {
  if (!ts.isCallExpression(no)) return;
  const nome = nomeChamado(no);
  if (!nome || !ENVIOS.includes(nome)) return;
  const { line } = FONTE.getLineAndCharacterOfPosition(no.getStart(FONTE));
  CHAMADAS.push({ nome, linha: line + 1, guardada: guardadoPorPorteiro(no), args: no.arguments.length });
});

describe('trigger diário — a trava de volume cobre os DOIS caminhos', () => {
  // Denominador explícito: uma guarda que varre zero call-sites passa por
  // vacuidade, e é assim que ela vira decorativa depois de um refactor que
  // renomeie as funções de envio.
  it('encontra os call-sites de envio (senão a guarda não está olhando nada)', () => {
    expect(CHAMADAS.length).toBeGreaterThanOrEqual(5);
    // Os dois caminhos têm que estar representados: se o legado sumir da conta,
    // a guarda deixou de cobrir metade do problema sem ninguém notar.
    expect(CHAMADAS.some((c) => c.nome === 'agendarWhatsapp')).toBe(true);
    expect(CHAMADAS.some((c) => c.nome !== 'agendarWhatsapp')).toBe(true);
  });

  it('o porteiro existe e consulta as DUAS travas (fila suja e teto)', () => {
    const corpo = TEXTO.slice(TEXTO.indexOf(`const ${PORTEIRO}`));
    const decl = corpo.slice(0, corpo.indexOf('};') + 2);
    expect(decl).toContain('canalWhatsappAtivo');
    expect(decl).toContain('tetoAtingido()');
    // Adia, não descarta: o contador de adiados é o que torna o corte visível
    // no pós-voo em vez de virar silêncio.
    expect(decl).toContain('adiadosPorTeto++');
  });

  it('TODA chamada de envio está sob a guarda de um porteiro', () => {
    const soltas = CHAMADAS.filter((c) => !c.guardada)
      .map((c) => `${c.nome} (linha ${c.linha})`);
    expect(soltas).toEqual([]);
  });

  it('o enfileirador recebe o atraso do porteiro — não o calcula por conta', () => {
    // 2 argumentos = payload + atraso. Com 1, ele voltaria a chamar
    // `relogio.proximo()` internamente e consumiria uma segunda vaga.
    const comUmArg = CHAMADAS.filter((c) => c.nome === 'agendarWhatsapp' && c.args !== 2)
      .map((c) => `linha ${c.linha}: ${c.args} argumento(s)`);
    expect(comUmArg).toEqual([]);
  });

  it('nenhum ramo consulta o relógio por fora do porteiro', () => {
    // `relogio.proximo()` fora de `vagaWhatsapp` consumiria vaga sem passar pelo
    // teto — a forma exata do bug que esta guarda fecha, só que ao contrário.
    const usos = [...TEXTO.matchAll(/relogio\.proximo\(\)/g)].length;
    expect(usos).toBe(1);
  });
});
