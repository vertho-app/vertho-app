/**
 * V-6 da revisão de 27/09/2026: "Teste administrativo" saía de
 * `colaborador_id IS NULL`, e a exclusão legada de um colaborador só zera
 * `colaborador_id` na sessão PACE. O treino real da pessoa desvinculada virava
 * teste do admin na lista e no CSV. O rótulo passa a vir do dono do treino
 * (`owner_key` 'admin:…'), no TS e na função SQL de exportação (mig 271).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLUNAS_HISTORICO_PARTICIPANTE, ehTesteAdmin, paginaDeHistorico } from '@/lib/simulador-vendas/historico';

const linha = (colaborador_id: string | null, owner_key?: string) => ({
  id: '30000000-0000-4000-8000-000000000001',
  created_at: '2026-09-20T10:00:00Z',
  colaborador_id,
  ...(owner_key !== undefined ? { owner_key } : {}),
  resumo: {
    status: 'concluida' as const,
    nivel: 1 as const,
    nome: 'X',
    nomeVendedor: 'Ana Real',
    nota: 3,
    temRelatorio: true,
    versaoRegua: 'pace-7',
  },
});

describe('V-6: teste administrativo pelo dono do treino', () => {
  it('pessoa desvinculada (colaborador_id nulo por exclusão legada) NÃO vira teste do admin', () => {
    const [item] = paginaDeHistorico([linha(null, 'colab:ana')], 50).historico;
    expect(item.testeAdmin).toBe(false);
    expect(item.nomeVendedor).toBe('Ana Real');
  });

  it('treino criado por administrador da plataforma é teste administrativo', () => {
    expect(paginaDeHistorico([linha(null, 'admin:42')], 50).historico[0].testeAdmin).toBe(true);
    expect(ehTesteAdmin({ owner_key: 'colab:ana', colaborador_id: 'ana' })).toBe(false);
  });

  it('o dono não vai ao navegador, só o rótulo', () => {
    const [item] = paginaDeHistorico([linha('ana', 'colab:ana')], 50).historico;
    expect(item).not.toHaveProperty('owner_key');
  });

  it('linha sem owner_key (RPC da equipe antes da mig 271) mantém a regra anterior', () => {
    expect(paginaDeHistorico([linha(null)], 50).historico[0].testeAdmin).toBe(true);
    expect(paginaDeHistorico([linha('ana')], 50).historico[0].testeAdmin).toBe(false);
  });

  it('o histórico do participante lê o dono', () => {
    expect(COLUNAS_HISTORICO_PARTICIPANTE.split(',')).toContain('owner_key');
  });
});

describe('V-6: migration 271 (SQL)', () => {
  const dir = path.resolve(__dirname, '../../migrations');
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  /** A definição que vale é a da última migration que cria a função. */
  const ultimaDefinicao = (funcao: string) => {
    const re = new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${funcao}\\(`);
    const donos = arquivos.filter((f) => re.test(readFileSync(path.join(dir, f), 'utf8')));
    const sql = readFileSync(path.join(dir, donos.at(-1)!), 'utf8');
    const ini = sql.search(re);
    return { arquivo: donos.at(-1)!, corpo: sql.slice(ini, sql.indexOf('$$;', ini)) };
  };

  it('a exportação rotula pelo dono, não pela ausência de colaborador', () => {
    const { arquivo, corpo } = ultimaDefinicao('sim_vendas_exportar');
    expect(arquivo).toMatch(/^271-/);
    expect(corpo).toMatch(/'testeAdmin',\s*owner_key LIKE 'admin:%'/);
    expect(corpo).not.toMatch(/'testeAdmin',\s*colaborador_id IS NULL/);
    // O recorte por equipe continua o mesmo.
    expect(corpo).toContain('p_colaboradores IS NULL OR colaborador_id=ANY(p_colaboradores)');
  });

  it('o histórico da equipe devolve o dono para o servidor derivar o rótulo', () => {
    const { arquivo, corpo } = ultimaDefinicao('sim_vendas_historico_equipe');
    expect(arquivo).toMatch(/^271-/);
    expect(corpo).toMatch(/RETURNS TABLE\([^)]*owner_key text/);
    expect(corpo).toContain('s.owner_key');
  });

  it('é idempotente e mantém os privilégios só para service_role', () => {
    const sql = readFileSync(path.join(dir, arquivos.find((f) => f.startsWith('271-'))!), 'utf8');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.sim_vendas_historico_equipe(uuid,uuid[],timestamptz,uuid);');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.sim_vendas_exportar(');
    for (const f of ['sim_vendas_exportar(uuid,uuid[],timestamptz,timestamptz)', 'sim_vendas_historico_equipe(uuid,uuid[],timestamptz,uuid)']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC,anon,authenticated;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${f} TO service_role;`);
    }
  });
});
