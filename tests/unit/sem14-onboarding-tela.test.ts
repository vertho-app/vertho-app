import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aplicarEnvio, cenariosDoSlot, posicaoNoFechamento, type CenarioDoFechamento } from '@/lib/season-engine/fechamento-por-competencia';

/**
 * A tela do fechamento (`/dashboard/temporada/sem14`) no Onboarding: UM cenário por vez, com o
 * nome da competência e o progresso "cenário X de 5", 4 perguntas cada, retomando na pergunta
 * em que a pessoa parou. A tela é um componente de cliente (hooks, fetch): o que ela decide a
 * cada resposta do servidor vive em `aplicarEnvio` (puro, testado aqui) e o resto é guard de
 * fonte. ⚠️ Nada disto substitui VER a tela de 5 cenários numa imagem: ela nunca foi vista.
 */

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const PAGINA = ler('app/dashboard/temporada/sem14/page.tsx');
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

  it('a tela usa o contador, a linha de progresso, o concluir-cenário e o aviso do anterior', () => {
    expect([...new Set(usadas)].sort()).toEqual(['counter', 'finish', 'previousDone', 'progressLine']);
  });

  it.each(['pt-BR', 'pt-PT', 'es-ES', 'en-US'])('%s: as quatro chaves existem, com os parâmetros certos', (loc) => {
    const s = JSON.parse(ler(`messages/${loc}.json`)).SeasonFinal.scenario;
    expect(s.counter).toContain('{current}');
    expect(s.counter).toContain('{total}');
    expect(s.progressLine).toContain('{competency}');
    expect(s.previousDone).toContain('{done}');
    expect(s.finish).toBeTruthy();
    expect(JSON.stringify(s)).not.toMatch(/[\u2014\u2013]/);
  });

  it('pt-BR diz "Cenário X de N" (o progresso que o dono pediu)', () => {
    const s = JSON.parse(ler('messages/pt-BR.json')).SeasonFinal.scenario;
    expect(s.counter.replace('{current}', '2').replace('{total}', '5')).toBe('Cenário 2 de 5');
  });
});

describe('a tela lê o slot dos 5 cenários e envia cada resposta na hora', () => {
  it('usa as MESMAS funções do servidor para a posição (cenariosDoSlot e posicaoNoFechamento)', () => {
    expect(PAGINA).toContain("from '@/lib/season-engine/fechamento-por-competencia'");
    expect(PAGINA).toContain('cenariosDoSlot(fb)');
    expect(PAGINA).toContain('posicaoNoFechamento(lista)');
  });

  it('cada resposta é enviada ao clicar (action send) e a já enviada fica só para leitura', () => {
    const envio = PAGINA.slice(PAGINA.indexOf('async function enviarRespostaAtual'), PAGINA.indexOf('async function finalizar()'));
    expect(envio).toContain("action: 'send'");
    expect(envio).toContain('aplicarEnvio(cenarios, idxCenario, resposta, data)');
    expect(envio).toContain('if (i < respostasSalvas)');
    expect(PAGINA).toContain('const respostaTravada = multi && step >= 1 && step - 1 < respostasSalvas;');
  });

  it('o cenário único segue enviando as respostas em sequência no fim (a Jornada não muda)', () => {
    const finalizar = PAGINA.slice(PAGINA.indexOf('async function finalizar()'), PAGINA.indexOf('async function enviarArguicao'));
    expect(finalizar).toContain('for (let i = respostasSalvas; i < respostas.length; i++)');
    expect(finalizar).toContain("action: 'send'");
    expect(PAGINA).toContain('{multi ? (');
  });
});

describe('aplicarEnvio: o que a tela faz com a resposta do servidor', () => {
  const PERGUNTAS = ['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE'].map((d) => ({ dimensao: d, texto: `p ${d}` }));
  const ENTRADA = (competencia: string, history: any[] = []): CenarioDoFechamento => ({
    competencia, cenario_b_id: null, cenario: `## ${competencia}`, perguntas: PERGUNTAS, transcript_completo: history,
  });
  const lista = () => [ENTRADA('A', [{ role: 'assistant', content: '**SITUAÇÃO**' }]), ENTRADA('B'), ENTRADA('C')];
  const resposta = { role: 'user', content: 'minha resposta' };

  it('pergunta do meio: segue no MESMO cenário, com a conversa que o servidor devolveu', () => {
    const history = [{ role: 'assistant', content: '**SITUAÇÃO**' }, resposta, { role: 'assistant', content: '**AÇÃO**' }];
    const r = aplicarEnvio(lista(), 0, resposta, { cenarioIndex: 0, history });
    expect(r.tipo).toBe('proxima-pergunta');
    expect(r.lista[0].transcript_completo).toEqual(history);
    expect(r.lista[1].transcript_completo).toEqual([]);
  });

  it('4ª resposta: o cenário fecha (com a resposta dentro) e o seguinte já chega com a 1ª pergunta aberta', () => {
    const atual = [{ role: 'assistant', content: 'a' }, { role: 'user', content: 'r1' }, { role: 'user', content: 'r2' }, { role: 'user', content: 'r3' }];
    const base = [ENTRADA('A', atual), ENTRADA('B'), ENTRADA('C')];
    const abertura = [{ role: 'assistant', content: '**SITUAÇÃO**' }];
    const r = aplicarEnvio(base, 0, resposta, { cenarioIndex: 1, history: abertura });
    expect(r).toMatchObject({ tipo: 'proximo-cenario', idx: 1 });
    expect(r.lista[0].transcript_completo.filter((m: any) => m.role === 'user')).toHaveLength(4);
    expect(r.lista[1].transcript_completo).toEqual(abertura);
    // e a posição, recalculada pelo mesmo helper do servidor, é o cenário 2, pergunta 1
    expect(posicaoNoFechamento(r.lista)).toMatchObject({ cenarioAtual: 1, perguntaAtual: 0 });
  });

  it('última resposta do último cenário (sem cenarioIndex): a lista guarda a resposta e nenhuma pergunta nova abre', () => {
    const r = aplicarEnvio(lista(), 2, resposta, { finalizando: true } as any);
    expect(r.tipo).toBe('ultima-resposta');
    expect(r.lista[2].transcript_completo).toEqual([resposta]);
  });

  it('não muta a lista recebida', () => {
    const original = lista();
    const copia = JSON.stringify(original);
    aplicarEnvio(original, 0, resposta, { cenarioIndex: 1, history: [] });
    expect(JSON.stringify(original)).toBe(copia);
  });

  it('retomada: o slot gravado volta ao cenário e à pergunta em que a pessoa parou', () => {
    const slot = {
      cenarios: [
        { ...ENTRADA('A'), transcript_completo: [{ role: 'assistant', content: 'q1' }, { role: 'user', content: '1' }, { role: 'assistant', content: 'q2' }, { role: 'user', content: '2' }, { role: 'assistant', content: 'q3' }, { role: 'user', content: '3' }, { role: 'assistant', content: 'q4' }, { role: 'user', content: '4' }] },
        { ...ENTRADA('B'), transcript_completo: [{ role: 'assistant', content: 'q1' }, { role: 'user', content: '1' }, { role: 'assistant', content: 'q2' }, { role: 'user', content: '2' }, { role: 'assistant', content: 'q3' }] },
        ENTRADA('C'),
      ],
    };
    expect(posicaoNoFechamento(cenariosDoSlot(slot)!)).toMatchObject({ cenarioAtual: 1, perguntaAtual: 2, totalRespostas: 6, totalPerguntas: 12 });
  });
});
