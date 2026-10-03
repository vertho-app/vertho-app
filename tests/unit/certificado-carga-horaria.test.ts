import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `loadCertificadoData`: a carga horária do certificado.
 *
 * Até 23/09/2026 o PDF imprimia 48h fixas por temporada. Agora a carga é
 * proporcional à duração do PROGRAMA da temporada (48h a cada 14 semanas), lida
 * da config pelo carimbo da trilha, e não do `temporada_plano`: o plano do
 * regular_duo tem 9 entradas para um programa de 14 semanas (medido 22/09).
 * Se a config não resolve, nada é impresso: volta como falha de leitura.
 */

let trilha: any;
const plano = (n: number) => Array.from({ length: n }, (_, i) => ({ semana: i + 1 }));
const progressos = (n: number) => Array.from({ length: n }, (_, i) => ({ semana: i + 1, tipo: 'conteudo', reflexao: { insight: 'x' }, feedback: null }));

let sb = criarSupabaseMock({
  resolver: (t) => {
    if (t === 'trilhas') return trilha;
    if (t === 'empresas') return { nome: 'Escola Teste', ui_config: {}, default_locale: 'pt-BR', sys_config: {} };
    return null;
  },
  lista: (t) => (t === 'temporada_semana_progresso' ? progressos(trilha?.temporada_plano?.length || 0) : []),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/action-context', () => ({ requireUserAction: vi.fn(async () => ({ email: 'ana@escola.test' })) }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ id: 'c1', nome_completo: 'Ana Souza', cargo: 'Professora', empresa_id: 'emp-1' })),
  canViewColabJourney: () => true,
}));

import { loadCertificadoData } from '@/actions/certificado';
import { derivarConfigCustom, montarReportSemFechamento } from '@/lib/season-engine/programa-custom';

const base = (programa_modo: string | null, semanasNoPlano: number, extra: any = {}) => ({
  id: 't1', numero_temporada: 1, competencia_foco: 'Comunicação', competencias_foco: null,
  data_inicio: '2026-08-04', evolution_generated_at: '2026-09-20', status: 'concluida',
  temporada_plano: plano(semanasNoPlano), evolution_report: {}, programa_modo, programa_config: null,
  empresa_id: 'emp-1', ...extra,
});

describe('certificado: carga horária proporcional ao programa', () => {
  beforeEach(() => { sb.reset(); });

  it('Jornada de 7 semanas imprime 24h', async () => {
    trilha = base('jornada', 7);
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.ok).toBe(true);
    expect(r.cargaHoraria).toBe(24);
  });

  it('programa de 14 semanas (DUO) imprime 48h mesmo com o plano de 9 entradas', async () => {
    trilha = base('regular_duo', 9);
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.ok).toBe(true);
    expect(r.cargaHoraria).toBe(48);
  });

  /**
   * Personalizado = programa completo desde 03/10/2026: emite certificado (antes
   * herdava a regra da degustação) e a carga sai da duração do SNAPSHOT da
   * trilha, que é a da competência daquela trilha (com 2 competências, cada
   * trilha tem o seu certificado).
   */
  it('Personalizado de 6 semanas COM fechamento (7 no calendário) imprime 24h, como a Jornada', async () => {
    const cfg = derivarConfigCustom({ semanas: 6, numCompetencias: 2, fechamento: true });
    trilha = base('custom', 7, { programa_config: JSON.parse(JSON.stringify(cfg)), evolution_report: { descritores: [] } });
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.ok).toBe(true);
    expect(r.cargaHoraria).toBe(24);
  });

  it('Personalizado de 3 semanas SEM fechamento: certificado emitido (não é piloto), 10h', async () => {
    const cfg = derivarConfigCustom({ semanas: 3, numCompetencias: 1, fechamento: false });
    trilha = base('custom', 3, {
      programa_config: JSON.parse(JSON.stringify(cfg)),
      evolution_report: montarReportSemFechamento({ competencia_foco: 'Comunicação', descritores_selecionados: [{ descritor: 'D1', nota_atual: 2 }] }),
    });
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.motivo).not.toBe('piloto');
    expect(r.ok).toBe(true);
    expect(r.cargaHoraria).toBe(10); // 48 × 3 / 14 = 10,3
  });

  it('a config gravada da unianchieta (1 semana, sem fechamento) imprime 3h', async () => {
    const cfg = derivarConfigCustom({ semanas: 1, numCompetencias: 1, fechamento: false });
    trilha = base('custom', 1, { programa_config: JSON.parse(JSON.stringify(cfg)), evolution_report: montarReportSemFechamento({ descritores_selecionados: [] }) });
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.ok).toBe(true);
    expect(r.cargaHoraria).toBe(3);
  });

  it('REGRESSÃO: o Piloto (descontinuado, segue no motor) continua sem certificado', async () => {
    trilha = base('piloto', 3, { evolution_report: { modo: 'piloto', descritores: [] } });
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.ok).toBeUndefined();
    expect(r.motivo).toBe('piloto');
  });

  it('Personalizado sem snapshot e sem config na empresa: falha de leitura, nenhum número impresso', async () => {
    trilha = base('custom', 4);
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.ok).toBeUndefined();
    expect(r.motivo).toBe('falha_leitura');
    expect(r.error).toMatch(/carga horária/);
    expect(r.cargaHoraria).toBeUndefined();
  });
});
