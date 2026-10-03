import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { maskColaborador } from '@/lib/pii-masker';

/**
 * Decisão 10b do dono (03/10/2026): a avaliação não leva o nome da pessoa.
 *
 * IA4 (a nota do mapeamento), a auditoria dela, a reavaliação e o PDI (gerador
 * e auditor) recebem o identificador; o e-mail e o nome que a pessoa digitou
 * nas respostas passam pela mesma máscara das conversas; e o que se GRAVA (o
 * que ela e o RH leem) volta com o primeiro nome. O lote usa as mesmas funções
 * de montar e de gravar, então o teste delas cobre os dois caminhos.
 *
 * Nomes e contatos sintéticos.
 */

const h = vi.hoisted(() => ({ sb: null as any, callAI: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'gpt-auditor', DEFAULT_TASK_MODELS: {} }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: async () => null }));
vi.mock('@/components/pdf/RelatorioIndividual', () => ({ default: () => null }));

import { buildIA4UserPrompt, consolidarEPersistirIA4 } from '@/lib/ia4-avaliacao';
import { montarCheckIA4Prompt, processCheckResult } from '@/lib/check-ia4-core';
import { buildRelatorioIndividualPrompt } from '@/lib/relatorio-individual-prompt';
import { persistRelatorioIndividualFromText } from '@/lib/relatorios/individual-core';

const COLAB = { id: 'c1', nome_completo: 'Ana Souza', cargo: 'Professor(a)', email: 'ana@escola.gov.br', perfil_dominante: 'C', d_natural: 20, i_natural: 30, s_natural: 60, c_natural: 90 };
const ALIAS = maskColaborador(COLAB).masked!.nome;
/** "Ana" como palavra (não dentro de "semana", "planejamento"...). */
const TEM_NOME = /(^|[^\p{L}])(Ana|ana@)/u;
const COMP = 'Autocuidado e bem-estar profissional';

beforeEach(() => {
  h.callAI.mockReset();
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => ({
      colaboradores: COLAB,
      empresas: { nome: 'Rede Municipal', segmento: 'educacao' },
      cargos_empresa: { top5_workshop: [COMP], competencia_foco: COMP, competencias_foco: [COMP] },
      banco_cenarios: { titulo: 'O limite', descricao: 'A coordenação pede um projeto extra.', alternativas: { perguntas: [{ numero: 1, texto: 'O que faria?' }] } },
    } as Record<string, any>)[tabela] ?? null,
    lista: (tabela: string) => (tabela === 'respostas'
      ? [{
        competencia_nome: COMP, colaborador_id: 'c1', cenario_id: 'cen-1',
        r1: 'Eu, Ana, conversaria antes. Respondo em ana@escola.gov.br.', r2: 'Por escrito.',
        avaliacao_ia: { consolidacao: { nivel_geral: 2, media_descritores: 2.2 }, feedback: { resumo_geral: 'Ana Souza priorizou a turma.' } },
        nivel_ia4: 2, nota_ia4: 2.2,
      }]
      : []),
  });
});

describe('IA4: a nota sai sem o nome', () => {
  const resp = { id: 'r1', colaborador_id: 'c1', competencia_nome: COMP, cargo: 'Professor(a)', r1: 'Eu, Ana Souza, chamaria a família. Meu e-mail: ana@escola.gov.br', r2: 'Ana registraria.', r3: null, r4: '' };
  const ctx = { compNome: COMP, compCod: 'C1', descritoresTexto: 'D1', descsOficiais: [], cenarioTexto: 'cenário', perguntasTexto: 'P1' };

  it('o prompt leva o identificador; nome e e-mail das respostas saem mascarados', () => {
    const { cachedUserPrefix, user } = buildIA4UserPrompt(resp, COLAB, { nome: 'Rede', segmento: 'edu' }, '', ctx);
    expect(`${cachedUserPrefix}\n${user}`).not.toMatch(TEM_NOME);
    expect(user).toContain(`Nome: ${ALIAS}`);
    expect(user).toContain(`R1: Eu, ${ALIAS}, chamaria a família. Meu e-mail: ${ALIAS.toLowerCase()}@masked.local`);
    expect(user).toContain(`R2: ${ALIAS} registraria.`);
    expect(user).toContain('R3: (sem resposta)');
  });

  it('o que se grava volta com o primeiro nome (síncrono e lote gravam por aqui)', async () => {
    const tdb = { from: (t: string) => h.sb.client.from(t) };
    const avaliacao = {
      avaliacao_por_descritor: [{ numero: 1, nome: 'D1', nota_decimal: 2.5, evidencias: [{ resposta: 'R1', trecho: `${ALIAS} chamaria a família` }] }],
      feedback: { resumo_geral: `${ALIAS}, você propôs chamar a família.` },
    };
    const r = await consolidarEPersistirIA4(tdb, resp, COLAB, avaliacao, ctx as any);
    expect(r.success, r.error).toBe(true);
    const gravada = h.sb.escritas.find((e: any) => e.tabela === 'respostas' && e.op === 'update').payload;
    expect(gravada.avaliacao_ia.feedback.resumo_geral).toBe('Ana, você propôs chamar a família.');
    expect(gravada.feedback_ia4).toContain('Ana, você');
    expect(JSON.stringify(gravada)).not.toContain(ALIAS);
  });
});

describe('auditoria da IA4: o auditor não lê o nome', () => {
  it('a avaliação gravada (com o nome) e as respostas vão mascaradas', async () => {
    const { user, pii } = await montarCheckIA4Prompt(h.sb.client, {
      colaborador_id: 'c1', competencia_id: null, cenario_id: null,
      r1: 'Sou a Ana.', avaliacao_ia: { feedback: { resumo_geral: 'Ana Souza priorizou a turma.' } },
    }, 'e1');
    expect(user).not.toMatch(TEM_NOME);
    expect(user).toContain(`${ALIAS} (identificador da pessoa)`);
    expect(user).toContain(`${ALIAS} priorizou a turma.`);

    // O veredito volta com o nome para o admin.
    const { check } = processCheckResult({ nota: 90, justificativa: `${ALIAS} foi bem avaliada.` }, null, pii);
    expect(check.justificativa).toBe('Ana foi bem avaliada.');
  });
});

describe('reavaliação da IA4 (o conserto de uma avaliação reprovada)', () => {
  it('avaliação anterior e auditoria gravadas com o nome vão mascaradas; a revisão grava com o nome', async () => {
    h.sb = criarSupabaseMock({
      resolver: (tabela: string) => ({
        respostas: {
          id: 'r1', empresa_id: 'e1', colaborador_id: 'c1', competencia_id: null, cenario_id: null,
          r1: 'Eu, Ana, ligaria para a família.', r2: null, r3: null, r4: null,
          avaliacao_ia: { avaliacao_por_descritor: [{ nome: 'D1', nota_decimal: 2, nivel_sugerido: 2, confianca: 0.7, racional: 'Ana Souza citou a família' }], consolidacao: { nivel_geral: 2 } },
          payload_ia4: { justificativa: 'Ana foi avaliada com rigor.' },
        },
        colaboradores: COLAB,
        empresas: { nome: 'Rede Municipal', segmento: 'educacao' },
      } as Record<string, any>)[tabela] ?? null,
      escrita: (tabela: string) => (tabela === 'respostas' ? [{ id: 'r1' }] : null),
    });
    h.callAI.mockResolvedValue(JSON.stringify({
      avaliacao_revisada: {
        avaliacao_por_descritor: [{ numero: 1, nome: 'D1', nota_decimal: 2.4, nivel_sugerido: 2 }],
        feedback: { resumo_geral: `${ALIAS}, sua resposta tratou da família.` },
      },
      tratamento_do_feedback: { itens: [{ ponto: 'x', decisao: 'manter' }], mudancas_relevantes: [], pontos_preservados: [] },
    }));
    const { reavaliarRespostaCore } = await import('@/lib/ia4-reavaliacao');
    const r = await reavaliarRespostaCore(h.sb.client, 'r1');
    expect(r.success, (r as any).error).toBe(true);
    const userEnviado = String(h.callAI.mock.calls[0][1]);
    expect(userEnviado).not.toMatch(TEM_NOME);
    expect(userEnviado).toContain(`${ALIAS} citou a família`);
    expect(userEnviado).toContain(`${ALIAS} foi avaliada com rigor.`);
    const gravada = h.sb.escritas.find((e: any) => e.tabela === 'respostas' && e.op === 'update').payload;
    expect(gravada.feedback_ia4).toBe('Ana, sua resposta tratou da família.');
  });
});

describe('PDI: gerador e auditor sem o nome; o documento com o nome', () => {
  it('o prompt do gerador leva o identificador, e o parecer gravado da IA4 vai mascarado', async () => {
    const built: any = await buildRelatorioIndividualPrompt(h.sb.client as any, { empresaId: 'e1', colaboradorId: 'c1' });
    expect(built.error, built.error).toBeUndefined();
    expect(built.user).not.toMatch(TEM_NOME);
    expect(built.user).toContain(`COLABORADOR: ${ALIAS}`);
    expect(built.user).toContain(`${ALIAS} priorizou a turma.`);
    expect(built.user).toContain(`R1 (resposta da pessoa): Eu, ${ALIAS}, conversaria antes.`);
    // O pós-processo continua recebendo os dados intactos.
    expect(built.dadosComps[0].competencia).toBe(COMP);
  });

  it('grava o PDI com o primeiro nome e manda ao auditor a versão mascarada', async () => {
    const built: any = await buildRelatorioIndividualPrompt(h.sb.client as any, { empresaId: 'e1', colaboradorId: 'c1' });
    h.callAI.mockResolvedValue(JSON.stringify({ achados: [{ tipo: 'generico', trecho: `${ALIAS}, seu perfil`, motivo: `genérico para ${ALIAS}` }] }));
    const texto = JSON.stringify({
      acolhimento: `${ALIAS}, este plano é seu.`,
      perfil_comportamental: { descricao: `${ALIAS}, seu perfil combina análise e cuidado.` },
      competencias: [{ nome: COMP, feedback: `${ALIAS} propôs conversar antes.` }],
      resumo_desempenho: [{ competencia: COMP, leitura: 'Nas respostas, você conversou antes.' }],
    });
    const r = await persistRelatorioIndividualFromText(h.sb.client as any, { empresaId: 'e1', colaboradorId: 'c1', texto, built });
    expect(r.success, r.error).toBe(true);

    const pdi = h.sb.escritas.find((e: any) => e.tabela === 'relatorios').payload.conteudo;
    expect(pdi.acolhimento).toBe('Ana, este plano é seu.');
    expect(pdi.perfil_comportamental.descricao).toBe('Ana, seu perfil combina análise e cuidado.');
    expect(pdi.competencias[0].feedback).toBe('Ana propôs conversar antes.');
    expect(JSON.stringify(pdi)).not.toContain(ALIAS);

    expect(h.callAI).toHaveBeenCalled();
    for (const [, userAuditor] of h.callAI.mock.calls) {
      expect(String(userAuditor)).not.toMatch(TEM_NOME);
      expect(String(userAuditor)).toContain(`${ALIAS}, este plano é seu.`);
    }
  });
});
