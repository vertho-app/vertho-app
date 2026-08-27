/**
 * Roda a conversa de Evidências INTEIRA contra a IA real e responde a única
 * pergunta que teste estático não responde: **a última fala fecha?**
 *
 * POR QUE ELE EXISTE
 * ──────────────────
 * O defeito de 27/08/2026 era invisível para a suíte: cada peça estava correta
 * e o que falhava era a composição. `finished` saía por contagem, e em 63 das
 * 86 conversas de Evidências concluídas a IA foi cortada em cima de uma
 * pergunta. Guard prova que o código chama o prompt certo; só rodar a conversa
 * prova o que a pessoa lê no fim dela.
 *
 * NÃO TOCA NO BANCO. Trilha, colaborador e desafios vêm de argumento/fixture;
 * o "colaborador" é a mesma IA respondendo com um papel. Por isso ele não entra
 * na conta do service-role-guard e pode rodar apontando para qualquer tenant.
 *
 * ⚠️ O QUE ELE **NÃO** PROVA: que a rota se comporta assim. Ele exercita o
 * prompt e a régua (`pareceFechamento`), não o handler HTTP. O contrato da rota
 * fica travado em `tests/unit/conversa-fechamento.test.ts`.
 *
 * USO
 *   npx tsx scripts/_verificar-fechamento-conversa.ts [--cenario=todos] [--repeticoes=1]
 *
 *   --cenario=uma-tarefa       1 tarefa, 1 assunto  (jornada com kit de um descritor)
 *   --cenario=dois-assuntos    1 tarefa, 2 assuntos (o caso dominante hoje)
 *   --cenario=duas-tarefas     2 tarefas, 2 competências (regular_duo)
 *   --cenario=todos            os três (default)
 *
 *   --forcar-rede              descarta o turno 6 gerado e injeta a fala real
 *                              que motivou a correção, para EXERCITAR a segunda
 *                              chamada. Sem isso o ramo raro só roda em produção.
 */
process.loadEnvFile('.env.local');

import { callAI, callAIChat } from '../actions/ai-client';
import { promptSocratic } from '../lib/season-engine/prompts/socratic';
import { pareceFechamento, reforcoDeFechamento } from '../lib/season-engine/fechamento-conversa';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const cenarioAlvo = arg('cenario') || 'todos';
const repeticoes = Number(arg('repeticoes') || 1);
const forcarRede = args.includes('--forcar-rede');
const auditarCriterio = args.includes('--auditar-criterio');

const MAX_IA = 6;

interface Cenario {
  nome: string;
  descritoresCobertos: string[];
  desafios: { competencia: string; desafio_texto: string; criterio_de_execucao?: string }[];
}

/**
 * ⚠️ Os cenários trazem `criterio_de_execucao` desde 27/08: ele passou a
 * alimentar o prompt (era escrito, exibido e nunca chegava a quem cobra). Sem
 * ele aqui, este script exercitaria um prompt que produção não usa mais — e o
 * `--auditar-criterio` não teria o que medir.
 */
const CENARIOS: Record<string, Cenario> = {
  'uma-tarefa': {
    nome: 'uma-tarefa',
    descritoresCobertos: ['COO03_D6 — Busca de apoio e rede'],
    desafios: [{
      competencia: 'Gestão de Pessoas',
      desafio_texto: 'Escolha uma situação da semana em que você precisou de apoio de alguém da equipe. Peça esse apoio de forma explícita, dizendo o que você precisa e por quê, e anote como a pessoa respondeu.',
      criterio_de_execucao: 'A pessoa consegue dizer a quem pediu apoio, com que palavras formulou o pedido, e o que a outra pessoa respondeu — não só que "conversou com a equipe".',
    }],
  },
  'dois-assuntos': {
    nome: 'dois-assuntos',
    descritoresCobertos: ['COO03_D6 — Busca de apoio e rede', 'COO03_D7 — Sustentação do combinado'],
    desafios: [{
      competencia: 'Gestão de Pessoas',
      desafio_texto: 'Escolha um combinado que a equipe não vem cumprindo. Retome o combinado com a pessoa envolvida, registre por escrito o que ficou acertado e observe o que acontece na semana seguinte.',
      criterio_de_execucao: 'A pessoa consegue nomear quem estava envolvido, dizer o que ficou acertado e até quando, e contar o que aconteceu depois — inclusive se nada mudou.',
    }],
  },
  'duas-tarefas': {
    nome: 'duas-tarefas',
    descritoresCobertos: ['COO03_D6 — Busca de apoio e rede', 'AVA02_D3 — Leitura integrada de indicadores'],
    desafios: [
      {
        competencia: 'Gestão de Pessoas',
        desafio_texto: 'Retome um combinado que a equipe não vem cumprindo e registre por escrito o que ficou acertado.',
        criterio_de_execucao: 'A pessoa consegue nomear quem estava envolvido e o que ficou acertado, com prazo.',
      },
      {
        competencia: 'Avaliação e monitoramento de resultados',
        desafio_texto: 'Compare duas turmas com desempenho parecido na avaliação externa, cruzando matrícula, frequência e fluxo, e registre o que o cruzamento revelou.',
        criterio_de_execucao: 'A pessoa consegue dizer quais foram as duas turmas, qual diferença o cruzamento revelou, e o que o indicador isolado escondia.',
      },
    ],
  },
};

const PAPEL_COLAB = `Você está SIMULANDO um colaborador numa conversa de reflexão semanal.

Você é coordenador(a) pedagógico(a) de uma escola pública. Responda em 1ª pessoa,
em português do Brasil informal, com 2 a 4 frases. Traga situações concretas do
dia a dia da escola, mas seja realista: nem toda resposta é bem articulada, e às
vezes você não fez tudo o que o desafio pedia. NUNCA faça perguntas de volta e
NUNCA saia do papel.`;

/**
 * `--forcar-rede` descarta o turno 6 que a IA produziu e o troca pela fala
 * REAL que motivou esta correção (a do print de 27/08, uma pergunta). Sem isso
 * o caminho da segunda chamada nunca é percorrido nas rodadas boas — e ramo
 * raro que só roda em produção é ramo que quebra no usuário.
 */
const TURNO_CORTADO_REAL = 'Entendo. E quando isso acontece — você com o registro em mãos, ela ciente do acordo — o que você percebe que ainda falta pra que o combinado de fato se sustente?';

async function rodarConversa(c: Cenario): Promise<{ turnos: string[]; fechou: boolean; precisouDeRede: boolean; historico: { role: string; content: string }[] }> {
  const base = {
    nomeColab: 'Marina',
    cargo: 'Coordenadora Pedagógica',
    perfilDominante: 'SC',
    competencia: c.desafios.map((d) => d.competencia).join(' + '),
    descritor: c.descritoresCobertos[0],
    desafio: c.desafios.map((d) => d.desafio_texto).join('\n'),
    desafios: c.desafios,
    descritoresCobertos: c.descritoresCobertos,
  };

  const historico: { role: string; content: string }[] = [];
  const turnos: string[] = [];

  for (let turnIA = 1; turnIA <= MAX_IA; turnIA++) {
    const p = promptSocratic({ ...base, historico, turnIA });
    const messages = p.messages.length ? p.messages : [{ role: 'user', content: '[INICIE]' }];
    const fala = (await callAIChat(p.system, messages as any, {}, 2000, { taskKey: 'evidencias_socratic', systemSuffix: p.systemSuffix })).trim();
    historico.push({ role: 'assistant', content: fala });
    turnos.push(fala);

    if (turnIA >= MAX_IA) break;

    const resposta = (await callAI(
      PAPEL_COLAB,
      `DESAFIO(S) DA SEMANA:\n${base.desafio}\n\nCONVERSA ATÉ AQUI:\n${historico.map((m) => `${m.role === 'user' ? 'EU' : 'MENTOR'}: ${m.content}`).join('\n\n')}\n\nResponda à última fala do mentor.`,
      {}, 800, { taskKey: 'sim_aluno' },
    )).trim();
    historico.push({ role: 'user', content: resposta });
  }

  if (forcarRede) {
    turnos[turnos.length - 1] = TURNO_CORTADO_REAL;
    historico[historico.length - 1] = { role: 'assistant', content: TURNO_CORTADO_REAL };
  }

  // A rede de segurança, exatamente como a rota a aplica.
  let ultima = turnos[turnos.length - 1];
  let precisouDeRede = false;
  if (!pareceFechamento(ultima)) {
    precisouDeRede = true;
    const p = promptSocratic({ ...base, historico: historico.slice(0, -1), turnIA: MAX_IA });
    const forcado = (await callAIChat(p.system, p.messages as any, {}, 2000, {
      taskKey: 'evidencias_socratic',
      systemSuffix: reforcoDeFechamento((p as any).fechamentoSuffix),
    })).trim();
    if (forcado && pareceFechamento(forcado)) {
      ultima = forcado;
      turnos[turnos.length - 1] = forcado;
    }
  }

  return { turnos, fechou: pareceFechamento(ultima), precisouDeRede, historico };
}

/**
 * O critério vazou para a conversa?
 *
 * DETERMINÍSTICO de propósito. "A IA leu a régua em voz alta" é exatamente o
 * tipo de pergunta que um juiz-IA responde com complacência, e aqui dá para
 * medir: se uma sequência longa de palavras do critério aparece literalmente
 * numa fala, ele foi recitado. Usa 6-gramas — trecho curto pode coincidir por
 * acaso ("a pessoa consegue dizer"), seis palavras seguidas não.
 */
function criterioVazou(criterios: string[], falasIA: string[]): string[] {
  // ⚠️ O TURNO DE FECHAMENTO FICA DE FORA, e isso não é indulgência.
  // Ele resume o combinado e propõe o compromisso da próxima semana — ecoar a
  // fraseologia da tarefa ali é a função dele. Medido em 27/08: o único
  // "vazamento" das 9 conversas auditadas era o compromisso dizendo
  // "registrando o que ficou acertado e até quando", com o critério escrito na
  // mesma linguagem natural do domínio. Contar isso como recitação transformaria
  // a métrica em alarme que ninguém lê — o detector diria 1/9 e o certo era 0/9.
  const perguntas = falasIA.slice(0, -1);
  falasIA = perguntas.length ? perguntas : falasIA;
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const corpo = norm(falasIA.join(' \n '));
  const achados: string[] = [];
  for (const c of criterios) {
    const p = norm(c).split(' ');
    for (let i = 0; i + 6 <= p.length; i++) {
      const trecho = p.slice(i, i + 6).join(' ');
      if (corpo.includes(trecho)) { achados.push(trecho); break; }
    }
  }
  return achados;
}

/** A conversa colheu o que o critério pede? Aqui um juiz cabe — é leitura de conteúdo. */
async function auditarCobertura(criterios: string[], historico: { role: string; content: string }[]): Promise<string> {
  const transcript = historico.map((m) => `${m.role === 'user' ? 'COLAB' : 'MENTOR'}: ${m.content}`).join('\n\n');
  return (await callAI(
    `Você audita uma conversa de reflexão semanal. Seja SEVERO: o risco é dizer que a conversa colheu algo que ela não colheu.

Para CADA item da régua, responda se a conversa efetivamente trouxe aquilo do colaborador. Cite o trecho que sustenta, ou diga que não veio.

Formato:
- <item da régua> → COLHEU: "<trecho>" | NÃO COLHEU
No fim: uma linha "VEREDITO: <n>/<total> colhidos".`,
    `RÉGUA (o que a tarefa exigia que a pessoa conseguisse contar):\n${criterios.map((c) => `- ${c}`).join('\n')}\n\nCONVERSA:\n${transcript}`,
    {}, 1200, { taskKey: 'evidencias_socratic' },
  )).trim();
}

/**
 * O detector consegue detectar?
 *
 * Sem isto, "a régua foi recitada em 0/N" é um número que não pode subir — e um
 * check que não pode falhar não é verificação, é decoração. Já aconteceu nesta
 * mesma rodada: um bloco que não foi inserido imprimiu "0/1" com o contador
 * nunca sendo incrementado, e o número parecia uma boa notícia.
 */
function autotestarDetector(): void {
  const criterio = 'A pessoa consegue nomear quem estava envolvido, dizer o que ficou acertado e até quando';
  // O último item de cada lista é o turno de FECHAMENTO, que o detector ignora.
  const recitando = ['Só pra confirmar: a pessoa consegue nomear quem estava envolvido, dizer o que ficou acertado e até quando?', '(fechamento)'];
  const natural = ['E quem estava junto nessa conversa? O que vocês combinaram ali?', '(fechamento)'];
  // O caso REAL que gerou o falso positivo de 27/08: o compromisso ecoando a
  // fraseologia da tarefa. É legítimo, e não pode contar como recitação.
  const fechamentoEcoando = [
    'E quem estava junto nessa conversa?',
    '🎯 **Compromisso**: levar algo por escrito registrando o que ficou acertado e até quando.',
  ];
  if (criterioVazou([criterio], recitando).length === 0) {
    throw new Error('autoteste: o detector NÃO viu uma recitação literal — ele está quebrado, e "0 recitadas" seria mentira');
  }
  if (criterioVazou([criterio], natural).length > 0) {
    throw new Error('autoteste: o detector acusou uma pergunta natural — falso positivo tornaria o número inútil');
  }
  if (criterioVazou([criterio], fechamentoEcoando).length > 0) {
    throw new Error('autoteste: o detector acusou o FECHAMENTO ecoando o combinado — é a função dele, não recitação');
  }
}

async function main() {
  const alvos = cenarioAlvo === 'todos' ? Object.values(CENARIOS) : [CENARIOS[cenarioAlvo]];
  if (alvos.some((a) => !a)) throw new Error(`--cenario desconhecido: ${cenarioAlvo}`);
  if (auditarCriterio) { autotestarDetector(); console.log('autoteste do detector de recitação: ok (vê recitação, ignora pergunta natural)\n'); }

  let total = 0, fecharam = 0, usaramRede = 0, recitou = 0;

  for (const c of alvos) {
    for (let i = 1; i <= repeticoes; i++) {
      const r = await rodarConversa(c);
      total++;
      if (r.fechou) fecharam++;
      if (r.precisouDeRede) usaramRede++;

      console.log(`\n${'═'.repeat(72)}`);
      console.log(`CENÁRIO ${c.nome}${repeticoes > 1 ? ` (${i}/${repeticoes})` : ''}`);
      console.log('═'.repeat(72));
      r.turnos.forEach((t, idx) => {
        console.log(`\n── turno ${idx + 1} ${'─'.repeat(56)}`);
        console.log(t);
      });
      console.log(`\n${'·'.repeat(72)}`);
      console.log(`fechou: ${r.fechou ? 'SIM' : 'NÃO'}   rede de segurança: ${r.precisouDeRede ? 'PRECISOU' : 'não'}`);

      if (auditarCriterio) {
        const criterios = c.desafios.map((d) => d.criterio_de_execucao).filter(Boolean) as string[];
        const vazou = criterioVazou(criterios, r.turnos);
        if (vazou.length) {
          recitou++;
          console.log(`⚠️  A IA RECITOU a régua: ${vazou.map((v) => `"…${v}…"`).join(' | ')}`);
        } else {
          console.log('régua NUNCA recitada literalmente — ok');
        }
        console.log(`\n${await auditarCobertura(criterios, r.historico)}`);
      }
    }
  }

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`RESULTADO: ${fecharam}/${total} conversas terminaram com fechamento.`);
  console.log(`A rede de segurança foi acionada em ${usaramRede}/${total}.`);
  if (auditarCriterio) console.log(`A régua foi recitada em ${recitou}/${total} (o esperado é ZERO).`);
  console.log('Antes da correção, a medição em produção era 23 de 86 (27%).');
  if (fecharam < total) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
