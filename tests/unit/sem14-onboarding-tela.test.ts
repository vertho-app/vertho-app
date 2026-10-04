import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cenariosDoSlot, posicaoNoFechamento, type CenarioDoFechamento } from '@/lib/season-engine/fechamento-por-competencia';

/**
 * A tela do fechamento (`/dashboard/temporada/sem14`) no Onboarding segue o MESMO fluxo da Jornada,
 * repetido por cenário (decisão do dono, 04/10/2026): as 4 respostas do cenário se escrevem na tela e
 * vão juntas no fim (`finalizar`), depois abre a arguição DAQUELA competência (chat, como na Jornada),
 * e só então vem o cenário seguinte; ao fim do 5º, a pontuação. Retomar volta ao cenário e à etapa
 * (respondendo ou arguindo) que o servidor diz.
 *
 * A tela é um componente de cliente (hooks, fetch): o que decide a posição vive no helper puro
 * (`posicaoNoFechamento`, testado aqui e no servidor) e o resto é guard de fonte.
 * ⚠️ Nada disto substitui VER a tela de 5 cenários numa imagem: ela nunca foi vista.
 */

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const PAGINA = ler('app/dashboard/temporada/sem14/page.tsx');
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** O trecho da tela entre duas âncoras (a segunda não entra). */
const trecho = (de: string, ate: string) => {
  const i = PAGINA.indexOf(de);
  expect(i, `âncora não achada: ${de}`).toBeGreaterThan(-1);
  const k = PAGINA.indexOf(ate, i + de.length);
  expect(k, `âncora não achada: ${ate}`).toBeGreaterThan(i);
  return PAGINA.slice(i, k);
};

describe('a contagem de perguntas é a REAL do cenário, nunca um 4 escrito à mão', () => {
  const codigo = semComentarios(PAGINA);

  it('sem o 4 fixo no contador, na barra, no limite dos passos e nas respostas iniciais', () => {
    expect(codigo).not.toContain('[1, 2, 3, 4]');
    expect(codigo).not.toMatch(/\/ 4\)/);
    expect(codigo).not.toMatch(/step <= 4\b|step < 4\b/);
    expect(codigo).not.toMatch(/total: 4\b/);
    expect(codigo).not.toContain("useState(['', '', '', ''])");
    expect(codigo).toContain('const totalPerguntas = perguntas.length;');
    expect(codigo).toContain("t('alerts.allQuestions', { min: MIN_CHARS, total: totalPerguntas })");
  });

  it('a mensagem de "todas as perguntas" leva o total nos 4 idiomas (nenhum diz "4" fixo)', () => {
    for (const loc of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const m = JSON.parse(ler(`messages/${loc}.json`)).SeasonFinal;
      expect(m.alerts.allQuestions, loc).toContain('{total}');
      expect(m.alerts.allQuestions, loc).not.toMatch(/\b4\b/);
    }
  });
});

describe('os textos do Onboarding existem nos 4 idiomas', () => {
  const usadas = [...PAGINA.matchAll(/t\('scenario\.(\w+)'/g)].map((m) => m[1]);

  it('a tela usa o contador, a linha de progresso, o concluir-cenário, o aviso do anterior e os três textos da defesa', () => {
    expect([...new Set(usadas)].sort()).toEqual(['argueDone', 'argueLine', 'argueNext', 'counter', 'finish', 'previousDone', 'progressLine']);
  });

  it.each(['pt-BR', 'pt-PT', 'es-ES', 'en-US'])('%s: as chaves existem, com os parâmetros certos', (loc) => {
    const s = JSON.parse(ler(`messages/${loc}.json`)).SeasonFinal.scenario;
    expect(s.counter).toContain('{current}');
    expect(s.counter).toContain('{total}');
    expect(s.progressLine).toContain('{competency}');
    expect(s.previousDone).toContain('{done}');
    expect(s.argueLine).toContain('{current}');
    expect(s.argueLine).toContain('{total}');
    expect(s.argueLine).toContain('{competency}');
    expect(s.finish).toBeTruthy();
    expect(s.argueDone).toBeTruthy();
    expect(s.argueNext).toBeTruthy();
    expect(JSON.stringify(s)).not.toMatch(/[\u2014\u2013]/);
  });

  it('pt-BR diz "Cenário X de N" (o progresso que o dono pediu) e "Defesa oral" na arguição de cada um', () => {
    const s = JSON.parse(ler('messages/pt-BR.json')).SeasonFinal.scenario;
    expect(s.counter.replace('{current}', '2').replace('{total}', '5')).toBe('Cenário 2 de 5');
    expect(s.argueLine.replace('{current}', '2').replace('{total}', '5').replace('{competency}', 'Comunicação')).toBe('Defesa oral · Cenário 2 de 5 · Comunicação');
  });
});

describe('a tela segue o fluxo da Jornada, por cenário', () => {
  it('usa as MESMAS funções do servidor para a posição (cenariosDoSlot e posicaoNoFechamento)', () => {
    expect(PAGINA).toContain("from '@/lib/season-engine/fechamento-por-competencia'");
    expect(PAGINA).toContain('cenariosDoSlot(fb)');
    expect(PAGINA).toContain('posicaoNoFechamento(lista)');
  });

  it('as respostas do cenário vão juntas no fim, pela MESMA `finalizar` da Jornada (não uma a uma): não há envio resposta a resposta', () => {
    const finalizar = trecho('async function finalizar()', 'async function enviarArguicao');
    expect(finalizar).toContain('for (let i = respostasSalvas; i < respostas.length; i++)');
    expect(finalizar).toContain("action: 'send'");
    expect(finalizar).toContain('await aposUltimaResposta(data)');
    expect(PAGINA).not.toContain('enviarRespostaAtual');
    expect(PAGINA).not.toContain('aplicarEnvio');
    expect(PAGINA).not.toContain('respostaTravada');
    // "Próxima" só anda na tela (valida o mínimo); o botão do último passo chama `finalizar`
    expect(PAGINA).toContain('micRef.current?.stop(); finalizar();');
  });

  it('o botão do último passo diz "Concluir cenário" nos quatro primeiros cenários e "Finalizar avaliação" no último', () => {
    expect(PAGINA).toContain("multi && !ultimoCenario ? t('scenario.finish') : t('question.finish')");
  });

  it('depois da última resposta do cenário: a defesa dele abre (modo chat) ou o cenário seguinte abre (arguição desligada)', () => {
    const apos = trecho('async function aposUltimaResposta(data)', 'async function finalizar()');
    expect(apos).toContain('if (data.arguindo)');
    expect(apos).toContain('setStep(7)');
    expect(apos).toContain('if (data.proximoCenario)');
    expect(apos).toContain('abrirProximoCenario(data.cenarioIndex, data.history)');
  });

  it('a defesa de um cenário que conclui: guarda o seguinte e oferece "próximo cenário"; a do último segue para a pontuação', () => {
    const enviar = trecho('async function enviarArguicao()', 'if (error) return (');
    expect(enviar).toContain('if (data.proximoCenario)');
    expect(enviar).toContain('setArgProximo({ idx: data.cenarioIndex, history: data.history })');
    expect(enviar).toContain("data.finalizando || data.fechamento === 'avaliado'");
    expect(PAGINA).toContain('{argConcluida && argProximo ? (');
    expect(PAGINA).toContain("t('scenario.argueNext')");
    expect(PAGINA).toContain('onClick={continuarProximoCenario}');
    // o painel da pontuação só aparece com a defesa concluída e SEM cenário seguinte
    expect(PAGINA).toContain(') : argConcluida ? (');
  });

  it('o cabeçalho da defesa diz o cenário e a competência (Onboarding) e continua "Arguição" na Jornada', () => {
    expect(PAGINA).toContain("step === 7 ? (multi ? t('scenario.argueLine'");
    expect(PAGINA).toContain(": t('arguicao.badge')) : step === 6");
  });
});

describe('retomar volta ao cenário e à etapa certos (respondendo ou arguindo)', () => {
  it('o servidor diz onde a pessoa está (`fechamento_status`), e a tela abre o cenário ou a defesa dele', () => {
    const lerEstado = trecho('async function lerEstadoDoFechamento', 'async function retomarOnboarding');
    expect(lerEstado).toContain("action: 'fechamento_status'");
    const retomar = trecho('async function retomarOnboarding', 'async function retomarArguicao');
    expect(retomar).toContain("st?.estado === 'arguindo'");
    expect(retomar).toContain("st?.estado === 'respondendo'");
    expect(retomar).toContain('retomarArguicao(tid, semCB, lista, idx)');
    expect(retomar).toContain('abrirCenario(lista, idx)');
    // sem resposta do servidor, a conta local das respostas (a mesma do servidor, sem a defesa)
    expect(retomar).toContain('posicaoNoFechamento(lista)');
    // tudo feito e sem nota: o mesmo painel de pontuação da Jornada
    expect(retomar).toContain('setStep(8)');
    expect(retomar).toContain('acompanharFechamento(tid, semCB)');
  });

  it('a defesa em andamento reabre do histórico do PRÓPRIO cenário; a que não abriu é aberta por `send` sem mensagem', () => {
    const retomada = trecho('async function retomarArguicao', '/** Onboarding: o cenário `idx` abriu');
    expect(retomada).toContain('const arg = lista[idx].arguicao;');
    expect(retomada).toContain('argMsgsFromHistorico(arg.historico)');
    expect(retomada).toContain("action: 'send' }");
    expect(retomada).not.toContain('message:');
  });

  it('o slot gravado volta ao cenário e à pergunta em que a pessoa parou', () => {
    const PERGUNTAS = ['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE'].map((d) => ({ dimensao: d, texto: `p ${d}` }));
    const ENTRADA = (competencia: string, history: any[] = [], arguicao?: any): CenarioDoFechamento => ({
      competencia, cenario_b_id: null, cenario: `## ${competencia}`, perguntas: PERGUNTAS, transcript_completo: history, ...(arguicao ? { arguicao } : {}),
    });
    const respondidas = (n: number) => Array.from({ length: n }, (_, i) => [{ role: 'assistant', content: `q${i + 1}` }, { role: 'user', content: `${i + 1}` }]).flat();
    const slot = { cenarios: [ENTRADA('A', respondidas(4), { concluida: true }), ENTRADA('B', respondidas(2)), ENTRADA('C')] };
    expect(posicaoNoFechamento(cenariosDoSlot(slot)!, { arguicaoAtiva: true })).toMatchObject({ cenarioAtual: 1, perguntaAtual: 2, etapa: 'respondendo', totalRespostas: 6, totalPerguntas: 12 });
    // com a defesa do cenário A ainda aberta, a pessoa volta A (arguindo), não ao B
    const meio = { cenarios: [ENTRADA('A', respondidas(4), { concluida: false }), ENTRADA('B'), ENTRADA('C')] };
    expect(posicaoNoFechamento(cenariosDoSlot(meio)!, { arguicaoAtiva: true })).toMatchObject({ cenarioAtual: 0, etapa: 'arguindo' });
  });
});
