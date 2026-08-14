import type { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Publicação de Módulo-Base — núcleo SEM gate.
 *
 * Vive em `lib/` pelo motivo de sempre: num arquivo `'use server'` todo export
 * vira endpoint HTTP, então o núcleo não pode ser exportado de `actions/`. Quem
 * aplica o gate é `aprovarPublicar` (`content.manage`); script e lote chamam
 * daqui. Duplicar esta lógica num script seria criar o SEGUNDO caminho — o
 * padrão que já custou três correções no gêmeo errado.
 *
 * `publicado` é o único status que o resolver da trilha enxerga
 * (`modulo-base-integration.ts` filtra `status = 'publicado'`), e é aqui que
 * nasce o `descritor_embedding` que a seleção semântica usa. Por isso a
 * publicação é também o momento em que a ÂNCORA do módulo vira vetor: gravar o
 * descritor errado antes daqui propaga para toda a seleção de conteúdo.
 */
export async function publicarModuloCore(
  sb: ReturnType<typeof createSupabaseAdmin>,
  email: string,
  id: string,
) {
  const { data } = await sb.from('modulos_base_conteudo')
    .select('status, versao, auditoria_ia, auditado_em_versao, descritor, titulo')
    .eq('id', id).maybeSingle();
  if (!data) return { error: 'Módulo não encontrado' };
  if (data.status !== 'revisao') return { error: `Status atual é ${data.status} — só é possível publicar em revisão` };

  // Dual-IA: a publicação exige aprovação da IA-auditora pra ESTA versão.
  if (!data.auditoria_ia) {
    return { error: 'Auditoria da IA pendente. Submeta pra revisão (dispara a auditoria) ou clique em "Reauditar".' };
  }
  if (data.auditado_em_versao !== data.versao) {
    return { error: 'Módulo foi editado após a última auditoria. Reauditar antes de publicar.' };
  }
  const veredito = (data.auditoria_ia as any)?.veredito;
  if (veredito === 'reprovado') {
    return { error: 'IA-auditora reprovou. Corrija os problemas listados e submeta novamente pra reauditar.' };
  }
  if (veredito !== 'aprovado' && veredito !== 'aprovado_com_ressalvas') {
    return { error: 'Veredito da auditoria inválido — reauditar.' };
  }

  const { error } = await sb.from('modulos_base_conteudo')
    .update({ status: 'publicado', published_by: email, published_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };

  // Embedding do descritor p/ a seleção semântica na trilha (best-effort, não bloqueia).
  try {
    const { embedText } = await import('@/lib/embeddings');
    const emb = await embedText(`${data.descritor || ''} ${data.titulo || ''}`.trim());
    if (emb?.vector) await sb.from('modulos_base_conteudo').update({ descritor_embedding: emb.vector }).eq('id', id);
  } catch (e: any) { console.warn('[publicarModuloCore] embedding falhou:', e?.message); }

  return { ok: true };
}
