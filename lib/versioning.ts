import { createSupabaseAdmin } from './supabase';
import { createHash } from 'crypto';
import { escopoTenantDaLinha } from '@/lib/tenant-predicado';

/**
 * Registra ou reutiliza uma versão de prompt.
 * Dedup por hash — se o mesmo prompt já foi registrado, retorna o existente.
 *
 * @param {string} tipo - Tipo do prompt ('conversa_fase3', 'avaliacao_ia4', etc.)
 * @param {string} modelo - Modelo de IA usado ('claude-sonnet-5', etc.)
 * @param {string} conteudo - Texto completo do system prompt
 * @param {object} metadata - Dados extras (max_tokens, etc.)
 * @returns {string} UUID da versão do prompt
 */
export async function getOrCreatePromptVersion(tipo, modelo, conteudo, metadata = null) {
  const hash = createHash('sha256').update(conteudo).digest('hex');
  const sb = createSupabaseAdmin();

  // Tentar buscar existente
  const { data: existing } = await sb.from('prompt_versions')
    .select('id')
    .eq('tipo', tipo)
    .eq('hash', hash)
    .single();

  if (existing) return existing.id;

  // Criar nova versão
  const { data: nova, error } = await sb.from('prompt_versions')
    .insert({ tipo, hash, modelo, conteudo, metadata })
    .select('id')
    .single();

  if (error) {
    // Race condition: outro request criou entre o select e o insert
    if (error.code === '23505') { // unique_violation
      const { data: retry } = await sb.from('prompt_versions')
        .select('id').eq('tipo', tipo).eq('hash', hash).single();
      return retry?.id || null;
    }
    console.error('[versioning] Erro ao criar prompt_version:', error.message);
    return null;
  }

  return nova.id;
}

/**
 * Incrementa a versão da régua de uma competência.
 * Chamar quando o gabarito for atualizado.
 *
 * @param {string} competenciaId
 * @returns {number} Nova versão
 */
export async function incrementarVersaoRegua(competenciaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('competencias')
    .select('versao_regua, empresa_id')
    .eq('id', competenciaId)
    .single();

  const novaVersao = (data?.versao_regua || 1) + 1;

  // D2: `competencias` é tabela MISTA (empresa + catálogo global). O predicado
  // repete o tenant DA LINHA lida — se o id trocar de tenant entre a leitura e a
  // escrita, casa 0 linhas em vez de versionar a régua alheia.
  await escopoTenantDaLinha(
    sb.from('competencias').update({ versao_regua: novaVersao }).eq('id', competenciaId),
    data,
  );

  return novaVersao;
}
