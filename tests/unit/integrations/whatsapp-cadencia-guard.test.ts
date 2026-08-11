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
// Invariantes:
//   1. Todo arquivo de produção que publica no webhook `whatsapp-cis` importa a
//      política (ou é uma das duas peças centrais, declaradas abaixo).
//   2. O valor do header `Upstash-Delay` é DERIVADO da política — nunca uma
//      conta com literal (`idx * 2`), que é a forma exata do incidente.
import { describe, expect, it } from 'vitest';
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

describe('WhatsApp · a cadência do lote é política, não literal', () => {
  it('há arquivos para varrer (a guarda não pode passar por varrer zero)', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(100);
  });

  it('encontra os publishers conhecidos (o denominador existe)', () => {
    const publishers = ARQUIVOS.filter((a) => a.texto.includes('whatsapp-cis')).map((a) => a.rel);
    // Se este número cair, ou alguém removeu um caminho de envio (ótimo, mas
    // intencional?) ou a varredura parou de enxergar — e uma guarda que varre
    // zero passa verde para sempre.
    expect(publishers.length).toBeGreaterThanOrEqual(6);
  });

  it('todo publisher do webhook importa a política de cadência', () => {
    const infratores = ARQUIVOS
      .filter((a) => a.texto.includes('whatsapp-cis'))
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
