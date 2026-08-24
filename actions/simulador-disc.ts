'use server';

import { tenantDb } from '@/lib/tenant-db';
import { requireAdminAction } from '@/lib/auth/action-context';
import { gerarMapeamentoSimulado } from '@/lib/disc-simulador';

/**
 * Simula o mapeamento comportamental DISC de colaboradores que ainda não fizeram.
 *
 * Útil pra testes e demos — NÃO substitui o mapeamento real. O que ele grava,
 * porém, tem que ser INDISTINGUÍVEL em estrutura do que o mapeamento real grava:
 * mesma soma (200), mesmas fórmulas derivadas (liderança = DISC/2, competências
 * pela regressão canônica) e mesmo formato de perfil (combo de todas as letras
 * ≥ 50). As fórmulas ficam em `lib/disc-simulador` + `lib/disc-mapeamento`, que
 * são a MESMA fonte usada pela tela do mapeamento — esta action só orquestra.
 */
export async function simularMapeamentoDISCLote(empresaId: string) {
  await requireAdminAction('ai.audit.regenerate');
  try {
    if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
    const tdb = tenantDb(empresaId);

    const { data: colabs, error: erroLeitura } = await tdb.from('colaboradores')
      .select('id, nome_completo, perfil_dominante')
      .is('perfil_dominante', null);

    // supabase-js RETORNA o erro, não lança: sem esta checagem uma falha de
    // leitura viraria "todos já têm mapeamento".
    if (erroLeitura) return { success: false, error: erroLeitura.message };
    if (!colabs?.length) return { success: true, message: 'Todos já têm mapeamento DISC', simulados: 0 };

    let simulados = 0;
    const falhas: string[] = [];
    for (const colab of colabs) {
      const { error } = await tdb.from('colaboradores')
        .update(gerarMapeamentoSimulado()).eq('id', colab.id);
      if (error) falhas.push(`${colab.nome_completo || colab.id}: ${error.message}`);
      else simulados++;
    }

    return {
      success: true,
      message: `${simulados} colaboradores com mapeamento DISC simulado${falhas.length ? ` · ${falhas.length} falha(s)` : ''}`,
      simulados,
      falhas,
    };
  } catch (err) {
    console.error('[VERTHO] simularMapeamentoDISCLote:', err);
    return { success: false, error: err?.message };
  }
}
