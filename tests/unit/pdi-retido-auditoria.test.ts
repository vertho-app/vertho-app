import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { pdiRetidoPelaAuditoria, CORTE_RETENCAO_PDI_REPROVADO } from '@/lib/relatorios/pdi-retido';

/**
 * R-60 (revisão de 02/10/2026): o PDI reprovado pela 2ª IA aparecia para a pessoa
 * em /dashboard/pdi, saía em PDF e era anunciado por WhatsApp. Agora, gerado a
 * partir do corte, fica retido ("em preparação") até ser regerado. Os 47 já
 * entregues em Macaé não somem (decisão do dono, no relatório do lote).
 */
const DEPOIS = '2026-10-05T12:00:00.000Z';
const ANTES = '2026-09-20T12:00:00.000Z';

describe('pdiRetidoPelaAuditoria', () => {
  it('reprovado (fail) gerado depois do corte: retido', () => {
    expect(pdiRetidoPelaAuditoria({ auditoria: { status: 'fail' } }, DEPOIS)).toBe(true);
  });
  it('reprovado ANTES do corte (já entregue): não some', () => {
    expect(pdiRetidoPelaAuditoria({ auditoria: { status: 'fail' } }, ANTES)).toBe(false);
  });
  it('alerta, aprovado ou sem auditoria: segue visível', () => {
    for (const status of ['warn', 'pass', undefined]) {
      expect(pdiRetidoPelaAuditoria({ auditoria: status ? { status } : undefined }, DEPOIS)).toBe(false);
    }
  });
  it('conteúdo em texto (JSON gravado como string) também é lido', () => {
    expect(pdiRetidoPelaAuditoria(JSON.stringify({ auditoria: { status: 'fail' } }), DEPOIS)).toBe(true);
  });
  it('o corte é 03/10/2026 em Brasília', () => {
    expect(CORTE_RETENCAO_PDI_REPROVADO).toBe('2026-10-03T03:00:00.000Z');
  });
});

const estado = { rel: null as any };
const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'relatorios' ? estado.rel : null),
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: vi.fn(async () => ({ id: 'col', empresa_id: 'emp', nome_completo: 'Ana', cargo: 'Professor' })) }));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: vi.fn(async () => 'ana@x.com') }));

import { loadPDI, baixarMeuPdiPdf } from '@/app/dashboard/pdi/pdi-actions';

describe('a tela do PDI da pessoa', () => {
  beforeEach(() => { sb.reset(); });

  it('reprovado depois do corte: "em preparação", sem o conteúdo', async () => {
    estado.rel = { id: 'r1', conteudo: { auditoria: { status: 'fail' }, resumo: 'texto reprovado' }, gerado_em: DEPOIS, pdf_path: 'x.pdf' };
    const r: any = await loadPDI();
    expect(r.pdiAtivo).toBe(false);
    expect(r.concluiuAvaliacao).toBe(true);
    expect(JSON.stringify(r)).not.toContain('texto reprovado');
  });

  it('aprovado: o PDI aparece', async () => {
    estado.rel = { id: 'r1', conteudo: { auditoria: { status: 'pass' } }, gerado_em: DEPOIS, pdf_path: 'x.pdf' };
    const r: any = await loadPDI();
    expect(r.pdiAtivo).toBe(true);
  });

  it('o PDF segue a tela: reprovado não sai', async () => {
    estado.rel = { id: 'r1', conteudo: { auditoria: { status: 'fail' } }, gerado_em: DEPOIS, pdf_path: 'x.pdf', empresa_id: 'emp', colaborador_id: 'col' };
    const r: any = await baixarMeuPdiPdf();
    expect(r.error).toBeTruthy();
    expect(r.url).toBeUndefined();
  });
});

describe('a rota de PDF não é porta dos fundos (guard de fonte)', () => {
  it('a própria pessoa não baixa o PDI retido pelo id', () => {
    const f = readFileSync('app/api/relatorios/pdf/route.ts', 'utf8');
    expect(f).toMatch(/auth\.colaborador\?\.id === rel\.colaborador_id && !auth\.isPlatformAdmin && pdiRetidoPelaAuditoria\(rel\.conteudo, rel\.gerado_em\)/);
  });
});
