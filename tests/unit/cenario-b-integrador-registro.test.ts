/**
 * O Cenário B integrador (R-21, 04/10/2026) nas pontas que NÃO são o gerador:
 *  - a tarefa de IA no registro de modelos (task key, incumbente, pino, régua de privacidade);
 *  - o travessão (a tarefa escreve texto que a pessoa lê);
 *  - o custo (o catálogo de preço enxerga a tarefa);
 *  - a tela do fechamento, que tinha "4 perguntas" escrito no código e na copy.
 *
 * Guard de FONTE para a tela (a página é um componente de cliente com roteador e
 * dezenas de hooks; a suíte não a renderiza): o número de perguntas vem da lista
 * que a rota serve, e os passos que não são pergunta ficam fora do intervalo delas.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AI_TASKS, DEFAULT_TASK_MODELS, PINNED_TASKS, resolveTaskModel, modeloPermitidoNaTarefa, MODELOS_DECLARADOS,
} from '@/lib/ai-tasks';
import { CALLS } from '@/lib/ia-cost-catalog';
import { SAIDAS_AO_CLIENTE, formaDaSaidaAoCliente, sanitizarSaidaDaTarefa } from '@/lib/ai-saida-sem-travessao';

const TASK = 'cenarios_b_integrador';
const EM = String.fromCharCode(0x2014);

describe('registro da tarefa de IA', () => {
  it('está declarada para a tela de modelos, na Fase 5, com o nome do que faz', () => {
    const t = AI_TASKS.find((x) => x.key === TASK);
    expect(t).toBeTruthy();
    expect(t!.fase).toBe('Fase 5');
    expect(t!.label).toContain('integrador');
  });

  it('o incumbente é o do B por célula (nenhum bake-off foi feito nesta tarefa) e a tela de custo concorda', () => {
    const celula = CALLS.find((c: any) => c.taskKey === 'cenarios_b') as any;
    const integrador = CALLS.find((c: any) => c.taskKey === TASK) as any;
    expect(integrador).toBeTruthy();
    expect(DEFAULT_TASK_MODELS[TASK]).toBe(celula.defaultModel);
    expect(integrador.defaultModel).toBe(DEFAULT_TASK_MODELS[TASK]);
    expect(integrador.descricao).toContain('ESTIMATIVA');
  });

  it('é PINADA: o modelo_padrao do tenant não troca o modelo de um instrumento de fechamento', () => {
    expect(PINNED_TASKS.has(TASK)).toBe(true);
    const barato = { ai: { modelo_padrao: 'gemini-3.8-flash' } };
    expect(resolveTaskModel(barato, TASK)).toBe(DEFAULT_TASK_MODELS[TASK]);
  });

  it('o override EXPLÍCITO por tarefa vale (a saída para trocar de modelo numa empresa sem deploy)', () => {
    expect(resolveTaskModel({ ai: { modelos: { [TASK]: 'claude-sonnet-5-5' } } }, TASK)).toBe('claude-sonnet-5-5');
  });

  it('nasce restrita às famílias declaradas na política de privacidade (o prompt leva PPP e cargo)', () => {
    for (const m of MODELOS_DECLARADOS) expect(modeloPermitidoNaTarefa(m.id, TASK), m.id).toBe(true);
    expect(modeloPermitidoNaTarefa('kimi-k3', TASK)).toBe(false);
    expect(modeloPermitidoNaTarefa('qwen3.8-max', TASK)).toBe(false);
  });
});

describe('o texto do cenário chega à pessoa: sai sem travessão pelo wrapper', () => {
  it('a tarefa está no registro de saídas ao cliente, em JSON', () => {
    expect(Object.keys(SAIDAS_AO_CLIENTE)).toContain(TASK);
    expect(formaDaSaidaAoCliente(TASK)).toBe('json');
  });

  it('limpa o caso e as perguntas, e deixa o nome da competência (eco da entrada) como veio', () => {
    const competencia = `Feedback ${EM} receber e aplicar`;
    const user = `Competência 1: ${competencia}`;
    const bruto = JSON.stringify({
      titulo: `A entrega ${EM} sem dono`,
      descricao: `Marina avisa ${EM} a entrega mudou.`,
      perguntas: [{ competencia, pergunta: `O que você faz ${EM} e por quê?` }],
    });
    const saida = JSON.parse(sanitizarSaidaDaTarefa(TASK, bruto, [user]));
    expect(saida.titulo).toBe('A entrega, sem dono');
    expect(saida.descricao).toBe('Marina avisa, a entrega mudou.');
    expect(saida.perguntas[0].pergunta).toBe('O que você faz, e por quê?');
    // se o nome fosse trocado, `normalizarCenarioBIntegrador` não casaria a pergunta com a competência
    expect(saida.perguntas[0].competencia).toBe(competencia);
  });
});

describe('tela do fechamento: o número de perguntas vem da lista servida, não de um "4" no código', () => {
  const pagina = readFileSync('app/dashboard/temporada/sem14/page.tsx', 'utf8');
  const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;

  it('nenhum 4 fixo nas perguntas: contador, barra de progresso, última pergunta e as respostas', () => {
    expect(pagina).not.toMatch(/total: 4/);
    expect(pagina).not.toMatch(/\[1, 2, 3, 4\]/);
    expect(pagina).not.toMatch(/step <= 4/);
    expect(pagina).not.toMatch(/step < 4/);
    expect(pagina).not.toMatch(/\/ 4\)/);
    expect(pagina).not.toMatch(/useState\(\['', '', '', ''\]\)/);
    expect(pagina).not.toMatch(/i < 4/);
    expect(pagina).toContain('const totalPerguntas = perguntas.length');
    expect(pagina).toContain("t('question.counter', { current: step, total: totalPerguntas })");
    expect(pagina).toContain('step < totalPerguntas');
  });

  it('os passos de arguição, pontuação e conclusão ficam FORA do intervalo das perguntas (uma 6ª pergunta não vira "concluída")', () => {
    const passo = (nome: string) => Number(pagina.match(new RegExp(`const ${nome} = (\\d+);`))![1]);
    const fim = passo('STEP_FIM'), arguicao = passo('STEP_ARGUICAO'), pontuacao = passo('STEP_PONTUACAO');
    for (const p of [fim, arguicao, pontuacao]) expect(p).toBeGreaterThan(20);
    expect(new Set([fim, arguicao, pontuacao]).size).toBe(3);
    expect(Math.min(fim, arguicao, pontuacao)).toBe(fim); // `>= STEP_FIM` continua lendo "concluída, arguição ou pontuação"
    expect(pagina).not.toMatch(/setStep\((6|7|8)\)/);
    expect(pagina).not.toMatch(/step === (6|7|8)\b/);
  });

  it.each(LOCALES)('%s: o aviso de "todas as perguntas" usa o total, não o número 4', (locale) => {
    const aviso = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).SeasonFinal.alerts.allQuestions as string;
    expect(aviso).toContain('{total}');
    expect(aviso).toContain('{min}');
    expect(aviso).not.toMatch(/\b4\b/);
  });
});
