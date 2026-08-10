import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * F10 e F15 da auditoria de 09-10/08/2026 — a mesma causa, dois estragos
 * diferentes: o supabase-js **retorna** `{ error }` em vez de lançar, e quem não
 * olha o retorno transforma falha de banco em outra coisa.
 *
 * · **F15 (certificado)** — o pior dos dois, porque não é um erro exibido no
 *   lugar errado: é uma ACUSAÇÃO. `progressos` vinha null, `calcularParticipacao`
 *   recebia `[]`, e quem concluiu as 14 semanas lia
 *   *"Participação abaixo do mínimo (75%)"* com pct 0 — e o RH lia o mesmo.
 *
 * · **F10 (progresso da semana)** — nas duas rotas gêmeas, as de maior churn do
 *   repo. A gravação falhava, a rota respondia 200, a UI dava a semana por
 *   concluída e a seguinte destravava, com o slot desta vazio.
 *
 * Estes testes só são exprimíveis porque o mock passou a saber falhar (F16).
 */

let sb = criarSupabaseMock({});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));

const TRILHA = {
  id: 'tr1', empresa_id: 'emp-A', status: 'concluida', numero_temporada: 1,
  competencia_foco: 'Controle', competencias_foco: ['Controle'], temporada_plano: [],
  programa_modo: 'regular', data_inicio: '2026-01-01', evolution_generated_at: '2026-04-01',
  evolution_report: {},
};

vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => 'ana@x.com',
  requireUserAction: async () => ({ email: 'ana@x.com', colaborador: { id: 'c1', empresa_id: 'emp-A' }, empresaId: 'emp-A', role: 'colaborador', isPlatformAdmin: false }),
}));
vi.mock('@/lib/authz', async (orig) => ({
  ...(await orig<any>()),
  findColabByEmail: async () => ({ id: 'c1', empresa_id: 'emp-A', nome_completo: 'Ana', cargo: 'Prof', email: 'ana@x.com' }),
  getUserContext: async () => ({ email: 'ana@x.com', colaborador: { id: 'c1', empresa_id: 'emp-A' }, empresaId: 'emp-A', role: 'colaborador', isPlatformAdmin: false }),
}));

import { gravarProgressoSemana, liberarProximaSemana } from '@/lib/season-engine/progresso-semana';

beforeEach(() => { sb = criarSupabaseMock({}); });

describe('F10 — progresso da semana falha ALTO', () => {
  const payload = { trilha_id: 'tr1', empresa_id: 'emp-A', colaborador_id: 'c1', semana: 3, tipo: 'conteudo', status: 'concluido' };

  it('update que falha lança — não segue como se tivesse gravado', async () => {
    sb = criarSupabaseMock({ falhas: [{ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'deadlock detected' }] });
    await expect(gravarProgressoSemana(sb.client, payload, 'prog-1'))
      .rejects.toThrow(/progresso da semana 3|deadlock/i);
  });

  it('insert que falha lança', async () => {
    sb = criarSupabaseMock({ falhas: [{ tabela: 'temporada_semana_progresso', op: 'insert', mensagem: 'violates check constraint' }] });
    await expect(gravarProgressoSemana(sb.client, payload))
      .rejects.toThrow(/progresso da semana 3|constraint/i);
  });

  it('liberar a próxima semana falhando também lança', async () => {
    sb = criarSupabaseMock({ falhas: [{ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'timeout' }] });
    await expect(liberarProximaSemana(sb.client, 'tr1', 4, 'emp-A')).rejects.toThrow(/semana 4|timeout/i);
  });

  it('no caminho feliz, grava e escopa por empresa (tenant-owned)', async () => {
    await gravarProgressoSemana(sb.client, payload, 'prog-1');
    expect(sb.escritas).toHaveLength(1);
    expect(sb.escritas[0].tabela).toBe('temporada_semana_progresso');
  });
});

describe('F15 — certificado não acusa a pessoa por falha de banco', () => {
  it('erro ao ler o progresso NÃO vira "Participação abaixo do mínimo"', async () => {
    sb = criarSupabaseMock({
      resolver: (t) => (t === 'trilhas' ? TRILHA : null),
      falhas: [{ tabela: 'temporada_semana_progresso', op: 'select', mensagem: 'timeout no pool' }],
    });

    const { loadCertificadoData } = await import('@/actions/certificado');
    const r: any = await loadCertificadoData('ana@x.com');

    // O texto que a pessoa lê é o que está em jogo aqui.
    expect(r.error ?? '').not.toMatch(/participação abaixo|75%/i);
    expect(r.motivo).toBe('falha_leitura');
    expect(r.ok).toBeFalsy();
  });

  it('erro ao ler a trilha NÃO vira "Nenhuma trilha encontrada"', async () => {
    sb = criarSupabaseMock({ falhas: [{ tabela: 'trilhas', op: 'select', mensagem: 'connection reset' }] });

    const { loadCertificadoData } = await import('@/actions/certificado');
    const r: any = await loadCertificadoData('ana@x.com');

    expect(r.error ?? '').not.toMatch(/nenhuma trilha encontrada/i);
    expect(r.motivo).toBe('falha_leitura');
  });
});
