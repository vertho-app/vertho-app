import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O escritor do blueprint (`persistBlueprintFromText`) com o histórico (mig 289, 17/10/2026):
 *  - a versão atual vai para `artefatos_jornada_historico` ANTES do upsert, e se o arquivo falha o upsert não acontece
 *    (na Temporada 2 de Ibipeba, regerar apagaria o blueprint da Temporada 1 de 25 pessoas);
 *  - o upsert zera `auditoria`/`auditado_em`: antes, o blueprint novo herdava a auditoria do anterior (que nunca o viu)
 *    e ficava fora da fila de auditoria do Fluxo (`auditado_em == null`).
 */

const h = vi.hoisted(() => ({ sb: null as any }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(), callAIChat: vi.fn() }));

import { persistBlueprintFromText } from '@/lib/blueprint/core';

const ATUAL = {
  id: 'bp1', blueprint: { competencias: [{ nome: 'Planejamento' }] }, spec_version: 1,
  auditoria: { ok: true }, auditado_em: '2026-10-02T13:00:00Z', gerado_em: '2026-10-02T12:19:04Z',
};
const TEXTO = JSON.stringify({
  competencias: [{ nome: 'Comunicação', nivel_atual: 'N1', objetivos_30_dias: [] }],
  trilha: { semanas: [{ semana: 1, descritor: 'Escuta ativa', conexao_com_pdi: ['objetivo 1'] }] },
});
const FOCO = [{ nome: 'Comunicação', nivel: 1, nota_decimal: 1.5, descritores: [] }];

let atual: any;
beforeEach(() => {
  atual = ATUAL;
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => (tabela === 'development_blueprints' ? atual : { id: 'bp1' }),
  });
});

const escritasEm = (tabela: string) => h.sb.escritas.filter((e: any) => e.tabela === tabela);

describe('persistBlueprintFromText com histórico', () => {
  it('arquiva a versão atual ANTES de sobrescrever, e o upsert zera a auditoria', async () => {
    const r = await persistBlueprintFromText('e1', 'c1', FOCO as any, TEXTO);
    expect(r.error, r.error).toBeUndefined();
    const ordem = h.sb.escritas.map((e: any) => e.tabela);
    expect(ordem).toEqual(['artefatos_jornada_historico', 'development_blueprints']);
    expect(escritasEm('artefatos_jornada_historico')[0].payload).toMatchObject({
      tipo: 'blueprint', origem_id: 'bp1', conteudo: ATUAL.blueprint, gerado_em: ATUAL.gerado_em, auditoria: { ok: true },
    });
    const novo = escritasEm('development_blueprints')[0].payload;
    expect(novo.auditoria).toBeNull();
    expect(novo.auditado_em).toBeNull();
    expect(novo.blueprint.competencias[0].nome).toBe('Comunicação');
  });

  it('sem versão atual (1ª geração): só o upsert', async () => {
    atual = null;
    const r = await persistBlueprintFromText('e1', 'c1', FOCO as any, TEXTO);
    expect(r.error, r.error).toBeUndefined();
    expect(h.sb.escritas.map((e: any) => e.tabela)).toEqual(['development_blueprints']);
  });

  it('🔴 o histórico falha: o blueprint atual NÃO é sobrescrito', async () => {
    h.sb.falharEm({ tabela: 'artefatos_jornada_historico', op: 'upsert', mensagem: 'relation does not exist' });
    const r = await persistBlueprintFromText('e1', 'c1', FOCO as any, TEXTO);
    expect(r.error).toMatch(/não arquivei o blueprint atual/);
    expect(escritasEm('development_blueprints')).toEqual([]);
  });
});
