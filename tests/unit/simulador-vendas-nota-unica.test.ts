/**
 * V-5 da revisão de 27/09/2026: a mesma sessão pace-4/pace-5 tinha duas notas.
 * A devolutiva recalcula pela matriz, incluindo Planejamento
 * (`relatorioPacePublico`); o histórico, a gestão e o CSV convertiam
 * linearmente a média 0 a 10 gravada, que deixa Planejamento de fora. Com
 * plano N1 e conversa N3: 3,25 (Nível 3) na lista, 2,6 (Nível 2) na devolutiva.
 * Aqui as quatro saídas são lidas do mesmo treino e têm de dar a mesma nota.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import {
  avaliacaoMatriz,
  estadoDocumental,
  relatorioDocumental,
} from '../fixtures/simulador-vendas-matriz';
import type { Contexto } from '@/lib/simulador-vendas/access';

let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/lib/simulador-vendas/ai', () => ({ gerador: vi.fn(), snapshotPrompts: vi.fn() }));
import { tenantDb } from '@/lib/tenant-db';
import { pontuarRelatorio } from '@/lib/simulador-vendas/avaliacao';
import { notaPacePublica, relatorioPacePublico } from '@/lib/simulador-vendas/escala';
import { competenciasDaMatriz } from '@/components/simulador-vendas/relatorio-matriz';
import { consultarHistorico } from '@/lib/simulador-vendas/service';
import {
  historicoEquipe,
  linhasDeExportacao,
  relatorioEquipe,
} from '@/lib/simulador-vendas/equipe';

const ID = '30000000-0000-4000-8000-000000000555';

function treinoPace(versao: 'pace-4' | 'pace-5') {
  const s = { ...estadoDocumental(), versaoRegua: versao } as any;
  const matriz = avaliacaoMatriz(3);
  // Plano fraco (Planejamento em N1), conversa em N3.
  for (const d of matriz.descritores) if (d.codigo.startsWith('PL')) d.nivel = 1;
  const bruto: any = { ...relatorioDocumental(), Matriz: matriz, P: 0, A: 0, C: 0, E: 0, Media: 0, Violacoes: [] };
  const gravado = pontuarRelatorio(bruto, s);
  const resumo = {
    status: 'concluida',
    nivel: 1,
    nome: 'Beatriz',
    nomeVendedor: 'Ana',
    nota: gravado.Media,
    temRelatorio: true,
    versaoRegua: versao,
  };
  return { gravado, resumo };
}

const ctx = (admin = false) =>
  ({
    empresaId: 'empresa-a',
    empresaNome: 'Empresa A',
    colaboradorId: 'colab-a',
    ownerKey: 'colab:colab-a',
    soAcompanha: false,
    config: null,
    auth: { isPlatformAdmin: admin, role: admin ? 'colaborador' : 'colaborador', email: 'a@x.com' },
    tdb: tenantDb('empresa-a'),
  }) as unknown as Contexto;

describe.each(['pace-4', 'pace-5'] as const)('V-5: uma nota só para o treino %s com matriz', (versao) => {
  const { gravado, resumo } = treinoPace(versao);
  const linha = {
    id: ID,
    created_at: '2026-09-15T12:00:00Z',
    colaborador_id: 'colab-a',
    owner_key: 'colab:colab-a',
    resumo,
    liberado: 5,
  };
  beforeEach(() => {
    sb = criarSupabaseMock({
      lista: (_t, cols) =>
        cols.includes('matriz:') ? [{ id: ID, matriz: gravado.Matriz }] : cols.includes('PL:') ? [{ id: ID, PL: gravado.PL ?? null }] : [linha],
      resolver: () => ({ id: ID, colaborador_id: 'colab-a', resumo, relatorio: gravado }),
    });
  });

  it('devolutiva, histórico, gestão e CSV mostram a mesma nota', async () => {
    const publico = relatorioPacePublico(gravado, versao)!;
    const devolutiva = competenciasDaMatriz(publico.Matriz!, versao, {
      nome: (c) => c,
      origem: () => '',
    });
    const nota = devolutiva.media.nota!;
    // A conversão linear que a lista usava dava outra nota: o teste mede algo.
    expect(notaPacePublica(gravado.Media, versao)).not.toBeCloseTo(nota, 2);

    const historico = await consultarHistorico(ctx());
    expect(historico.historico[0].nota).toBeCloseTo(nota, 10);

    sb.client.rpc.mockResolvedValue({ data: [linha], error: null });
    const gestao = await historicoEquipe(ctx(true));
    expect(gestao.historico[0].nota).toBeCloseTo(nota, 10);
    expect((await relatorioEquipe(ctx(true), ID)).relatorio!.Media).toBeCloseTo(nota, 10);

    const [csv] = await linhasDeExportacao(ctx(true), [
      {
        id: ID,
        versaoRegua: versao,
        P: gravado.P ?? null,
        A: gravado.A ?? null,
        C: gravado.C ?? null,
        E: gravado.E ?? null,
        Media: gravado.Media ?? null,
      },
    ]);
    expect(csv.Media).toBeCloseTo(nota, 10);
    // As notas por competência do CSV são as da devolutiva, Planejamento incluído.
    for (const c of devolutiva.competencias)
      expect(csv[c.codigo as 'PL' | 'P' | 'A' | 'C' | 'E']).toBe(c.nota);
  });

  it('a leitura da matriz é escopada e falha alto', async () => {
    await consultarHistorico(ctx());
    expect(sb.usou('sim_vendas_sessoes', 'eq', 'owner_key')).toBe(true);
    expect(sb.usou('sim_vendas_sessoes', 'in', 'id')).toBe(true);
    sb.falharEm({ tabela: 'sim_vendas_sessoes', op: 'select', mensagem: 'timeout' });
    await expect(
      linhasDeExportacao(ctx(true), [{ id: ID, versaoRegua: versao, P: 7.5, A: 7.5, C: 7.5, E: 7.5, Media: 7.5 }]),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe('V-5: sem matriz, a conversão linear continua', () => {
  it('pace-3 no CSV sai convertida e sem ler matriz', async () => {
    sb = criarSupabaseMock({ lista: (_t, cols) => (cols.includes('PL:') ? [{ id: ID, PL: null }] : []) });
    const [csv] = await linhasDeExportacao(ctx(true), [
      { id: ID, versaoRegua: 'pace-3', P: 7, A: 6, C: 5, E: 4, Media: 5.5 },
    ]);
    expect(csv).toMatchObject({ Media: notaPacePublica(5.5, 'pace-3'), P: notaPacePublica(7, 'pace-3'), PL: null, escalaOriginal: '0-10' });
    expect(sb.chamadas.some((c) => c.metodo === 'select' && String(c.args[0]).includes('Matriz'))).toBe(false);
  });
});
