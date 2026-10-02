'use server';

import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { colunasDePreferencias, FORMATOS_PREFERENCIA, N_FORMATOS } from '@/lib/access-gates';

/**
 * Preferências de aprendizagem já gravadas da PESSOA DA SESSÃO — para a tela abrir
 * pré-carregada. Sem parâmetro: a identidade vem da sessão, nunca do cliente.
 */
export async function getMinhasPreferenciasAprendizagem() {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };

    const colab = await findColabByEmail(email, 'id, empresa_id');
    if (!colab) return { error: 'Colaborador não encontrado' };

    // tenantDb injeta o filtro de empresa: a leitura nunca sai do tenant da sessão.
    const tdb = tenantDb((colab as any).empresa_id);
    const { data, error } = await tdb.from('colaboradores')
      .select(FORMATOS_PREFERENCIA.map(f => f.coluna).join(', '))
      .eq('id', (colab as any).id)
      .maybeSingle();
    if (error) return { error: error.message };

    const prefs: Record<string, number> = {};
    for (const f of FORMATOS_PREFERENCIA) {
      const v = Number((data as any)?.[f.coluna]);
      prefs[f.id] = Number.isInteger(v) && v >= 1 && v <= N_FORMATOS ? v : 0;
    }
    return { prefs };
  } catch (err: any) {
    console.error('[getMinhasPreferenciasAprendizagem]', err);
    return { error: err?.message || 'Erro ao carregar preferências' };
  }
}

/**
 * Grava SÓ as 8 colunas `pref_*` da pessoa da sessão. Não toca em DISC nem em
 * nada do mapeamento comportamental — quem usa o DISC nativo segue gravando as
 * preferências junto dele (`salvarPerfilComportamental`).
 *
 * Aceita qualquer colaborador autenticado: é dado da própria pessoa, e quem
 * decide QUANDO pedir é `precisaPreferenciasAprendizagem` (lado do assessment).
 */
export async function salvarPreferenciasAprendizagem(prefs: Record<string, number>) {
  try {
    const colunas = colunasDePreferencias(prefs);
    if (!colunas) return { success: false, error: 'Ordene todos os formatos, sem repetir posição.' };

    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { success: false, error: 'Não autenticado' };

    const colab = await findColabByEmail(email, 'id, empresa_id');
    if (!colab) return { success: false, error: 'Colaborador não encontrado' };

    const tdb = tenantDb((colab as any).empresa_id);
    const { error } = await tdb.from('colaboradores')
      .update(colunas)
      .eq('id', (colab as any).id);
    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err: any) {
    console.error('[salvarPreferenciasAprendizagem]', err);
    return { success: false, error: err?.message || 'Erro ao salvar preferências' };
  }
}
