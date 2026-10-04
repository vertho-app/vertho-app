/**
 * R-57 (04/10/2026): o exemplo do prompt vence a prosa. Os prompts de texto ao
 * cliente traziam o travessão em frases que o modelo é mandado a DIZER, em
 * moldes de resposta e em títulos de exemplo, e por isso a regra "sem travessão"
 * não pegava. Este teste renderiza os prompts e falha se um EXEMPLO (trecho entre
 * aspas ou entre colchetes, numa linha só) trouxer o caractere.
 *
 * A prosa de instrução fora desses trechos não entra na régua, de propósito: ela
 * não é copiada para a saída, e a saída passa pelo sanitizador do wrapper
 * (`lib/ai-saida-sem-travessao.ts`). O caractere só aparece como escape.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(), callAIChat: vi.fn() }));

import { promptTiraDuvidas } from '@/lib/season-engine/prompts/tira-duvidas';
import { promptSocratic } from '@/lib/season-engine/prompts/socratic';
import { promptAnalytic } from '@/lib/season-engine/prompts/analytic';
import { promptMissaoFeedback } from '@/lib/season-engine/prompts/missao-feedback';
import { promptEvolutionQualitative, promptEvolutionQualitativeExtract } from '@/lib/season-engine/prompts/evolution-qualitative';
import { promptEvolutionScenarioScore } from '@/lib/season-engine/prompts/evolution-scenario';
import { promptRedacaoFechamento } from '@/lib/season-engine/prompts/fechamento-redacao';
import { RELATORIO_IND_SYSTEM } from '@/lib/relatorio-individual-prompt';
import { RELATORIO_GESTOR_SYSTEM, RELATORIO_RH_SYSTEM } from '@/lib/relatorios/prompts';
import { buildArguicaoSystemPrompt } from '@/lib/season-engine/arguicao';
import { SISTEMA_SUPORTE } from '@/lib/whatsapp/suporte-auto';
import { buildBehavioralReportPrompt } from '@/lib/prompts/behavioral-report-prompt';
import { CASOS_SCORER } from './fechamento/fixtures-golden-fechamento';

const TRAVESSAO = /[–—―]/;
const EXEMPLO = /"[^"\n]*"|“[^”\n]*”|\[[^\]\n]*\]/g;

function textos(valor: unknown, saida: string[] = []): string[] {
  if (typeof valor === 'string') saida.push(valor);
  else if (Array.isArray(valor)) valor.forEach((v) => textos(v, saida));
  else if (valor && typeof valor === 'object') Object.values(valor).forEach((v) => textos(v, saida));
  return saida;
}

/** Os exemplos (entre aspas ou colchetes) que trazem travessão. */
function exemplosComTravessao(prompt: unknown): string[] {
  return textos(prompt).flatMap((t) => (t.match(EXEMPLO) ?? []).filter((e) => TRAVESSAO.test(e)));
}

const base = {
  nomeColab: 'Paulo', cargo: 'Representante Comercial', competencia: 'Negociação e Fechamento',
  descritoresCobertos: ['Criação de senso de urgência', 'Tratamento de objeções'], historico: [],
};

const PROMPTS: Array<[string, () => unknown[]]> = [
  ['Tira-Dúvidas', () => ['D', 'I', 'S', 'C', null].map((p) => promptTiraDuvidas({
    nomeColab: 'Paulo', cargo: 'Representante', competencia: 'Negociação', descritor: 'Criação de senso de urgência',
    perfilDominante: p, conteudoResumo: 'Resumo.', groundingContext: 'Base curada.', cargoContexto: 'Cargo.', blueprintResumo: 'Foco.', conteudosRelacionados: 'Saiba mais.',
  }))],
  ['conversa socrática, uma tarefa', () => [1, 2, 3, 4, 5, 6].flatMap((turnIA) => ['D', 'I', 'S', 'C', null].map((p) => promptSocratic({
    ...base, perfilDominante: p, turnIA, descritor: 'Criação de senso de urgência', desafio: 'faça X', desafios: [],
  } as any)))],
  ['conversa socrática, duas tarefas em sequência', () => [1, 2, 3, 4, 5, 6].map((turnIA) => promptSocratic({
    ...base, turnIA, descritor: 'Criação de senso de urgência', desafio: 'faça X',
    desafios: [{ competencia: 'Negociação', desafio_texto: 'faça X' }, { competencia: 'Escuta', desafio_texto: 'faça Y' }],
  } as any))],
  ['conversa analítica', () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((turnIA) => promptAnalytic({ ...base, turnIA, cenario: 'Um cliente sumiu.' } as any))],
  ['feedback da missão', () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((turnIA) => promptMissaoFeedback({ ...base, turnIA, missao: 'Reative.', compromisso: 'Quarta.' } as any))],
  ['conversa qualitativa (semana 13)', () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((turnIA) => promptEvolutionQualitative({
    nomeColab: 'COLAB_1', cargo: 'Coordenadora', perfilDominante: 'S', competencia: 'Gestão Escolar',
    descritores: [{ descritor: 'Escuta ativa' }], insightsAnteriores: ['percebi que escuto menos'], turnIA, totalTurns: 12,
  } as any))],
  ['extração qualitativa (antes e depois do relatório)', () => [promptEvolutionQualitativeExtract({
    descritores: [{ descritor: 'Escuta ativa' }] as any, transcript: 'Pessoa: escuto mais.',
  })]],
  ['PDI', () => [RELATORIO_IND_SYSTEM]],
  ['relatório do gestor e do RH', () => [RELATORIO_GESTOR_SYSTEM, RELATORIO_RH_SYSTEM]],
  ['relatório comportamental', () => [buildBehavioralReportPrompt({
    nome: 'Paulo Silva', perfil_dominante: 'D', disc_natural: { D: 60, I: 40, S: 50, C: 50 },
    lideranca: { executivo: 40, motivador: 20, metodico: 20, sistematico: 20 },
    tipo_psicologico: { tipo: 'ESTJ', extroversao: 60, intuicao: 40, pensamento: 70 }, competencias: [{ nome: 'Foco', natural: 3 }],
  })]],
  ['arguição', () => [1, 2, 3].map((t) => buildArguicaoSystemPrompt({
    nomeColab: 'Paulo', cargo: 'Coordenador', competencia: 'Gestão', perfilDominante: 'D', cenario: 'Cenário.', respostaCenario: 'Resposta.',
    descritores: [{ descritor: 'Escuta ativa' }], isPiloto: false,
  }, 4, t))],
  ['Beto no WhatsApp', () => [SISTEMA_SUPORTE]],
  ['devolutiva do fechamento (scorer e redação)', () => [
    ...CASOS_SCORER.map((c) => promptEvolutionScenarioScore(c.params as any)),
    promptRedacaoFechamento({
      competencia: 'Comp', nomeColab: 'COLAB_X', perfilDominante: 'D', semanasEvidencia: 6, notaPrograma: '',
      rascunho: { mensagem_geral: 'a', evidencias_citadas: [], principal_avanco: 'b', principal_ponto_de_atencao: 'c', mensagem_final: 'd', proximos_passos: [] },
      descritores: [{ descritor: 'Baixo', nota_pre: 2, nota_rascunho: 3, nota_final: 2.5, justificativa: 'j' }], arguicao: null,
    } as any),
  ]],
];

describe('prompts de texto ao cliente: o exemplo não traz travessão', () => {
  it.each(PROMPTS)('%s', (_nome, montar) => {
    const renderizados = montar();
    expect(renderizados.length).toBeGreaterThan(0);
    expect([...new Set(renderizados.flatMap(exemplosComTravessao))]).toEqual([]);
  });

  it('o detector enxerga um exemplo com travessão entre aspas e entre colchetes (prova de que sabe falhar)', () => {
    expect(exemplosComTravessao(`Diga: "olá — tudo bem?"`)).toHaveLength(1);
    expect(exemplosComTravessao(`Molde: [realizado | parcial — baseado no relato]`)).toHaveLength(1);
    expect(exemplosComTravessao(`Prosa de instrução — fora de aspas e colchetes`)).toEqual([]);
  });
});
