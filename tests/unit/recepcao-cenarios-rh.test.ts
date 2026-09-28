/**
 * A-16 da revisão de 27/09/2026: a API de Cenários não entrega ao RH os rascunhos e
 * as versões arquivadas do Catálogo Vertho.
 *
 * `catalogo(c, true)` (a biblioteca de edição) devolvia todos os estados do catálogo
 * a qualquer RH com `content.manage`, inclusive a persona reservada dos rascunhos; só
 * a tela os escondia. Banco em memória sobre o mock oficial, aplicando o `.or()` real.
 */
import { describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria } from '../helpers/tabelas-em-memoria';

vi.mock('@/lib/permissions', () => ({ can: async () => true }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => { throw new Error('sem banco no teste'); } }));

import { catalogo } from '@/lib/recepcao/cenarios';
import { catalogoInicial } from '@/lib/recepcao/catalogo';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const OUTRA = '10000000-0000-4000-8000-000000000002';
const linha = (id: string, empresa_id: string | null, estado: string) => ({
  id, empresa_id, estado, versao: '1', revisao: 0, created_at: '2026-09-20T12:00:00Z', conteudo: structuredClone(catalogoInicial[0]),
});
const LINHAS = [
  linha('global-publicado', null, 'publicado'),
  linha('global-rascunho', null, 'rascunho'),
  linha('global-arquivado', null, 'arquivado'),
  linha('empresa-publicado', EMPRESA, 'publicado'),
  linha('empresa-rascunho', EMPRESA, 'rascunho'),
  linha('empresa-arquivado', EMPRESA, 'arquivado'),
  linha('outra-publicado', OUTRA, 'publicado'),
];
const ctx = (isPlatformAdmin: boolean) =>
  ({ empresaId: EMPRESA, dominio: 'recepcao_medica', sb: bancoEmMemoria({ recepcao_cenarios: structuredClone(LINHAS) }).client, auth: { isPlatformAdmin, role: 'rh' } }) as any;
const ids = (rows: any[]) => rows.map((r) => r.id).sort();

describe('A-16: biblioteca de cenários por quem pede', () => {
  it('RH: as versões da própria empresa em qualquer estado, e do Catálogo só as publicadas', async () => {
    expect(ids(await catalogo(ctx(false), true))).toEqual(['empresa-arquivado', 'empresa-publicado', 'empresa-rascunho', 'global-publicado']);
  });

  it('plataforma (quem edita o Catálogo): continua vendo rascunhos e arquivados do Catálogo', async () => {
    expect(ids(await catalogo(ctx(true), true))).toEqual([
      'empresa-arquivado', 'empresa-publicado', 'empresa-rascunho', 'global-arquivado', 'global-publicado', 'global-rascunho',
    ]);
  });

  it('quem treina: só publicados, da empresa e do Catálogo', async () => {
    expect(ids(await catalogo(ctx(false), false))).toEqual(['empresa-publicado', 'global-publicado']);
  });
});
