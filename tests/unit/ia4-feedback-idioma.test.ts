import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { maskColaborador } from '@/lib/pii-masker';

/**
 * Onda F (04/10/2026): a devolutiva da IA4 que a pessoa lê na tela de resultado do mapeamento sai no idioma DELA
 * (`colaboradores.locale`, senão `empresas.default_locale`, senão pt-BR), e a NOTA não muda.
 *
 * O desenho é o do `sem14_redacao`: a chamada da IA4 fixa `locale: 'pt-BR'` (o JSON é consolidado por NOME de
 * descritor e o `trecho` é citação), e uma segunda chamada, `ia4_feedback`, reescreve SÓ os três textos de
 * `avaliacao.feedback` que formam `feedback_ia4`. Quem é pt-BR não gasta chamada nenhuma.
 *
 * O que estes testes seguram, nos dois caminhos (o síncrono e o lote persistem por `consolidarEPersistirIA4`, e a
 * reavaliação tem o seu próprio persist):
 *  1. o casamento por nome do descritor e a nota ficam IDÊNTICOS entre o pt-BR e o en-US (a mesma avaliação
 *     persistida; só mudam os três textos);
 *  2. o modelo da redação não consegue mexer em nada além dos três textos (devolver nome de descritor traduzido ou
 *     chave extra não entra);
 *  3. o nome da pessoa vai mascarado e volta (decisão 10b);
 *  4. falha da redação não derruba a avaliação: o feedback fica em pt-BR e a degradação fica registrada.
 *
 * Nomes e contatos sintéticos.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  callAI: vi.fn(),
  locale: { pessoa: null as string | null, empresa: null as string | null },
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'modelo-da-task', DEFAULT_TASK_MODELS: {} }));
vi.mock('@/lib/ia2-gabarito', () => ({ buscarContextoPPP: vi.fn(async () => '') }));

import { avaliarUmaRespostaCore, consolidarEPersistirIA4 } from '@/lib/ia4-avaliacao';
import { reavaliarRespostaCore } from '@/lib/ia4-reavaliacao';
import { CAMPOS_DO_FEEDBACK, SYSTEM_FEEDBACK_IA4, feedbackNoIdiomaDaPessoa } from '@/lib/ia4-feedback-idioma';

const COLAB = { id: 'c1', nome_completo: 'Ana Souza', cargo: 'Professor(a)', email: 'ana@escola.gov.br', perfil_dominante: 'C', d_natural: 20, i_natural: 30, s_natural: 60, c_natural: 90 };
const ALIAS = maskColaborador(COLAB).masked!.nome;
/** "Ana" como palavra (não dentro de "semana", "planejamento"...). */
const TEM_NOME = /(^|[^\p{L}])(Ana|ana@)/u;
const COMP = 'Autocuidado e bem-estar profissional';
const D1 = 'Escuta ativa das partes';
const D2 = 'Busca de apoio';

function montar() {
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => ({
      colaboradores: { ...COLAB, locale: h.locale.pessoa },
      empresas: { nome: 'Rede Municipal', segmento: 'educacao', default_locale: h.locale.empresa },
    } as Record<string, any>)[tabela] ?? null,
    escrita: (tabela: string) => (tabela === 'respostas' ? [{ id: 'r1' }] : null),
  });
}

const tdbDoMock = () => ({ from: (t: string) => h.sb.client.from(t) });
const resp = { id: 'r1', empresa_id: 'e1', colaborador_id: 'c1', competencia_nome: COMP, cargo: 'Professor(a)', r1: 'Eu chamaria a família.', r2: 'Registraria.', r3: null, r4: '' };
const ctx = { compNome: COMP, compCod: 'C1', descritoresTexto: 'D1', descsOficiais: [], cenarioTexto: 'cenário', perguntasTexto: 'P1' };

/** A avaliação como a IA4 a devolve (em pt-BR, com o identificador no lugar do nome). */
const avaliacaoDaIA = () => ({
  avaliacao_por_descritor: [
    { numero: 1, nome: D1, nota_decimal: 2.5, nivel_sugerido: 2, confianca: 0.8, evidencias: [{ resposta: 'R1', trecho: `${ALIAS} chamaria a família` }], racional: 'Ação concreta, sem visão sistêmica.' },
    { numero: 2, nome: D2, nota_decimal: 3.1, nivel_sugerido: 3, confianca: 0.7, evidencias: [{ resposta: 'R2', trecho: 'registraria' }], racional: 'Pede apoio com critério.' },
  ],
  descritores_destaque: { pontos_fortes: [{ descritor: D2, nivel: 3 }], gaps_prioritarios: [{ descritor: D1, nivel: 2 }] },
  feedback: {
    tom_base: 'acolhedor',
    resumo_geral: `${ALIAS}, você propôs chamar a família.`,
    mensagem_positiva: 'Você agiu com cuidado.',
    mensagem_construtiva: 'Falta olhar o efeito na turma toda.',
    recomendacoes: ['a', 'b'],
  },
  recomendacoes_pdi: [{ descritor_foco: D1, acao: 'Registrar o combinado' }],
});

const REDACAO_EN = {
  resumo_geral: `${ALIAS}, you proposed calling the family.`,
  mensagem_positiva: 'You acted with care.',
  mensagem_construtiva: 'You still need to look at the effect on the whole class.',
};

const gravacao = () => h.sb.escritas.find((e: any) => e.tabela === 'respostas' && e.op === 'update').payload;
const upsertDeNotas = () => h.sb.escritas.find((e: any) => e.tabela === 'descriptor_assessments' && e.op === 'upsert').payload;
const degradacoes = () => h.sb.escritas.filter((e: any) => e.tabela === 'degradacao_log').map((e: any) => e.payload);

beforeEach(() => {
  h.callAI.mockReset();
  h.locale = { pessoa: null, empresa: null };
  montar();
});

describe('IA4: quem é pt-BR não muda em nada', () => {
  it('sem idioma na pessoa nem na empresa: nenhuma chamada extra, e o feedback gravado é o de sempre', async () => {
    const r = await consolidarEPersistirIA4(tdbDoMock(), resp, COLAB, avaliacaoDaIA(), ctx as any);
    expect(r.success, r.error).toBe(true);
    expect(h.callAI).not.toHaveBeenCalled();
    expect(gravacao().feedback_ia4).toBe('Ana, você propôs chamar a família.\nVocê agiu com cuidado.\nFalta olhar o efeito na turma toda.');
  });

  it('pessoa pt-BR explícita com a empresa em en-US: segue pt-BR, sem chamada', async () => {
    h.locale = { pessoa: 'pt-BR', empresa: 'en-US' };
    montar();
    await consolidarEPersistirIA4(tdbDoMock(), resp, COLAB, avaliacaoDaIA(), ctx as any);
    expect(h.callAI).not.toHaveBeenCalled();
  });
});

describe('IA4: a devolutiva sai no idioma da pessoa e a nota não muda', () => {
  async function persistirComo(locale: string | null) {
    h.locale = { pessoa: locale, empresa: null };
    montar();
    h.callAI.mockReset();
    h.callAI.mockResolvedValue(JSON.stringify(REDACAO_EN));
    const r = await consolidarEPersistirIA4(tdbDoMock(), resp, COLAB, avaliacaoDaIA(), ctx as any);
    expect(r.success, r.error).toBe(true);
    return { gravacao: gravacao(), notas: upsertDeNotas(), chamadas: h.callAI.mock.calls.length };
  }

  it('🔴 o casamento por nome e a nota são IDÊNTICOS entre pt-BR e en-US: só mudam os três textos', async () => {
    const pt = await persistirComo(null);
    const en = await persistirComo('en-US');
    expect(pt.chamadas).toBe(0);
    expect(en.chamadas).toBe(1);

    // As notas por descritor (a chave do upsert é o NOME do descritor): a mesma linha, byte a byte.
    const semData = (linhas: any[]) => linhas.map(({ assessment_date: _data, ...resto }) => resto);
    expect(semData(en.notas)).toEqual(semData(pt.notas));
    expect(en.notas.map((n: any) => n.descritor)).toEqual([D1, D2]);

    // O registro gravado: tudo igual, menos os três textos de `feedback` e a string que a tela lê.
    const tirarFeedback = (g: any) => {
      const copia = JSON.parse(JSON.stringify(g));
      for (const c of CAMPOS_DO_FEEDBACK) delete copia.avaliacao_ia.feedback[c];
      delete copia.feedback_ia4;
      delete copia.avaliado_em;
      return copia;
    };
    expect(tirarFeedback(en.gravacao)).toEqual(tirarFeedback(pt.gravacao));
    expect(en.gravacao.avaliacao_ia.avaliacao_por_descritor.map((d: any) => d.nome)).toEqual([D1, D2]);
    expect(en.gravacao.nivel_ia4).toBe(pt.gravacao.nivel_ia4);
    expect(en.gravacao.nota_ia4).toBe(pt.gravacao.nota_ia4);

    // E os três textos estão no idioma da pessoa, com o primeiro nome de volta.
    expect(en.gravacao.avaliacao_ia.feedback).toMatchObject({
      tom_base: 'acolhedor',
      resumo_geral: 'Ana, you proposed calling the family.',
      mensagem_positiva: 'You acted with care.',
      recomendacoes: ['a', 'b'],
    });
    expect(en.gravacao.feedback_ia4).toBe('Ana, you proposed calling the family.\nYou acted with care.\nYou still need to look at the effect on the whole class.');
  });

  it('a chamada da redação: tarefa própria, idioma da pessoa, e o nome vai mascarado', async () => {
    await persistirComo('en-US');
    const [system, user, , , opcoes] = h.callAI.mock.calls[0];
    expect(opcoes).toMatchObject({ taskKey: 'ia4_feedback', empresaId: 'e1', colaboradorId: 'c1', locale: 'en-US' });
    expect(system).toBe(SYSTEM_FEEDBACK_IA4);
    expect(String(user)).not.toMatch(TEM_NOME);
    expect(JSON.parse(String(user))).toEqual({
      resumo_geral: `${ALIAS}, você propôs chamar a família.`,
      mensagem_positiva: 'Você agiu com cuidado.',
      mensagem_construtiva: 'Falta olhar o efeito na turma toda.',
    });
  });

  it('o idioma da empresa vale quando a pessoa não tem o dela', async () => {
    h.locale = { pessoa: null, empresa: 'es-ES' };
    montar();
    h.callAI.mockResolvedValue(JSON.stringify(REDACAO_EN));
    await consolidarEPersistirIA4(tdbDoMock(), resp, COLAB, avaliacaoDaIA(), ctx as any);
    expect(h.callAI.mock.calls[0][4].locale).toBe('es-ES');
  });

  it('🔴 o modelo da redação não mexe em mais nada: nome de descritor traduzido e chave extra são ignorados', async () => {
    h.locale = { pessoa: 'en-US', empresa: null };
    montar();
    h.callAI.mockResolvedValue(JSON.stringify({
      ...REDACAO_EN,
      avaliacao_por_descritor: [{ nome: 'Active listening', nota_decimal: 1 }],
      nome: 'Active listening',
      nivel: 4,
    }));
    await consolidarEPersistirIA4(tdbDoMock(), resp, COLAB, avaliacaoDaIA(), ctx as any);
    const g = gravacao();
    expect(g.avaliacao_ia.avaliacao_por_descritor.map((d: any) => d.nome)).toEqual([D1, D2]);
    expect(upsertDeNotas().map((n: any) => n.descritor)).toEqual([D1, D2]);
    expect(g.avaliacao_ia.feedback).not.toHaveProperty('avaliacao_por_descritor');
    expect(g.avaliacao_ia.feedback).not.toHaveProperty('nome');
    expect(g.avaliacao_ia.feedback).not.toHaveProperty('nivel');
    expect(JSON.stringify(g)).not.toContain('Active listening');
  });
});

describe('IA4: a redação que falha não derruba a avaliação', () => {
  const feedbackPtGravado = 'Ana, você propôs chamar a família.\nVocê agiu com cuidado.\nFalta olhar o efeito na turma toda.';

  beforeEach(() => { h.locale = { pessoa: 'en-US', empresa: null }; montar(); });

  it('a IA cai: a avaliação persiste, o feedback fica em pt-BR e a degradação é registrada', async () => {
    h.callAI.mockRejectedValue(new Error('modelo fora do ar'));
    const r = await consolidarEPersistirIA4(tdbDoMock(), resp, COLAB, avaliacaoDaIA(), ctx as any);
    expect(r.success, r.error).toBe(true);
    expect(gravacao().feedback_ia4).toBe(feedbackPtGravado);
    expect(degradacoes()).toHaveLength(1);
    expect(degradacoes()[0]).toMatchObject({ fluxo: 'assessment', tipo: 'feedback-ia4-sem-idioma', chave: 'r1', empresa_id: 'e1', colaborador_id: 'c1', severidade: 'aviso' });
    expect(degradacoes()[0].detalhe).toMatchObject({ locale: 'en-US' });
    expect(degradacoes()[0].detalhe.motivo).toContain('modelo fora do ar');
  });

  it('resposta sem JSON: o mesmo, feedback em pt-BR e degradação registrada', async () => {
    h.callAI.mockResolvedValue('não é json');
    const r = await consolidarEPersistirIA4(tdbDoMock(), resp, COLAB, avaliacaoDaIA(), ctx as any);
    expect(r.success, r.error).toBe(true);
    expect(gravacao().feedback_ia4).toBe(feedbackPtGravado);
    expect(degradacoes()).toHaveLength(1);
  });

  it('só um dos três textos volta: troca esse e deixa os outros em pt-BR, com a degradação registrada', async () => {
    h.callAI.mockResolvedValue(JSON.stringify({ resumo_geral: `${ALIAS}, you proposed calling the family.` }));
    await consolidarEPersistirIA4(tdbDoMock(), resp, COLAB, avaliacaoDaIA(), ctx as any);
    expect(gravacao().feedback_ia4).toBe('Ana, you proposed calling the family.\nVocê agiu com cuidado.\nFalta olhar o efeito na turma toda.');
    expect(degradacoes()).toHaveLength(1);
    expect(degradacoes()[0].detalhe.motivo).toContain('1 de 3');
  });

  it('feedback que não é objeto (legado em texto), ou sem os campos: nenhuma chamada', async () => {
    expect((await feedbackNoIdiomaDaPessoa('texto solto', { empresaId: 'e1', colaboradorId: 'c1' })).reescrito).toBe(false);
    expect((await feedbackNoIdiomaDaPessoa({ recomendacoes: ['a'] }, { empresaId: 'e1', colaboradorId: 'c1' })).reescrito).toBe(false);
    expect((await feedbackNoIdiomaDaPessoa(null, { empresaId: 'e1', colaboradorId: 'c1' })).reescrito).toBe(false);
    expect(h.callAI).not.toHaveBeenCalled();
  });
});

describe('IA4: a chamada de NOTA fica em pt-BR, explícito', () => {
  const respCompleta = { id: 'r1', empresa_id: 'e1', colaborador_id: 'c1', cargo: 'Vendedor', competencia_id: 'comp-1', cenario_id: 'cen-1', r1: 'a', r2: 'b', r3: 'c', r4: 'd' };

  it('a avaliação e o retry de JSON inválido levam `locale: pt-BR`, mesmo para quem lê em outro idioma', async () => {
    h.locale = { pessoa: 'en-US', empresa: null };
    h.sb = criarSupabaseMock({
      resolver: (tabela) => {
        if (tabela === 'banco_cenarios') return { titulo: 'T', descricao: 'D', alternativas: { perguntas: [] } };
        if (tabela === 'competencias') return { nome: 'Priorização', cod_comp: 'GC01', cargo: 'Vendedor', descricao: '' };
        return null;
      },
      lista: (tabela) => (tabela === 'competencias' ? [{ cod_desc: 'D1', nome_curto: 'X', n1_gap: 'a', n2_desenvolvimento: 'b', n3_meta: 'c', n4_referencia: 'd' }] : []),
    });
    h.callAI.mockResolvedValue('não é json'); // força o retry e para antes de persistir
    const r = await avaliarUmaRespostaCore(h.sb.client, h.sb.client as any, respCompleta, { nome_completo: 'Ana' }, {}, '', {});
    expect(r.success).toBe(false);
    const notas = h.callAI.mock.calls.filter((c: any[]) => c[4]?.taskKey === 'ia4_avaliacao');
    expect(notas).toHaveLength(2);
    for (const c of notas) expect(c[4].locale).toBe('pt-BR');
  });
});

describe('reavaliação da IA4: o mesmo desenho', () => {
  function respostaParaReavaliar() {
    h.sb = criarSupabaseMock({
      resolver: (tabela: string) => ({
        respostas: {
          id: 'r1', empresa_id: 'e1', colaborador_id: 'c1', competencia_id: null, cenario_id: null,
          r1: 'Eu ligaria para a família.', r2: null, r3: null, r4: null,
          avaliacao_ia: { avaliacao_por_descritor: [{ nome: D1, nota_decimal: 2, nivel_sugerido: 2, confianca: 0.7, racional: 'citou a família' }], consolidacao: { nivel_geral: 2 } },
          payload_ia4: { justificativa: 'avaliada com rigor.' },
        },
        colaboradores: { ...COLAB, locale: h.locale.pessoa },
        empresas: { nome: 'Rede Municipal', segmento: 'educacao', default_locale: h.locale.empresa },
      } as Record<string, any>)[tabela] ?? null,
      escrita: (tabela: string) => (tabela === 'respostas' ? [{ id: 'r1' }] : null),
    });
  }
  const REVISAO = JSON.stringify({
    avaliacao_revisada: {
      avaliacao_por_descritor: [{ numero: 1, nome: D1, nota_decimal: 2.4, nivel_sugerido: 2 }],
      feedback: { resumo_geral: `${ALIAS}, sua resposta tratou da família.`, mensagem_positiva: 'Bom.', mensagem_construtiva: 'Falta.' },
    },
    tratamento_do_feedback: { itens: [{ ponto: 'x', decisao: 'manter' }], mudancas_relevantes: [], pontos_preservados: [] },
  });

  it('en-US: a revisão sai em pt-BR (nota intacta) e só a devolutiva é reescrita no idioma da pessoa', async () => {
    h.locale = { pessoa: 'en-US', empresa: null };
    respostaParaReavaliar();
    h.callAI.mockImplementation(async (_s: string, _u: string, _c: any, _m: number, o: any) =>
      o?.taskKey === 'ia4_feedback'
        ? JSON.stringify({ resumo_geral: `${ALIAS}, your answer covered the family.`, mensagem_positiva: 'Good.', mensagem_construtiva: 'Missing.' })
        : REVISAO);
    const r = await reavaliarRespostaCore(h.sb.client, 'r1');
    expect(r.success, (r as any).error).toBe(true);

    const revisao = h.callAI.mock.calls.find((c: any[]) => c[4]?.taskKey === 'ia4_avaliacao');
    expect(revisao![4].locale).toBe('pt-BR');
    const redacao = h.callAI.mock.calls.filter((c: any[]) => c[4]?.taskKey === 'ia4_feedback');
    expect(redacao).toHaveLength(1);
    expect(redacao[0][4]).toMatchObject({ empresaId: 'e1', colaboradorId: 'c1', locale: 'en-US' });
    expect(String(redacao[0][1])).not.toMatch(TEM_NOME);

    const g = gravacao();
    expect(g.feedback_ia4).toBe('Ana, your answer covered the family.\nGood.\nMissing.');
    expect(g.avaliacao_ia.avaliacao_por_descritor.map((d: any) => d.nome)).toEqual([D1]);
  });

  it('pt-BR: nenhuma chamada de redação', async () => {
    respostaParaReavaliar();
    h.callAI.mockResolvedValue(REVISAO);
    const r = await reavaliarRespostaCore(h.sb.client, 'r1');
    expect(r.success, (r as any).error).toBe(true);
    expect(h.callAI.mock.calls.filter((c: any[]) => c[4]?.taskKey === 'ia4_feedback')).toHaveLength(0);
    expect(gravacao().feedback_ia4).toBe('Ana, sua resposta tratou da família.\nBom.\nFalta.');
  });
});
