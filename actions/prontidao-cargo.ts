'use server';
/**
 * Prontidão para o próximo cargo — "quem, no cargo X, se aproxima do perfil de Y".
 *
 * DUAS DIFERENÇAS DELIBERADAS EM RELAÇÃO À AÇÃO VIZINHA (`ranking-adequacao`):
 *
 * 1. **Esta RECOMPUTA, e a do Ranking nunca.** Lá o snapshot é a garantia de que
 *    dois leitores do mesmo concurso veem a mesma ordem; aqui o par
 *    (origem → alvo) é escolhido na hora e pré-assar todas as combinações
 *    exigiria decidi-las de antemão (4 cargos = 12 pares; 26 cargos = 650). O
 *    preço é dizer na tela QUANDO foi calculado, em vez de fingir ser snapshot.
 *
 * 2. **O gate é o mesmo, e por um motivo mais forte.** A saída nomeia pessoas e
 *    diz quem estaria apto ao cargo de outra pessoa — informação que a própria
 *    avaliada não sabe que existe. `ctxRh` (RH da empresa) para o self-service e
 *    `admin.access` para o preview, exatamente como o Ranking.
 *
 * O cargo vem do CLIENTE, então os dois nomes são validados contra os cargos com
 * gabarito DAQUELE tenant antes de qualquer leitura: um `cargo` livre viraria
 * consulta de pessoas com um filtro escolhido pelo browser.
 */
import { getUserContext } from '@/lib/authz';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { compararProntidao, type Prontidao } from '@/lib/adequacao-cargo/prontidao';

async function ctxRh() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { erro: 'Não autenticado.' as const };
  const ctx = await getUserContext(email);
  if (ctx?.role !== 'rh') return { erro: 'Acesso exclusivo do RH.' as const };
  const empresaId = ctx.empresaId;
  if (!empresaId) return { erro: 'RH sem empresa vinculada.' as const };
  return { empresaId };
}

/**
 * Cargos elegíveis para a comparação: os que TÊM gabarito no tenant.
 *
 * ⚠️ Repare que a régua é diferente da do Ranking, que exige **snapshot gerado**.
 * Aqui basta o gabarito, porque o cálculo é ao vivo — e o cargo ALVO tipicamente
 * não tem snapshot próprio (é para ele que se quer promover alguém). Amarrar
 * esta lista à existência de snapshot esconderia justamente o caso de uso.
 */
async function _listarCargos(sb: any, empresaId: string): Promise<string[]> {
  const { data, error } = await sb.from('cargos_empresa')
    .select('nome, gabarito').eq('empresa_id', empresaId).eq('eh_vaga', false);
  if (error) throw new Error(`não foi possível listar os cargos: ${error.message}`);
  return (data || [])
    .filter((c: any) => c.gabarito?.tela4)
    .map((c: any) => c.nome)
    .sort((a: string, b: string) => a.localeCompare(b));
}

/**
 * ⚠️ Um OBJETO com campos opcionais, e não uma união `{success:true}|{success:false}`:
 * com `strict: false` no tsconfig, união discriminada por booleano NÃO estreita,
 * e o consumidor não consegue ler `.error` sem erro de compilação.
 */
export type RespostaProntidao = { success: boolean; dados?: Prontidao; error?: string };

async function _comparar(sb: any, empresaId: string, cargoOrigem: string, cargoAlvo: string): Promise<RespostaProntidao> {
  if (!cargoOrigem || !cargoAlvo) return { success: false, error: 'Escolha o cargo atual e o cargo de destino.' };
  if (cargoOrigem === cargoAlvo) return { success: false, error: 'Os dois cargos são o mesmo — escolha um destino diferente.' };

  // O nome do cargo vem do browser: só vale se for um cargo com gabarito DESTE
  // tenant. Sem isto, `poolCargos` seria um filtro de pessoas escolhido pelo cliente.
  const validos = await _listarCargos(sb, empresaId);
  if (!validos.includes(cargoOrigem)) return { success: false, error: `O cargo "${cargoOrigem}" não tem perfil ideal nesta empresa.` };
  if (!validos.includes(cargoAlvo)) return { success: false, error: `O cargo "${cargoAlvo}" não tem perfil ideal nesta empresa.` };

  try {
    const dados = await compararProntidao(sb, empresaId, cargoOrigem, cargoAlvo);
    return { success: true, dados };
  } catch (err: any) {
    // `compararProntidao` LANÇA quando a leitura falha (em vez de devolver
    // "ninguém tem DISC"). Aqui a falha vira mensagem, não uma tela de zeros.
    console.error('[prontidao]', err?.message || err);
    return { success: false, error: err?.message || 'Não foi possível calcular a comparação.' };
  }
}

/** Cargos com perfil ideal — RH self-service (empresa da sessão). */
export async function listarCargosParaProntidao(): Promise<{ cargos: string[]; erro?: string }> {
  const g = await ctxRh(); if ('erro' in g) return { cargos: [], erro: g.erro };
  try {
    return { cargos: await _listarCargos(createSupabaseAdmin(), g.empresaId) };
  } catch (err: any) {
    return { cargos: [], erro: err?.message || 'Não foi possível listar os cargos.' };
  }
}

/** Idem — PREVIEW de admin (empresa vem da rota, gated p/ platform_admin). */
export async function listarCargosParaProntidaoAdmin(empresaId: string): Promise<{ cargos: string[]; erro?: string }> {
  const sb = await requireAdminSupabase('admin.access');
  try {
    return { cargos: await _listarCargos(sb, empresaId) };
  } catch (err: any) {
    return { cargos: [], erro: err?.message || 'Não foi possível listar os cargos.' };
  }
}

/** Comparação — RH self-service. */
export async function compararCargos(cargoOrigem: string, cargoAlvo: string): Promise<RespostaProntidao> {
  const g = await ctxRh(); if ('erro' in g) return { success: false, error: g.erro };
  return _comparar(createSupabaseAdmin(), g.empresaId, cargoOrigem, cargoAlvo);
}

/** Comparação — PREVIEW de admin. */
export async function compararCargosAdmin(empresaId: string, cargoOrigem: string, cargoAlvo: string): Promise<RespostaProntidao> {
  const sb = await requireAdminSupabase('admin.access');
  return _comparar(sb, empresaId, cargoOrigem, cargoAlvo);
}
