import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O painel interno da Vertho lista as avaliações acumuladas de QUALQUER formato
 * (R-127, 04/10/2026), e não só as da semana 13.
 *
 * Medido em 04/10/2026: das acumuladas gravadas no banco, **0** estavam na
 * semana 13 (11 na semana 8, 1 na 2), então o painel mostrava uma lista vazia
 * com 12 leituras existindo. A acumulada mora na semana 13 só no formato de 14
 * semanas, e o filtro `semana = 13` escondia todas as outras.
 *
 * Mutação: ver o relatório do lote 11.
 */

const h = vi.hoisted(() => ({ sb: null as any }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => h.sb.client }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: async () => ({}) }));
vi.mock('@/actions/avaliacao-acumulada', () => ({ gerarAvaliacaoAcumulada: async () => ({}) }));

import { listarAvaliacoesAcumuladas } from '@/app/admin/vertho/avaliacao-acumulada/actions';
import { resumirAcumulado } from '@/lib/season-engine/acumulado-resumo';

const LINHA = (id: string, semana: number, acumulado: any) => ({
  id, trilha_id: `t-${id}`, colaborador_id: `c-${id}`, empresa_id: 'e1', semana, concluido_em: '2026-09-20T12:00:00Z',
  feedback: acumulado === undefined ? {} : { acumulado },
  colaboradores: { nome_completo: `Pessoa ${id}`, cargo: 'Professor' },
  empresas: { nome: 'Escola' },
  trilhas: { competencia_foco: 'Planejamento', numero_temporada: 1 },
});

const SIMPLES = { gerado_em: '2026-09-20T12:00:00Z', primaria: { nota_media_acumulada: 2.4 }, auditoria: { status: 'aprovado', nota_auditoria: 92, alertas: ['a1'] } };

describe('listarAvaliacoesAcumuladas: filtra pelo conteúdo, não pela semana 13', () => {
  let linhas: any[] = [];
  beforeEach(() => {
    linhas = [LINHA('jornada', 6, SIMPLES), LINHA('onb', 8, { parcial: true, por_competencia: [] }), LINHA('duo', 13, SIMPLES)];
    h.sb = criarSupabaseMock({ lista: (tabela) => (tabela === 'temporada_semana_progresso' ? linhas : []) });
  });

  it('não restringe a semana 13 e pede só quem tem `feedback.acumulado`', async () => {
    await listarAvaliacoesAcumuladas({});
    const eqs = h.sb.chamadas.filter((c: any) => c.metodo === 'eq').map((c: any) => c.args);
    expect(eqs.some((a: any[]) => a[0] === 'semana')).toBe(false);
    const nots = h.sb.chamadas.filter((c: any) => c.metodo === 'not').map((c: any) => c.args);
    expect(nots).toContainEqual(['feedback->acumulado', 'is', null]);
  });

  it('devolve as linhas de todas as semanas, com a semana e o tipo da leitura', async () => {
    const r: any = await listarAvaliacoesAcumuladas({});
    expect(r.ok).toBe(true);
    expect(r.rows.map((x: any) => [x.id, x.semana, x.tipo])).toEqual([
      ['jornada', 6, 'simples'], ['onb', 8, 'parcial'], ['duo', 13, 'simples'],
    ]);
  });

  it('o filtro por empresa continua valendo', async () => {
    await listarAvaliacoesAcumuladas({ empresaId: 'e1' });
    expect(h.sb.chamadas.some((c: any) => c.metodo === 'eq' && c.args[0] === 'empresa_id' && c.args[1] === 'e1')).toBe(true);
  });

  it('erro do banco volta como erro, não como lista vazia', async () => {
    h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await listarAvaliacoesAcumuladas({});
    expect(r.error).toContain('timeout no pool');
  });
});

describe('resumirAcumulado: as três formas do payload', () => {
  it('simples (Jornada, single, piloto): lê a primária e a auditoria como sempre', () => {
    expect(resumirAcumulado(SIMPLES)).toMatchObject({
      tipo: 'simples', notaMedia: 2.4, auditoriaNota: 92, auditoriaStatus: 'aprovado', alertas: ['a1'],
    });
  });

  it('simples sem auditoria: "sem_auditoria"; sem payload: "nao_gerado"', () => {
    expect(resumirAcumulado({ primaria: { nota_media_acumulada: 2 } }).auditoriaStatus).toBe('sem_auditoria');
    expect(resumirAcumulado(null).auditoriaStatus).toBe('nao_gerado');
    expect(resumirAcumulado(undefined).auditoriaStatus).toBe('nao_gerado');
  });

  it('multi (DUO): nota média das competências e o PIOR veredito', () => {
    const r = resumirAcumulado({
      multi: true,
      por_competencia: [
        { competencia: 'A', primaria: { nota_media_acumulada: 2 }, auditoria: { status: 'aprovado', nota_auditoria: 90, alertas: [] } },
        { competencia: 'B', primaria: { nota_media_acumulada: 3 }, auditoria: { status: 'revisar', nota_auditoria: 60, alertas: ['x'] } },
      ],
    });
    expect(r.tipo).toBe('multi');
    expect(r.notaMedia).toBe(2.5);
    expect(r.auditoriaNota).toBe(75);
    expect(r.auditoriaStatus).toBe('revisar');
    expect(r.alertas).toEqual(['x']);
  });

  it('multi com uma competência SEM auditoria: não mostra "aprovado" por uma parte só', () => {
    const r = resumirAcumulado({
      multi: true,
      por_competencia: [
        { competencia: 'A', primaria: { nota_media_acumulada: 2 }, auditoria: { status: 'aprovado', nota_auditoria: 90 } },
        { competencia: 'B', primaria: { nota_media_acumulada: 3 } },
      ],
    });
    expect(r.auditoriaStatus).toBe('sem_auditoria');
  });

  it('multi com competência que FALHOU: ela fica fora da média e não vira nota', () => {
    const r = resumirAcumulado({
      multi: true,
      por_competencia: [
        { competencia: 'A', primaria: { nota_media_acumulada: 2 }, auditoria: { status: 'aprovado', nota_auditoria: 90 } },
        { competencia: 'B', error: 'Falha na 1ª IA' },
      ],
    });
    expect(r.notaMedia).toBe(2);
    expect(r.auditoriaStatus).toBe('aprovado');
  });

  it('parcial (missão do Onboarding): média das competências, sempre "sem auditoria" (só a 1ª IA, por desenho)', () => {
    const r = resumirAcumulado({
      parcial: true, competencias: ['A', 'B'],
      por_competencia: [
        { competencia: 'A', primaria: { nota_media_acumulada: 1.8 } },
        { competencia: 'B', primaria: { nota_media_acumulada: 2.2 } },
      ],
    });
    expect(r.tipo).toBe('parcial');
    expect(r.notaMedia).toBe(2);
    expect(r.auditoriaStatus).toBe('sem_auditoria');
  });
});
