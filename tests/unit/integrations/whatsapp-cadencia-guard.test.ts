// Guarda ESTRUTURAL: quem publica WhatsApp em lote passa pela política de cadência.
//
// Por que este arquivo existe — medido em 11/08/2026, DUAS vezes no mesmo dia.
//
// De manhã, um broadcast de 155 professores publicado com `Upstash-Delay: idx*2s`
// (~30 msg/min) derrubou o número em 1min47s: 50 entregues, 105 não. A correção
// criou `lib/whatsapp/cadencia.ts` e consertou os dois call-sites que o commit
// enxergava — `app/admin/whatsapp/actions.ts` e `actions/whatsapp-lote.ts`.
//
// À noite, a revisão de segurança daquela correção encontrou mais TRÊS caminhos
// com o literal intacto, e o pior deles era o que ninguém olha:
//   · `lib/fase4/trigger-diario-empresa.ts` — o cron diário, 2s por mensagem,
//     rodando sozinho de madrugada. Com o fan-out, o contador é POR EMPRESA:
//     duas empresas em lambdas paralelas somam taxa no MESMO número.
//   · `app/admin/whatsapp/actions.ts::enviarMagicLinksWhatsApp` — 1,2s (~50/min,
//     o DOBRO da taxa do incidente), Z-API direto dentro da server action.
//   · `actions/fase2.ts::dispararEmails` — 2s, sem teto e sem trava de fila.
//
// A classe do bug não é "o número 2 estava errado". É que a política morava na
// CABEÇA de quem escrevia cada call-site, e um módulo central só protege quem se
// lembra de importá-lo. Enquanto esta guarda existir, um publisher novo que
// esqueça a política falha no CI em vez de falhar no número de produção.
//
// ── 11/08/2026, à noite: a guarda tinha o DENOMINADOR errado ────────────────
//
// Ela procurava a string `whatsapp-cis` — ou seja, media "quem publica na FILA".
// Quem manda em loop SÍNCRONO nunca cita essa string, e eram quatro:
//   · `actions/pulse/envio.ts` — 1,2s por convite, direto na action;
//   · `actions/automacao-envios.ts` — 1,5s, e enviando DOCUMENTO; chega ao
//     serviço pelo wrapper `enviarPDF` de `actions/whatsapp.ts`, então nem um
//     grep de `sendWhatsapp` o encontrava (são DOIS saltos);
//   · `actions/cron-jobs.ts::triggerSegunda/Quinta` — publica na fila por uma
//     função local que delega a `publicarWhatsappCis`, sem citar o webhook;
//   · `lib/conarh/regua.ts` — sem intervalo NENHUM, num cron diário.
//
// A lição não é "faltou um arquivo": é que uma guarda só prova o que ela
// consegue OLHAR, e a lista do que ela olha precisa ser derivada do jeito como
// as mensagens realmente saem — pela fila OU por chamada direta, esta última
// possivelmente através de um wrapper. Por isso os emissores agora são
// descobertos por fecho transitivo a partir de `lib/whatsapp`, não por uma
// string.
//
// Invariantes:
//   1. Todo arquivo de produção que publica no webhook `whatsapp-cis` importa a
//      política (ou é uma das duas peças centrais, declaradas abaixo).
//   2. O valor do header `Upstash-Delay` é DERIVADO da política — nunca uma
//      conta com literal (`idx * 2`), que é a forma exata do incidente.
//   3. Todo arquivo que envia WhatsApp DENTRO DE UM LOOP — direto ou pelos
//      wrappers de `actions/whatsapp.ts` — importa a política.
//   4. Ninguém dorme com literal ao lado de um envio (`setTimeout(1200)`), que
//      é a forma síncrona do mesmo bug.
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');
const DIRS = ['actions', 'lib', 'app', 'trigger'];
const IGNORAR = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

/**
 * As duas peças que NÃO importam a política porque são a infraestrutura por baixo
 * dela — e não decidem cadência nenhuma:
 *  - o webhook é o CONSUMIDOR (recebe a mensagem que já foi agendada);
 *  - `qstash-publish` é o TRANSPORTE (recebe `delaySec` pronto de quem chama).
 * Esta lista é dívida declarada: só pode encolher. Acrescentar um publisher aqui
 * para "passar o CI" é exatamente o bug que a guarda existe para pegar.
 */
const PECAS_CENTRAIS = [
  'app/api/webhooks/qstash/whatsapp-cis/route.ts',
  'lib/qstash-publish.ts',
];

/**
 * Formas aceitas de derivar o atraso — todas saem de lib/whatsapp/cadencia.
 * O sufixo (`relogioLoop`, `atrasosDoBloco`) é livre de propósito: uma função com
 * dois ramos precisa de dois relógios com nomes diferentes, e uma regex que só
 * aceitasse o nome exato empurraria para renomear a variável em vez de usar a API.
 */
const DERIVA_DA_POLITICA = /\batrasos\w*\[|\brelogio\w*\.proximo\(\)|\bdelaySec\b/i;

/**
 * Publica na fila = CHAMA o transporte ou monta o publish na mão. Citar o nome
 * do webhook num comentário não é publicar: quando o módulo da política passou a
 * explicar de onde veio o incidente, o próprio `lib/whatsapp/cadencia.ts` foi
 * acusado de não importar a si mesmo.
 */
function publicaNaFila(texto: string): boolean {
  if (/publicarWhatsappCis\s*\(/.test(texto)) return true;
  // Publish cru: só conta se for PARA o webhook de WhatsApp. `actions/lead-comercial.ts`
  // e `app/radar/actions.ts` também usam `/v2/publish/`, mas para gerar artefato e
  // PDF — cobrar cadência de WhatsApp deles seria acusar quem não manda mensagem.
  const publishCru = /\/v2\/publish\/|['"]Upstash-Delay['"]\s*:/.test(texto);
  return publishCru && texto.includes('whatsapp-cis');
}

function varrer(dir: string, saida: string[] = []): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return saida;
  }
  for (const entrada of entradas) {
    if (IGNORAR.has(entrada)) continue;
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) varrer(caminho, saida);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entrada)) saida.push(caminho);
  }
  return saida;
}

// Varre o DIRETÓRIO, não `git ls-files`: um publisher novo nasce untracked, e é
// justamente nessa janela que ele é escrito copiando o vizinho — com literal e tudo.
const ARQUIVOS = DIRS.flatMap((d) => varrer(join(RAIZ, d))).map((caminho) => ({
  rel: relative(RAIZ, caminho).split(sep).join('/'),
  texto: readFileSync(caminho, 'utf8'),
}));

/**
 * Emissores por FECHO TRANSITIVO: quem chama `sendWhatsapp` direto, mais quem
 * chama os wrappers de `actions/whatsapp.ts` (`enviarWhatsApp`, `enviarPDF`,
 * `enviarAudio`, `enviarLink`) — que são só uma casca sobre o mesmo serviço.
 *
 * Sem o segundo salto, `actions/automacao-envios.ts` some da conta: ele manda
 * documento a cada 1,5s e não contém a palavra `sendWhatsapp` em lugar nenhum.
 */
const WRAPPERS = ['enviarWhatsApp', 'enviarPDF', 'enviarAudio', 'enviarLink'];
const IMPORTA_WRAPPER = new RegExp(
  `from ['"](@/actions/whatsapp|\\./whatsapp)['"]`,
);

function emiteWhatsapp(a: { rel: string; texto: string }): boolean {
  if (a.rel.startsWith('lib/whatsapp/')) return false;          // o serviço em si
  if (a.texto.includes('sendWhatsapp(')) return true;
  return IMPORTA_WRAPPER.test(a.texto) && WRAPPERS.some((w) => a.texto.includes(`${w}(`));
}

/**
 * O envio está DENTRO de um loop? Por AST, não por regex.
 *
 * A primeira versão desta guarda perguntava "o arquivo contém um `for`?" e
 * acusou `actions/lead-comercial.ts` e `lib/notify-tutor.ts` — os dois mandam
 * UMA mensagem, e o loop era de outra coisa (montar linhas de texto). Guarda que
 * acusa inocente não sobrevive: ou ganha allowlist — e allowlist é onde o bug
 * volta a morar — ou alguém a desliga. Perguntar pela POSIÇÃO da chamada na
 * árvore é o que separa "manda em rajada" de "tem um for no arquivo".
 */
function enviaDentroDeLoop(rel: string, texto: string): boolean {
  const sf = ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true);
  const ITERACAO = new Set([
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.DoStatement,
  ]);
  const ITERADORES = new Set(['forEach', 'map', 'flatMap', 'filter', 'reduce']);

  let achou = false;
  const visitar = (no: ts.Node, dentroDeLoop: boolean) => {
    if (achou) return;
    let loopAgora = dentroDeLoop;
    if (ITERACAO.has(no.kind)) loopAgora = true;
    if (ts.isCallExpression(no)) {
      const alvo = no.expression;
      const nome = ts.isPropertyAccessExpression(alvo) ? alvo.name.text
        : ts.isIdentifier(alvo) ? alvo.text : '';
      // `xs.map(cb)` / `xs.forEach(cb)`: o corpo do callback É o corpo do loop.
      if (ITERADORES.has(nome) && ts.isPropertyAccessExpression(alvo)) {
        no.arguments.forEach((arg) => visitar(arg, true));
        visitar(alvo.expression, loopAgora);
        return;
      }
      if ((nome === 'sendWhatsapp' || WRAPPERS.includes(nome)) && loopAgora) {
        achou = true;
        return;
      }
    }
    no.forEachChild((f) => visitar(f, loopAgora));
  };
  visitar(sf, false);
  return achou;
}

describe('WhatsApp · a cadência do lote é política, não literal', () => {
  it('há arquivos para varrer (a guarda não pode passar por varrer zero)', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(100);
  });

  it('encontra os publishers conhecidos (o denominador existe)', () => {
    const publishers = ARQUIVOS.filter((a) => publicaNaFila(a.texto)).map((a) => a.rel);
    // Se este número cair, ou alguém removeu um caminho de envio (ótimo, mas
    // intencional?) ou a varredura parou de enxergar — e uma guarda que varre
    // zero passa verde para sempre.
    expect(publishers.length).toBeGreaterThanOrEqual(6);
  });

  it('todo publisher do webhook importa a política de cadência', () => {
    const infratores = ARQUIVOS
      .filter((a) => publicaNaFila(a.texto))
      .filter((a) => !PECAS_CENTRAIS.includes(a.rel))
      .filter((a) => !a.texto.includes('@/lib/whatsapp/cadencia'))
      .map((a) => a.rel);

    expect(
      infratores,
      `Publisher de WhatsApp em lote sem a política de cadência.\n` +
        `Um módulo central só protege quem se lembra de importá-lo: em 11/08/2026 a\n` +
        `correção do bloqueio cobriu 2 call-sites e deixou 3 com o literal — inclusive\n` +
        `o cron diário, que dispara sozinho.\n` +
        `Use criarRelogioCadencia() (loop de tamanho desconhecido) ou\n` +
        `atrasosDoLote()+aplicarTetoLote() (lista conhecida).\n` +
        `Infratores: ${infratores.join(', ')}`,
    ).toEqual([]);
  });

  it('encontra os emissores diretos (o denominador do 2º salto existe)', () => {
    const emissores = ARQUIVOS.filter(emiteWhatsapp).map((a) => a.rel);
    // Prova que o fecho transitivo enxerga o caso que motivou a mudança: um
    // arquivo que só fala com o wrapper. Se ele sumir daqui, a varredura
    // regrediu para o grep de uma string só.
    expect(emissores).toContain('actions/automacao-envios.ts');
    expect(emissores.length).toBeGreaterThanOrEqual(8);
  });

  it('quem envia WhatsApp dentro de um loop importa a política de cadência', () => {
    const infratores = ARQUIVOS
      .filter(emiteWhatsapp)
      .filter((a) => enviaDentroDeLoop(a.rel, a.texto))
      .filter((a) => !a.texto.includes('@/lib/whatsapp/cadencia'))
      .map((a) => a.rel);

    expect(
      infratores,
      `Envio de WhatsApp em loop sem a política de cadência.\n` +
        `Use criarPaceadorSincrono() (loop síncrono) ou publique na fila com\n` +
        `atrasosDoLote()/criarRelogioCadencia(). Em 11/08/2026 quatro caminhos\n` +
        `mandavam em rajada — de 1,2s a intervalo NENHUM — e a guarda não os via\n` +
        `porque procurava a string 'whatsapp-cis'.\n` +
        `Infratores: ${infratores.join(', ')}`,
    ).toEqual([]);
  });

  it('não há sleep com literal ao lado de um envio de WhatsApp', () => {
    const DORME_COM_LITERAL = /(setTimeout\(\s*[^,]*,\s*\d{3,}|\b(?:delay|sleep|dormir)\(\s*\d{3,}\s*\))/;
    const infratores = ARQUIVOS
      .filter(emiteWhatsapp)
      .filter((a) => DORME_COM_LITERAL.test(a.texto))
      .map((a) => a.rel);

    expect(
      infratores,
      `Intervalo de envio escrito à mão (setTimeout/delay com número literal).\n` +
        `A forma síncrona do incidente foi exatamente esta: \`setTimeout(r, 1200)\`\n` +
        `entre dois sendWhatsapp. O intervalo tem que vir de lib/whatsapp/cadencia.\n` +
        `Infratores: ${infratores.join(', ')}`,
    ).toEqual([]);
  });

  it('o valor de Upstash-Delay vem da política, nunca de uma conta com literal', () => {
    const infratores: string[] = [];
    for (const a of ARQUIVOS) {
      for (const linha of a.texto.split('\n')) {
        if (!/['"]Upstash-Delay['"]\s*:/.test(linha)) continue;
        if (DERIVA_DA_POLITICA.test(linha)) continue;
        infratores.push(`${a.rel} → ${linha.trim()}`);
      }
    }

    expect(
      infratores,
      `Atraso escrito à mão no header. A forma do incidente de 11/08/2026 foi\n` +
        `exatamente esta: \`'Upstash-Delay': \${idx * 2}s\`. O valor tem que sair de\n` +
        `atrasos[i] / relogio.proximo() / do parâmetro delaySec de quem já recebeu\n` +
        `o atraso pronto.\n` +
        `Infratores:\n${infratores.join('\n')}`,
    ).toEqual([]);
  });
});
