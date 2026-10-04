/**
 * Alarme de vocabulário da devolutiva (R-37, 04/10/2026).
 *
 * O texto que a pessoa lê no fim da jornada não pode falar em "regressão" nem trazer
 * nota numérica (a evolução é só avanço e ninguém do cliente vê nota decimal). A
 * regra do prompt é a 1ª camada; o detector olha o texto PRONTO. Medido no banco em
 * 04/10/2026: 0 de 15 devolutivas gravadas e 0 de 62 relatórios têm o vocabulário,
 * então isto é prevenção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import { vocabularioProibido, vocabularioProibidoNoResumo } from '@/lib/season-engine/relatorio-texto';
import { regrasDaDevolutiva, tomDevolutivaPorPerfil } from '@/lib/season-engine/prompts/evolution-scenario';
import { promptRedacaoFechamento } from '@/lib/season-engine/prompts/fechamento-redacao';
import { devolutivaMinima } from '@/lib/season-engine/devolutiva-minima';
import { pontuarFechamento } from '@/lib/season-engine/fechamento-scorer';
import { PROGRAMA_JORNADA } from '@/lib/season-engine/programa-config';
import { callAI } from '@/actions/ai-client';

const mockAI = vi.mocked(callAI);

describe('vocabularioProibido', () => {
  it.each([
    ['houve uma regressão no foco', 'regressão'],
    ['você regrediu na escuta', 'regressão'],
    ['uma queda no planejamento', 'queda'],
    ['a escuta caiu', 'queda'],
    ['o registro piorou', 'piora'],
    ['sem retrocesso', 'retrocesso'],
    ['você desaprendeu o combinado', 'desaprendeu'],
    ['sua nota 2,5 no cenário', 'nota numérica'],
    ['ficou em 2,5 de 4', 'nota numérica'],
    ['média de 2.3 no total', 'nota numérica'],
    ['nota final de 3', 'nota numérica'],
  ])('acusa "%s" como %s', (texto, termo) => {
    expect(vocabularioProibido(texto)).toContain(termo);
  });

  it('ignora acento e caixa: REGRESSAO e Queda também contam', () => {
    expect(vocabularioProibido('REGRESSAO', 'Queda')).toEqual(['regressão', 'queda']);
  });

  it.each([
    'Você manteve o patamar de partida e segue praticando a escuta.',
    'Em Escuta ativa você avançou, e o registro ainda pede prática.',
    'O que você leva daqui: confirmar o que ouviu antes de propor.',
    'Notável o cuidado com os combinados.',
    'Nível 3 no relatório, e o próximo passo é registrar.',
    'Em 3 semanas você fechou 2 combinados.',
  ])('não acusa o texto limpo: "%s"', (texto) => {
    expect(vocabularioProibido(texto)).toEqual([]);
  });

  it('aceita lista, valores que não são texto e vazio sem lançar', () => {
    expect(vocabularioProibido(['queda', null, 5, undefined])).toEqual(['queda']);
    expect(vocabularioProibido()).toEqual([]);
  });
});

describe('vocabularioProibidoNoResumo', () => {
  it('olha só os textos autorais: a citação da própria pessoa não conta', () => {
    const resumo = {
      mensagem_geral: 'Você ouviu antes de propor.',
      evidencias_citadas: ['"tivemos uma queda de energia na sala"'],
      principal_avanco: 'Escuta ativa.',
      principal_ponto_de_atencao: 'Registro.',
      mensagem_final: 'Você leva a escuta.',
      proximos_passos: ['Registre o combinado'],
    };
    expect(vocabularioProibidoNoResumo(resumo)).toEqual([]);
    expect(vocabularioProibidoNoResumo({ ...resumo, proximos_passos: ['Recupere a queda no registro'] })).toEqual(['queda']);
    expect(vocabularioProibidoNoResumo({ ...resumo, mensagem_final: 'Houve regressão.' })).toEqual(['regressão']);
  });

  it('resumo ausente ou de forma estranha não lança e não acusa', () => {
    for (const x of [null, undefined, 3, [], {}]) expect(vocabularioProibidoNoResumo(x)).toEqual([]);
    expect(vocabularioProibidoNoResumo('uma regressão')).toEqual(['regressão']);
  });
});

describe('as regras do texto da pessoa valem em TODOS os modos e nas duas camadas que escrevem', () => {
  const regras = (notaPrograma: string) => regrasDaDevolutiva({ nomeColab: 'COLAB_X', semanasEvidencia: 6, notaPrograma, tomDevol: tomDevolutivaPorPerfil('D') });

  it.each([['regular', ''], ['piloto', 'Este é um PILOTO de 2 semanas.']])('%s: proíbe regressão e número de nota', (_modo, nota) => {
    const r = regras(nota);
    expect(r).toContain('PROIBIDO em qualquer texto que COLAB_X lê: "regressão", "regrediu", "queda"');
    expect(r).toContain('PROIBIDO escrever número de nota');
  });

  it('a redação final herda as mesmas proibições (fonte única)', () => {
    const { system } = promptRedacaoFechamento({
      competencia: 'C', nomeColab: 'COLAB_X', semanasEvidencia: 6, notaPrograma: '', descritores: [], rascunho: {},
    } as any);
    expect(system).toContain('PROIBIDO em qualquer texto que COLAB_X lê');
    expect(system).toContain('PROIBIDO escrever número de nota');
  });
});

describe('a devolutiva mínima (montada sem IA) nunca aciona o alarme, nem com queda de nota', () => {
  const d = (descritor: string, nota_pre: number | null, nota_final: number | null) => ({ descritor, nota_pre, nota_final });
  const rascunho = { mensagem_geral: 'x', evidencias_citadas: [], principal_avanco: '', principal_ponto_de_atencao: '', mensagem_final: '', proximos_passos: ['Registre'] };

  it.each([
    ['avançou', [d('Escuta ativa', 2.0, 3.0), d('Registro', 2.0, 2.4)]],
    ['caiu em todos', [d('Escuta ativa', 3.0, 2.0), d('Registro', 3.2, 2.1)]],
    ['sem nota', [d('Escuta ativa', null, null)]],
  ])('%s', (_caso, descritores) => {
    const r = devolutivaMinima({ nomeColab: 'COLAB_X', competencia: 'Gestão de Conflitos', isPiloto: false, rascunho, descritores } as any);
    expect(vocabularioProibidoNoResumo(r)).toEqual([]);
  });
});

describe('o fechamento aciona o alarme quando o texto PUBLICADO traz o vocabulário', () => {
  const SCORE = (mensagemGeral: string) => JSON.stringify({
    avaliacao_por_descritor: [{ descritor: 'Escuta', nota_pre: 2.6, nota_pos: 2.8, justificativa: 'j' }],
    nota_media_pre: 2.6, nota_media_pos: 2.8,
    resumo_avaliacao: {
      mensagem_geral: mensagemGeral, evidencias_citadas: ['"tivemos uma queda de energia"'],
      principal_avanco: 'Escuta', principal_ponto_de_atencao: 'Registro', mensagem_final: 'Você leva a escuta.', proximos_passos: [],
    },
  });
  const CHECK = JSON.stringify({ nota_auditoria: 88, status: 'aprovado', resumo_auditoria: 'ok' });
  const ARGS = {
    competencia: 'Comunicação', descritores: [{ descritor: 'Escuta', nota_atual: 2.6 }], cenario: '## C', resposta: 'r',
    nomeColab: 'COLAB_A1B2', evidenciasAcumuladas: '', acumuladoPrimaria: null, config: PROGRAMA_JORNADA,
  };
  const responder = (mensagemGeral: string) => mockAI.mockImplementation((async (_s: string, _u: string, _c: unknown, _m: unknown, opts: any) =>
    (opts?.taskKey === 'sem14_check' ? CHECK : SCORE(mensagemGeral))) as any);

  beforeEach(() => { mockAI.mockReset(); });

  it('"regressão" na devolutiva: o texto fica, o alarme vai no meta e nos avisos', async () => {
    responder('COLAB_A1B2, houve uma regressão na escuta e sua nota 2,6 caiu.');
    const r = await pontuarFechamento(ARGS as any);
    if (r.ok !== true) throw new Error('esperava ok');
    expect(r.meta.vocabularioProibido).toEqual(['regressão', 'queda', 'nota numérica']);
    expect(r.meta.warnings.some((w) => w.startsWith('vocabulário proibido na devolutiva: regressão, queda, nota numérica'))).toBe(true);
    // alarme, não bloqueio: o texto não é reescrito nem barrado
    expect(r.parsed.resumo_avaliacao.mensagem_geral).toContain('regressão');
  });

  it('texto limpo: sem alarme (a citação da própria pessoa não conta)', async () => {
    responder('COLAB_A1B2, você ouviu antes de propor.');
    const r = await pontuarFechamento(ARGS as any);
    if (r.ok !== true) throw new Error('esperava ok');
    expect(r.meta.vocabularioProibido).toBeUndefined();
    expect(r.meta.warnings.some((w) => w.startsWith('vocabulário proibido'))).toBe(false);
  });
});
