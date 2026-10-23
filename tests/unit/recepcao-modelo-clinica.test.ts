/**
 * Pacote de clínicas (onlabel, 23/10/2026): cada secretária treina num modelo de clínica do simulador
 * (`colaboradores.recepcao_modelo`, mig 297) e vê só os casos daquele modelo (`conteudo.modelo`).
 *
 * O que este teste guarda:
 *  - a LISTA e o INÍCIO por id seguem a mesma regra (o início é um endpoint: filtrar só a lista
 *    deixaria o caso de outro modelo ao alcance de quem mandasse o id);
 *  - quem não tem modelo vê só os casos sem modelo, então os tenants de hoje não mudam;
 *  - a plataforma (teste administrativo e edição) vê todos.
 * Banco em memória sobre o mock oficial, com os filtros de caminho JSON reais.
 */
import { describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria } from '../helpers/tabelas-em-memoria';

vi.mock('@/lib/permissions', () => ({ can: async () => true }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => { throw new Error('sem banco no teste'); } }));

import { catalogo, cenarioPublicado } from '@/lib/recepcao/cenarios';
import { catalogoInicial } from '@/lib/recepcao/catalogo';

const EMPRESA = '10000000-0000-4000-8000-000000000001';

function caso(id: string, modelo?: string) {
  const conteudo: any = structuredClone(catalogoInicial[0]);
  if (modelo) conteudo.modelo = modelo;
  return { id, empresa_id: null, estado: 'publicado', versao: '1', revisao: 0, created_at: '2026-10-20T12:00:00Z', conteudo };
}
const LINHAS = [caso('sem-modelo'), caso('caso-alfa', 'alfa'), caso('caso-beta', 'beta')];

const ctx = (opts: { modelo?: string | null; plataforma?: boolean }) => ({
  empresaId: EMPRESA,
  dominio: 'recepcao_medica',
  sb: bancoEmMemoria({ recepcao_cenarios: structuredClone(LINHAS) }).client,
  auth: { isPlatformAdmin: !!opts.plataforma, role: 'colaborador' },
  modeloDaPessoa: opts.modelo ?? null,
  filtraModelo: !opts.plataforma,
}) as any;

const ids = (rows: any[]) => rows.map((r) => r.id).sort();

describe('simulador por modelo de clínica', () => {
  it('quem tem modelo vê na lista só os casos do modelo dele', async () => {
    expect(ids(await catalogo(ctx({ modelo: 'alfa' })))).toEqual(['caso-alfa']);
  });

  it('quem não tem modelo vê só os casos sem modelo (os tenants de hoje não mudam)', async () => {
    expect(ids(await catalogo(ctx({ modelo: null })))).toEqual(['sem-modelo']);
  });

  it('o início por id recusa o caso de OUTRO modelo, e também o caso sem modelo', async () => {
    await expect(cenarioPublicado(ctx({ modelo: 'alfa' }), 'caso-beta')).rejects.toMatchObject({ status: 404 });
    await expect(cenarioPublicado(ctx({ modelo: 'alfa' }), 'sem-modelo')).rejects.toMatchObject({ status: 404 });
    expect((await cenarioPublicado(ctx({ modelo: 'alfa' }), 'caso-alfa')).id).toBe('caso-alfa');
  });

  it('o início por id recusa a quem não tem modelo um caso que tem modelo', async () => {
    await expect(cenarioPublicado(ctx({ modelo: null }), 'caso-alfa')).rejects.toMatchObject({ status: 404 });
    expect((await cenarioPublicado(ctx({ modelo: null }), 'sem-modelo')).id).toBe('sem-modelo');
  });

  it('a plataforma vê e inicia todos (teste administrativo)', async () => {
    expect(ids(await catalogo(ctx({ plataforma: true })))).toEqual(['caso-alfa', 'caso-beta', 'sem-modelo']);
    expect((await cenarioPublicado(ctx({ plataforma: true }), 'caso-beta')).id).toBe('caso-beta');
  });
});
