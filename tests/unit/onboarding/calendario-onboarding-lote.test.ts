import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { prepararLoteTemplate } from '@/lib/notifications/envio-template-lote';

/**
 * Lote manual de WhatsApp do Onboarding de 12 semanas (04/10/2026): quem está na
 * semana de MAPEAMENTO (a 1, concluída, até a segunda em que a 2 abre) não recebe
 * "conteúdo da semana": não há tema a anunciar. Arquivo à parte do cron
 * (`calendario-onboarding.test.ts`), que substitui os módulos de envio.
 */

const COMPETENCIAS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];
/** A semana 2 abre em 16/11; `data_inicio` é a segunda ANTERIOR, a do Mapeamento. */
const DATA_INICIO = '2026-11-09';
const conteudo = (semana: number) => ({
  semana, tipo: 'conteudo', descritor: `D${semana}`,
  conteudos_dia: [{ descritor: `D${semana}`, conteudo: { titulo: `Tema ${semana}`, core_titulo: `Tema ${semana}` } }],
});
const PLANO_ONBOARDING: any[] = [
  { semana: 1, tipo: 'mapeamento', descritor: null, descritores_cobertos: [], competencias_cobertas: COMPETENCIAS, status: 'disponivel' },
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(conteudo),
  { semana: 12, tipo: 'avaliacao', descritor: null, descritores_cobertos: [], status: 'bloqueada' },
];

describe('lote manual de WhatsApp × semana de mapeamento', () => {
  const EMP = { id: 'emp-1', nome: 'Escola', slug: 'escola', is_demo: false };
  const colab = { id: 'c1', nome_completo: 'MARIA SOUZA', cargo: 'Professor(a)', telefone: '5522999999999', perfil_dominante: 'D' };
  const montar = (semanaAtual = 1) => criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? EMP : null),
    lista: (tabela) => {
      if (tabela === 'fase4_envios') return [{ colaborador_id: 'c1', semana_atual: semanaAtual, status: 'ativo', ultima_pilula1_em: null, ultima_pilula2_em: null, ultima_evidencia_em: null }];
      if (tabela === 'trilhas') return [{ id: 't1', colaborador_id: 'c1', status: 'ativa', numero_temporada: 1, temporada_plano: PLANO_ONBOARDING, competencia_foco: 'Comp A', data_inicio: DATA_INICIO }];
      if (tabela === 'temporada_semana_progresso') return [{ trilha_id: 't1', colaborador_id: 'c1', semana: 1, status: 'concluido', reflexao: null, feedback: null }];
      return [];
    },
  });

  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('na semana do mapeamento ninguém recebe "conteúdo da semana": o motivo diz que não há o que anunciar', async () => {
    vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));
    const lote = await prepararLoteTemplate(montar().client, { empresaId: 'emp-1', template: 'conteudo_semana', colabs: [colab] });
    expect(lote.alvos).toHaveLength(0);
    expect(lote.excluidos).toContainEqual(expect.objectContaining({ motivo: expect.stringContaining('semana de mapeamento'), quantidade: 1 }));
  });

  it('depois que a semana 2 abre, a mesma pessoa entra no lote, apontando para a semana 2', async () => {
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    // O relógio gravado já está na 2: a quinta da semana do mapeamento o avançou (ver o cron).
    const lote = await prepararLoteTemplate(montar(2).client, { empresaId: 'emp-1', template: 'conteudo_semana', colabs: [colab] });
    expect(lote.alvos).toHaveLength(1);
    expect(lote.alvos[0].params[1]).toBe('2');
    expect(lote.alvos[0].params[3]).toBe('https://escola.vertho.ai/dashboard/temporada/semana/2');
  });
});
