import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../../helpers/supabase-mock';
import type { Contexto } from '@/lib/simulador-vendas/access';

/**
 * Decisão 5 da revisão de 02/10/2026 (R-42): no Simulador de vendas a equipe
 * recebia as citações LITERAIS do plano da pessoa (evidência com
 * `origem: 'planejamento'`) e as justificativas de Planejamento escritas a
 * partir dele. Agora é como na liderança: a evidência do plano chega sem o
 * texto (fica a fonte e o nível), a justificativa dela fica de fora, e os
 * trechos da CONVERSA seguem citados.
 *
 * A fixture é a matriz de verdade (`relatorioMatriz`), com o texto do plano
 * nas evidências de PL e uma justificativa que o parafraseia: a ausência é
 * provada sobre dado que existe.
 */
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/lib/simulador-vendas/ai', () => ({ gerador: vi.fn(), snapshotPrompts: vi.fn() }));

import { tenantDb } from '@/lib/tenant-db';
import { relatorioEquipe } from '@/lib/simulador-vendas/equipe';
import { relatorioParaEquipe } from '@/lib/simulador-vendas/visao-equipe';
import { competenciasDaMatriz } from '@/components/simulador-vendas/relatorio-matriz';
import { FALA, PLANO, relatorioMatriz } from '../../fixtures/simulador-vendas-matriz';

const EMPRESA = 'empresa-a';
const PARAFRASE = 'Retomou do próprio plano a ideia de confirmar os impactos do estoque';

function relatorioComPlano() {
  const rel: any = relatorioMatriz();
  rel.Matriz.descritores = rel.Matriz.descritores.map((d: any) =>
    d.codigo.startsWith('PL') ? { ...d, justificativa: `${PARAFRASE}: "${PLANO}"` } : d,
  );
  return rel;
}

const contexto = () =>
  ({
    empresaId: EMPRESA,
    empresaNome: 'Fictícia',
    ownerKey: 'colab:gestor',
    tdb: tenantDb(EMPRESA),
    config: { habilitado: true, periodo_inicio: '2020-01-01T00:00:00Z', periodo_fim: '2099-01-01T00:00:00Z' },
    auth: {
      role: 'gestor',
      email: 'gestor@example.test',
      isPlatformAdmin: false,
      empresaId: EMPRESA,
      colaborador: { id: 'gestor', empresa_id: EMPRESA, email: 'gestor@example.test' },
    },
  }) as Contexto;

describe('relatório da equipe no Simulador de vendas (R-42)', () => {
  beforeEach(() => {
    const rel = relatorioComPlano();
    sb = criarSupabaseMock({
      resolver: (t) =>
        t === 'colaboradores'
          ? { id: 'liderada', empresa_id: EMPRESA, gestor_email: 'gestor@example.test' }
          : { id: 's', colaborador_id: 'liderada', resumo: { nomeVendedor: 'Ana', versaoRegua: 'pace-4' }, relatorio: rel },
    });
  });

  it('a fixture tem o plano que o teste diz esconder', () => {
    const texto = JSON.stringify(relatorioComPlano());
    expect(texto).toContain(PLANO);
    expect(texto).toContain(PARAFRASE);
  });

  it('🔴 sai sem o texto do plano e sem a justificativa de Planejamento, com nível e fonte', async () => {
    const r: any = await relatorioEquipe(contexto(), 's');
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(PLANO);
    expect(texto).not.toContain(PARAFRASE);

    const pl = r.relatorio.Matriz.descritores.find((d: any) => d.codigo === 'PL1');
    expect(pl.nivel).toBe(3);
    expect(pl.justificativa).toBeNull();
    expect(pl.evidencias).toEqual([{ origem: 'planejamento', turno: null }]);
  });

  it('trechos da CONVERSA seguem citados, com a justificativa', async () => {
    const r: any = await relatorioEquipe(contexto(), 's');
    expect(JSON.stringify(r)).toContain(FALA);
    const a1 = r.relatorio.Matriz.descritores.find((d: any) => d.codigo === 'A1');
    expect(a1.evidencias[0]).toMatchObject({ origem: 'conversa', turno: 1, citacao: FALA });
    expect(a1.justificativa).toBeTruthy();
  });

  it('relatório sem matriz (anterior à pace-4) passa como está', () => {
    const legado: any = { Resumo: 'x', Recomendacoes: [] };
    expect(relatorioParaEquipe(legado)).toBe(legado);
    expect(relatorioParaEquipe(null)).toBeNull();
  });
});

describe('a tela da equipe não desenha citação vazia', () => {
  const rotulos = {
    nome: (c: string) => c,
    origem: (e: any) => (e.origem === 'planejamento' ? 'Planejamento' : `Conversa · turno ${e.turno}`),
    reservada: () => 'Evidência no planejamento. O texto do plano fica com a pessoa.',
  };

  it('🔴 visão da equipe: o rótulo da fonte no lugar do texto do plano', () => {
    const rel = relatorioParaEquipe(relatorioComPlano());
    const { competencias } = competenciasDaMatriz(rel.Matriz, 'pace-4', rotulos as any);
    const pl1 = competencias.find((c) => c.codigo === 'PL')!.descritores.find((d) => d.codigo === 'PL1')!;
    expect(pl1.evidencias).toEqual([]);
    expect(pl1.justificativa).toBe('Evidência no planejamento. O texto do plano fica com a pessoa.');
    expect(JSON.stringify(competencias)).not.toContain(PLANO);
  });

  it('a devolutiva da PRÓPRIA pessoa continua com o plano citado', () => {
    const { competencias } = competenciasDaMatriz(relatorioComPlano().Matriz, 'pace-4', rotulos as any);
    const pl1 = competencias.find((c) => c.codigo === 'PL')!.descritores.find((d) => d.codigo === 'PL1')!;
    expect(pl1.evidencias).toEqual([{ texto: PLANO, origem: 'Planejamento' }]);
    expect(pl1.justificativa).toContain(PARAFRASE);
  });
});
