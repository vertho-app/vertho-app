import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { maskColaborador } from '@/lib/pii-masker';

/**
 * R-05 (03/10/2026): os pontos das rotas da jornada em que o nome ia à IA.
 *
 *  1. Extração de fim de conversa da reflexão semanal: recebia o histórico
 *     inteiro CRU, inclusive a última fala da IA já desmascarada.
 *  2. Extração da conversa qualitativa (semana da acumulada): idem.
 *  3. Pergunta do Tira-Dúvidas: ia crua à busca vetorial (o vetor é gerado num
 *     provedor externo) antes de qualquer máscara.
 *
 * Em todos, o que a pessoa lê volta com o nome. Nomes e contatos sintéticos.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  prog: null as any,
  config: null as any,
  callAI: vi.fn(),
  callAIChat: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), after: vi.fn() }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({
    email: 'helmar@escola.br', empresaId: 'emp-1', role: 'colaborador', isPlatformAdmin: false,
    colaborador: { id: 'col-1', empresa_id: 'emp-1' },
  }),
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: h.callAIChat }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: any, fn: any) => fn() }));
vi.mock('@/lib/rag', () => ({ retrieveContext: h.retrieve, formatGroundingBlock: () => '' }));
vi.mock('@/lib/season-engine/trilha-runtime', () => ({
  resolverConfigDaTrilha: async () => h.config,
  checarGatesSemana: async () => null,
  gateAcumuladaPiloto: () => ({ pronto: true, redisparar: false }),
  qualitativaDoPlano: () => null,
}));
vi.mock('@/lib/season-engine/kit/entrega-semana', () => ({
  resolverDesafiosDaSemana: async () => [{ competencia: 'Planejamento', desafio_texto: 'Planeje a semana com a equipe.' }],
}));

import { POST as reflection } from '@/app/api/temporada/reflection/route';
import { POST as evaluation } from '@/app/api/temporada/evaluation/route';
import { POST as tiraDuvidas } from '@/app/api/temporada/tira-duvidas/route';
import { PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';

const COLAB = { nome_completo: 'Helmar Miranda', cargo: 'Gestão Escolar', perfil_dominante: 'S' };
// A rota lê o colaborador sem id nem e-mail: o alias sai do nome, o mesmo aqui.
const ALIAS = maskColaborador(COLAB).masked!.nome;

const TRILHA = {
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: 'Planejamento',
  competencias_foco: ['Planejamento'], descritores_selecionados: [{ descritor: 'D1', competencia: 'Planejamento' }],
  temporada_plano: [
    { semana: 1, tipo: 'conteudo', competencia: 'Planejamento', descritor: 'D1', descritores_cobertos: ['D1'] },
    { semana: 8, tipo: 'avaliacao' },
    { semana: 9, tipo: 'avaliacao' },
  ],
  data_inicio: '2026-07-01', programa_modo: 'regular', programa_config: {},
};

const req = (rota: string, body: any) => new Request(`http://ibipeba.vertho.ai/api/temporada/${rota}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trilhaId: 'tr-1', ...body }),
});

const chamadaDe = (fn: any, taskKey: string) => fn.mock.calls.find((c: any[]) => c[4]?.taskKey === taskKey);
/** O slot gravado da conversa (a liberação da semana seguinte também escreve na tabela). */
const slotGravado = (campo: string) => h.sb.escritas
  .filter((e: any) => e.tabela === 'temporada_semana_progresso' && e.payload?.[campo])
  .at(-1)?.payload[campo];

beforeEach(() => {
  for (const f of [h.callAI, h.callAIChat, h.retrieve]) f.mockReset();
  h.retrieve.mockResolvedValue([]);
  h.config = { ...PROGRAMA_REGULAR_DUO, modo: 'regular', semanas: 9, semanaAcumulada: 8, semanaCenarioB: 9, turnosQualitativa: 2 };
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return TRILHA;
      if (tabela === 'colaboradores') return COLAB;
      if (tabela === 'temporada_semana_progresso') return h.prog;
      return null;
    },
  });
});

describe('reflexão semanal: a extração de fim de conversa', () => {
  it('vai à IA sem o nome e sem o contato; o que se grava volta com o nome', async () => {
    // 5 falas da IA já gravadas (desmascaradas, como a pessoa as leu): a próxima é a última.
    const transcript: any[] = [];
    for (let i = 1; i <= 5; i++) {
      transcript.push({ role: 'assistant', content: `Helmar, pergunta ${i}?` });
      transcript.push({ role: 'user', content: i === 1 ? 'Meu e-mail é helmar@escola.br, Helmar aqui.' : `resposta ${i}` });
    }
    transcript.pop(); // a última fala do usuário chega pela mensagem
    h.prog = { id: 'p1', empresa_id: 'emp-1', semana: 1, reflexao: { transcript_completo: transcript } };
    h.callAIChat.mockResolvedValue(`✅ Obrigado, ${ALIAS}. 🎯 Leve isso para a reunião.`);
    h.callAI.mockResolvedValue(JSON.stringify({
      desafio_realizado: 'sim',
      relato_resumo: `${ALIAS} relatou a reunião.`,
      insight_principal: '', compromisso_proxima: '', compromisso_origem: 'ausente',
      qualidade_reflexao: 'media', citacao_chave: `${ALIAS}: planejei antes`,
      avaliacao_por_descritor: [{ descritor: 'D1', apareceu: true, forca_evidencia: 'moderada', observacao: `${ALIAS} planejou`, trecho_sustentador: '', limite: '' }],
    }));

    const res = await reflection(req('reflection', { semana: 1, action: 'send', message: 'Eu, Helmar, planejei antes.' }));
    expect(res.status).toBe(200);

    const conversa = chamadaDe(h.callAIChat, 'evidencias_socratic');
    expect(JSON.stringify(conversa.slice(0, 2))).not.toMatch(/Helmar|helmar@/);

    const extracao = chamadaDe(h.callAI, 'temporada_extracao');
    expect(extracao, 'a extração rodou').toBeTruthy();
    expect(String(extracao[1])).not.toMatch(/Helmar|helmar@/);
    expect(String(extracao[1])).toContain(ALIAS);

    const slot = slotGravado('reflexao');
    expect(slot.relato_resumo).toBe('Helmar relatou a reunião.');
    expect(slot.citacao_chave).toBe('Helmar: planejei antes');
    expect(slot.avaliacao_por_descritor[0].observacao).toBe('Helmar planejou');
    expect(JSON.stringify(slot)).not.toContain(ALIAS);
    // O histórico guarda o texto cru da pessoa e a fala da IA com o nome.
    expect(slot.transcript_completo.at(-1).content).toContain('Obrigado, Helmar.');
  });
});

describe('conversa qualitativa (semana da acumulada): a extração', () => {
  it('vai à IA sem o nome; evolução percebida volta com o nome', async () => {
    h.prog = {
      id: 'p8', empresa_id: 'emp-1', semana: 8,
      reflexao: { transcript_completo: [{ role: 'assistant', content: 'Helmar, o que mudou?' }] },
    };
    h.callAIChat.mockResolvedValue(`Obrigado, ${ALIAS}. Conversa registrada.`);
    h.callAI.mockResolvedValue(JSON.stringify({
      evolucao_percebida: [{ descritor: 'D1', antes: 'improvisava', depois: `${ALIAS} planeja`, nivel_percebido: 3, evidencia: `${ALIAS} citou a reunião` }],
      insight_geral: `${ALIAS} percebeu o padrão.`,
    }));

    const res = await evaluation(req('evaluation', { semana: 8, action: 'send', message: 'Helmar Miranda aqui: hoje eu planejo.' }));
    expect(res.status).toBe(200);

    const extracao = chamadaDe(h.callAI, 'temporada_extracao');
    expect(extracao, 'a extração rodou').toBeTruthy();
    expect(String(extracao[1])).not.toContain('Helmar');

    const slot = slotGravado('reflexao');
    expect(slot.insight_geral).toBe('Helmar percebeu o padrão.');
    expect(slot.evolucao_percebida[0].depois).toBe('Helmar planeja');
    expect(JSON.stringify(slot)).not.toContain(ALIAS);
  });
});

describe('Tira-Dúvidas: a pergunta que vai à busca vetorial', () => {
  it('sai mascarada; a resposta exibida volta com o nome', async () => {
    h.prog = { id: 'p1', empresa_id: 'emp-1', semana: 1, conteudo_consumido: true, tira_duvidas: { transcript_completo: [] } };
    h.callAIChat.mockResolvedValue(`${ALIAS}, comece pela pauta.`);

    const res = await tiraDuvidas(req('tira-duvidas', { semana: 1, message: 'Sou Helmar, tel (75) 99999-1234: como monto a pauta?' }));
    expect(res.status).toBe(200);

    expect(h.retrieve).toHaveBeenCalledTimes(1);
    const consulta = String(h.retrieve.mock.calls[0][1]);
    expect(consulta).toBe(`Sou ${ALIAS}, tel [telefone]: como monto a pauta?`);
    expect((await res.json()).message).toBe('Helmar, comece pela pauta.');
  });
});
