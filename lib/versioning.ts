import { createSupabaseAdmin } from './supabase';
import { createHash } from 'crypto';

/**
 * Registra ou reutiliza uma versão de prompt.
 * Dedup por hash — se o mesmo prompt já foi registrado, retorna o existente.
 *
 * @param {string} tipo - Tipo do prompt ('conversa_fase3', 'avaliacao_ia4', etc.)
 * @param {string} modelo - Modelo de IA usado ('claude-sonnet-4-6', etc.)
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
    .select('versao_regua')
    .eq('id', competenciaId)
    .single();

  const novaVersao = (data?.versao_regua || 1) + 1;

  await sb.from('competencias')
    .update({ versao_regua: novaVersao })
    .eq('id', competenciaId);

  return novaVersao;
}
