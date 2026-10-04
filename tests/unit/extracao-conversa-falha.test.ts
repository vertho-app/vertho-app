import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { maskColaborador } from '@/lib/pii-masker';

/**
 * R-92 (04/10/2026): a extração estruturada do último turno que falha.
 *
 * Antes, o `catch` fazia `console.error` e a semana concluía sem descritores, insight
 * nem compromisso, justamente o que o fechamento e o relatório leem, sem registro e
 * sem reprocesso. Agora a falha vira linha no `degradacao_log` e a extração é refeita
 * uma vez em `after()`, mesclando no slot (nunca substituindo a conversa).
 *
 * Nomes e contatos sintéticos.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  prog: null as any,
  config: null as any,
  afters: [] as Array<() => any>,
  callAI: vi.fn(),
  callAIChat: vi.fn(),
  acumulada: vi.fn(),
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), after: (fn: () => any) => { h.afters.push(fn); } }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({
    email: 'ana@escola.br', empresaId: 'emp-1', role: 'colaborador', isPlatformAdmin: false,
    colaborador: { id: 'col-1', empresa_id: 'emp-1' },
  }),
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: h.callAIChat }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: any, fn: any) => fn() }));
vi.mock('@/lib/rag', () => ({ retrieveContext: async () => [], formatGroundingBlock: () => '' }));
vi.mock('@/lib/season-engine/trilha-runtime', () => ({
  resolverConfigDaTrilha: async () => h.config,
  checarGatesSemana: async () => null,
  gateAcumuladaPiloto: () => ({ pronto: true, redisparar: false }),
  qualitativaDoPlano: () => null,
}));
vi.mock('@/lib/season-engine/kit/entrega-semana', () => ({
  resolverDesafiosDaSemana: async () => [{ competencia: 'Planejamento', desafio_texto: 'Planeje a semana com a equipe.' }],
}));
vi.mock('@/lib/season-engine/avaliacao-acumulada-core', () => ({ gerarAvaliacaoAcumuladaCore: h.acumulada }));

import { POST as reflection } from '@/app/api/temporada/reflection/route';
import { POST as evaluation } from '@/app/api/temporada/evaluation/route';
import { PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';

const COLAB = { nome_completo: 'Ana Souza', cargo: 'Professora', perfil_dominante: 'S' };
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

const req = (rota: string, body: any) => new Request(`http://escola.vertho.ai/api/temporada/${rota}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trilhaId: 'tr-1', ...body }),
});

const EXTRACAO_OK = JSON.stringify({
  desafio_realizado: 'sim', relato_resumo: 'Relatou a reunião.', insight_principal: 'Planejar antes ajuda.',
  compromisso_proxima: 'Enviar a pauta na véspera.', compromisso_origem: 'colaborador', qualidade_reflexao: 'media', citacao_chave: null,
  avaliacao_por_descritor: [{ descritor: 'D1', apareceu: true, forca_evidencia: 'moderada', observacao: 'planejou', trecho_sustentador: '', limite: '' }],
});

/** 5 falas da IA já gravadas: a próxima é a última (o teto socrático é 6 turnos). */
const transcriptAteOPenultimo = () => {
  const t: any[] = [];
  for (let i = 1; i <= 5; i++) {
    t.push({ role: 'assistant', content: `pergunta ${i}?` });
    t.push({ role: 'user', content: `resposta ${i}` });
  }
  t.pop();
  return t;
};

const escritas = (tabela: string, op?: string) => h.sb.escritas.filter((e: any) => e.tabela === tabela && (!op || e.op === op));
const degradacoes = () => escritas('degradacao_log', 'upsert').map((e: any) => e.payload);
const gravacoesDoSlot = (campo: string) => escritas('temporada_semana_progresso').filter((e: any) => e.payload?.[campo]);
const rodarAfters = async () => { for (const fn of h.afters.splice(0)) await fn(); };

beforeEach(() => {
  for (const f of [h.callAI, h.callAIChat, h.acumulada]) f.mockReset();
  h.afters = [];
  h.config = { ...PROGRAMA_REGULAR_DUO, modo: 'regular', semanas: 9, semanaAcumulada: 8, semanaCenarioB: 9, turnosQualitativa: 2 };
  h.callAIChat.mockResolvedValue(`✅ Obrigado, ${ALIAS}. 🎯 Leve isso para a reunião.`);
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return TRILHA;
      if (tabela === 'colaboradores') return COLAB;
      if (tabela === 'temporada_semana_progresso') return h.prog;
      return null;
    },
  });
});

describe('reflexão semanal: a extração do fim da conversa que falha', () => {
  const concluir = () => reflection(req('reflection', { semana: 1, action: 'send', message: 'Planejei antes.' }));

  beforeEach(() => {
    h.prog = { id: 'p1', empresa_id: 'emp-1', semana: 1, reflexao: { transcript_completo: transcriptAteOPenultimo() } };
  });

  it('🔴 a semana conclui, a falha é REGISTRADA (não só console.error) e a reextração fica agendada', async () => {
    h.callAI.mockRejectedValue(new Error('modelo fora do ar'));
    const res = await concluir();
    expect(res.status).toBe(200);
    expect((await res.json()).finished).toBe(true);

    // A conversa ficou gravada e concluída, sem os campos da extração.
    const slot = gravacoesDoSlot('reflexao').at(-1).payload;
    expect(slot.status).toBe('concluido');
    expect(slot.reflexao.transcript_completo.at(-1).content).toContain('Leve isso');
    expect(slot.reflexao.relato_resumo).toBeUndefined();

    expect(degradacoes()).toHaveLength(1);
    expect(degradacoes()[0]).toMatchObject({
      fluxo: 'chat', tipo: 'extracao-conversa-falhou', chave: 'tr-1:1', empresa_id: 'emp-1', colaborador_id: 'col-1', severidade: 'aviso',
    });
    expect(degradacoes()[0].detalhe).toMatchObject({ estado: 'reextraindo', semana: 1, slot: 'reflexao' });
    expect(degradacoes()[0].detalhe.motivo).toContain('modelo fora do ar');
    expect(h.afters).toHaveLength(1);
  });

  it('🔴 a reextração dá certo: mescla no slot atual (o transcript fica) e FECHA a linha da degradação', async () => {
    h.callAI.mockRejectedValueOnce(new Error('modelo fora do ar'));
    await concluir();
    h.callAI.mockReset();
    h.callAI.mockResolvedValue(EXTRACAO_OK);
    // O slot já gravado pela conversa, como o banco o devolve na releitura.
    h.prog = { id: 'p1', empresa_id: 'emp-1', semana: 1, reflexao: { transcript_completo: [{ role: 'assistant', content: 'oi' }] } };

    await rodarAfters();

    const mescla = gravacoesDoSlot('reflexao').at(-1).payload.reflexao;
    expect(mescla.transcript_completo).toEqual([{ role: 'assistant', content: 'oi' }]);
    expect(mescla).toMatchObject({ relato_resumo: 'Relatou a reunião.', insight_principal: 'Planejar antes ajuda.', compromisso_proxima: 'Enviar a pauta na véspera.' });

    const fechada = escritas('degradacao_log', 'update').at(-1);
    expect(fechada.payload).toMatchObject({ resolution: 'extração refeita em segundo plano' });
    expect(fechada.payload.resolved_at).toBeTruthy();
    // Nenhuma linha crítica: deu certo.
    expect(degradacoes().every((d: any) => d.severidade === 'aviso')).toBe(true);
  });

  it('🔴 a segunda também falha: sobe para `critico` (desistiu), e não fecha nada', async () => {
    h.callAI.mockRejectedValue(new Error('modelo fora do ar'));
    await concluir();
    await rodarAfters();

    const ultima = degradacoes().at(-1);
    expect(ultima).toMatchObject({ tipo: 'extracao-conversa-falhou', chave: 'tr-1:1', severidade: 'critico' });
    expect(ultima.detalhe.estado).toBe('desistiu');
    expect(escritas('degradacao_log', 'update')).toHaveLength(0);
  });

  it('a gravação da reextração que falha também vira `critico`, sem lançar', async () => {
    h.callAI.mockRejectedValueOnce(new Error('modelo fora do ar'));
    await concluir();
    h.callAI.mockReset();
    h.callAI.mockResolvedValue(EXTRACAO_OK);
    h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'timeout no pool', quando: (p) => !!p?.reflexao && !p?.status });

    await expect(rodarAfters()).resolves.toBeUndefined();
    expect(degradacoes().at(-1)).toMatchObject({ severidade: 'critico' });
    expect(degradacoes().at(-1).detalhe.motivo).toContain('timeout no pool');
  });

  it('extração que dá certo na 1ª: nada registrado e nada agendado', async () => {
    h.callAI.mockResolvedValue(EXTRACAO_OK);
    await concluir();
    expect(degradacoes()).toHaveLength(0);
    expect(h.afters).toHaveLength(0);
    expect(gravacoesDoSlot('reflexao').at(-1).payload.reflexao.relato_resumo).toBe('Relatou a reunião.');
  });

  it('a reextração vai à IA com o nome mascarado, como a 1ª (R-05)', async () => {
    h.prog = { id: 'p1', empresa_id: 'emp-1', semana: 1, reflexao: { transcript_completo: [{ role: 'assistant', content: 'Ana, pergunta 1?' }, { role: 'user', content: 'resposta' }, ...transcriptAteOPenultimo().slice(2)] } };
    h.callAI.mockRejectedValueOnce(new Error('modelo fora do ar'));
    await concluir();
    h.callAI.mockReset();
    h.callAI.mockResolvedValue(EXTRACAO_OK);
    await rodarAfters();
    const chamada = h.callAI.mock.calls.find((c: any[]) => c[4]?.taskKey === 'temporada_extracao');
    expect(chamada, 'a reextração rodou').toBeTruthy();
    expect(String(chamada[1])).not.toMatch(/Ana|Souza/);
  });
});

describe('conversa qualitativa (semana da acumulada): a extração que falha', () => {
  const concluir = () => evaluation(req('evaluation', { semana: 8, action: 'send', message: 'Hoje eu planejo.' }));

  beforeEach(() => {
    h.prog = { id: 'p8', empresa_id: 'emp-1', semana: 8, reflexao: { transcript_completo: [{ role: 'assistant', content: 'O que mudou?' }] } };
    h.callAIChat.mockResolvedValue('Obrigado. Conversa registrada.');
  });

  it('🔴 registra a falha, refaz a extração e SÓ DEPOIS dispara a acumulada (que lê esta conversa)', async () => {
    h.callAI.mockRejectedValueOnce(new Error('modelo fora do ar'));
    const res = await concluir();
    expect(res.status).toBe(200);
    expect(degradacoes()[0]).toMatchObject({ tipo: 'extracao-conversa-falhou', chave: 'tr-1:8', severidade: 'aviso' });
    expect(degradacoes()[0].detalhe).toMatchObject({ slot: 'reflexao', tipo_conversa: 'sem13_qualitativa' });

    h.callAI.mockReset();
    h.callAI.mockResolvedValue(JSON.stringify({
      evolucao_percebida: [{ descritor: 'D1', antes: 'improvisava', depois: 'planeja', nivel_percebido: 3, evidencia: 'citou a reunião' }],
      insight_geral: 'Percebeu o padrão.',
    }));
    const ordem: string[] = [];
    h.acumulada.mockImplementation(async () => { ordem.push('acumulada'); });
    const original = h.sb.client.from;
    h.sb.client.from = (tabela: string) => {
      const b = original(tabela);
      if (tabela === 'temporada_semana_progresso') {
        const update = b.update;
        b.update = (p: any) => { if (p?.reflexao && !p?.status) ordem.push('extracao-gravada'); return update(p); };
      }
      return b;
    };
    await rodarAfters();

    expect(ordem).toEqual(['extracao-gravada', 'acumulada']);
    expect(gravacoesDoSlot('reflexao').at(-1).payload.reflexao.insight_geral).toBe('Percebeu o padrão.');
  });

  it('sem falha de extração, a acumulada dispara como sempre', async () => {
    h.callAI.mockResolvedValue(JSON.stringify({ evolucao_percebida: [], insight_geral: 'ok' }));
    await concluir();
    await rodarAfters();
    expect(h.acumulada).toHaveBeenCalledTimes(1);
    expect(degradacoes()).toHaveLength(0);
  });
});

describe('resolverDegradacao', () => {
  it('só fecha linha ainda ABERTA (uma resolução manual do admin não é sobrescrita) e filtra pela chave inteira', async () => {
    const { resolverDegradacao } = await import('@/lib/degradacao');
    await resolverDegradacao({ fluxo: 'chat', tipo: 'extracao-conversa-falhou', chave: 'tr-1:1' }, 'refeita', h.sb.client);
    expect(h.sb.usou('degradacao_log', 'is', 'resolved_at')).toBe(true);
    for (const campo of ['fluxo', 'tipo', 'chave']) expect(h.sb.usou('degradacao_log', 'eq', campo)).toBe(true);
  });

  it('nunca lança, nem com o banco fora', async () => {
    const { resolverDegradacao } = await import('@/lib/degradacao');
    h.sb.falharEm({ tabela: 'degradacao_log', op: 'update', mensagem: 'timeout no pool' });
    await expect(resolverDegradacao({ fluxo: 'chat', tipo: 'extracao-conversa-falhou', chave: 'x' }, 'r', h.sb.client)).resolves.toBeUndefined();
  });
});
