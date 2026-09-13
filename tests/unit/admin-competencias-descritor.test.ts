import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `salvarDescritor` é a porta que fecha o laço da calibragem: exemplar abaixo
 * do corte → reescreve N3/N4 → reavalia. Aqui se prova o que o gate e o
 * predicado garantem: só colunas de RUBRICA entram no update (a chave do
 * descritor — cod_desc/nome_curto — é imutável, porque as avaliações gravadas
 * apontam para ela por nome), o tenant está na MESMA cadeia (o id vem do
 * browser), nenhum nível pode ser apagado, e falha de banco volta como erro.
 */
let sb = criarSupabaseMock({ escrita: (tabela, op) => (tabela === 'competencias' && op === 'update' ? [{ id: 'd1' }] : null) });
const gate = vi.fn(async () => sb.client);
const auditoria = vi.fn(async (..._args: any[]) => {});

vi.mock('@/lib/admin-supabase', () => ({
  requireEmpresaSupabase: (...args: any[]) => gate(...(args as [])),
  requireAdminSupabase: vi.fn(),
}));
vi.mock('@/lib/auth/action-context', () => ({
  requirePermissionAction: vi.fn(), assertTenantAccessAction: vi.fn(),
  getAuthenticatedEmailFromAction: vi.fn(async () => 'admin@vertho.ai'),
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: (...args: any[]) => auditoria(...(args as [])) }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { salvarDescritor } from '@/app/admin/competencias/actions';

const ID = '11111111-2222-4333-8444-555555555555';

describe('salvarDescritor', () => {
  beforeEach(() => { sb.reset(); gate.mockClear(); auditoria.mockClear(); });

  it('passa pelo gate content.manage da empresa da rota, grava só a rubrica (chave imutável) com tenant na cadeia, e audita', async () => {
    const r = await salvarDescritor('emp-A', ID, {
      n3_meta: ' Define prioridade clara ', n4_referencia: 'Sustenta rotina', descritor_completo: 'Frase',
      // a CHAVE do descritor não entra pela edição — renomear separaria o histórico
      cod_desc: 'GC04_D9', nome_curto: 'Outro nome',
      // nem nada fora da rubrica
      nome: 'NÃO PODE', cargo: 'NÃO PODE', empresa_id: 'emp-B', id: 'outro',
    });
    expect(gate).toHaveBeenCalledWith('emp-A', 'content.manage', 'salvarDescritor');
    expect(r).toEqual({ success: true, message: 'Descritor salvo' });
    const up = sb.escritas.find((e) => e.tabela === 'competencias' && e.op === 'update')!;
    expect(up.payload).toEqual({ n3_meta: 'Define prioridade clara', n4_referencia: 'Sustenta rotina', descritor_completo: 'Frase' });
    expect(sb.usou('competencias', 'eq', 'id')).toBe(true);
    expect(sb.usou('competencias', 'eq', 'empresa_id')).toBe(true);
    expect(auditoria).toHaveBeenCalledTimes(1);
    expect(auditoria.mock.calls[0][0]).toMatchObject({ acao: 'competencias.descritor.editar', empresaId: 'emp-A', alvo: ID });
  });

  it('recusa id inválido, payload sem coluna de rubrica e QUALQUER nível apagado — sem escrever nem auditar', async () => {
    expect(await salvarDescritor('emp-A', 'nao-e-uuid', { n3_meta: 'x' })).toMatchObject({ success: false, error: 'Descritor inválido' });
    expect(await salvarDescritor('emp-A', ID, { nome: 'x', cod_desc: 'y' })).toMatchObject({ success: false, error: 'Nada para salvar' });
    expect((await salvarDescritor('emp-A', ID, { n3_meta: '   ' })).error).toMatch(/N3/);
    expect((await salvarDescritor('emp-A', ID, { n1_gap: '', n4_referencia: ' ' })).error).toMatch(/N1, N4/);
    expect(sb.escritas).toHaveLength(0);
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('linha de outro tenant (update sem retorno) não vira sucesso', async () => {
    sb = criarSupabaseMock({ escrita: () => [] });
    expect(await salvarDescritor('emp-A', ID, { n3_meta: 'x' })).toMatchObject({ success: false, error: 'Descritor não encontrado nesta empresa' });
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('falha do banco volta como erro, não como salvo', async () => {
    sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'competencias', op: 'update', mensagem: 'timeout' });
    expect(await salvarDescritor('emp-A', ID, { n3_meta: 'x' })).toMatchObject({ success: false, error: 'timeout' });
  });
});
