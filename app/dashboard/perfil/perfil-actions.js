'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { AVATAR_PRESETS } from '@/lib/avatar-presets';

/**
 * Carrega dados do perfil do colaborador.
 */
export async function loadPerfil(email) {
  if (!email) return { error: 'Nao autenticado' };

  const colab = await findColabByEmail(
    email,
    'id, nome_completo, email, cargo, area_depto, empresa_id, role, foto_url, avatar_preset'
  );
  if (!colab) return { error: 'Colaborador nao encontrado' };

  const sb = createSupabaseAdmin();
  const { data: empresa } = await sb.from('empresas')
    .select('nome')
    .eq('id', colab.empresa_id)
    .maybeSingle();

  return {
    colaborador: colab,
    empresaNome: empresa?.nome || '',
  };
}

/**
 * Upload de foto pro bucket `avatars` e grava `foto_url` no colab.
 * Aceita { base64, mime }. Limpa avatar_preset porque foto tem precedência.
 */
export async function salvarFotoPerfil(email, { base64, mime }) {
  try {
    if (!email) return { error: 'Não autenticado' };
    if (!base64) return { error: 'Foto obrigatória' };

    const colab = await findColabByEmail(email, 'id, empresa_id, foto_url');
    if (!colab) return { error: 'Colaborador não encontrado' };

    const sb = createSupabaseAdmin();
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const path = `${colab.empresa_id}/${colab.id}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(base64, 'base64');

    const { error: upErr } = await sb.storage.from('avatars').upload(path, buffer, {
      contentType: mime || 'image/jpeg',
      upsert: true,
    });
    if (upErr) return { error: `Falha ao enviar: ${upErr.message}` };

    const { data: pub } = sb.storage.from('avatars').getPublicUrl(path);
    const url = pub?.publicUrl;

    const { error: updErr } = await sb.from('colaboradores')
      .update({ foto_url: url, avatar_preset: null })
      .eq('id', colab.id);
    if (updErr) return { error: updErr.message };

    // Remove foto anterior do bucket (melhor esforço)
    if (colab.foto_url) {
      const m = colab.foto_url.match(/\/avatars\/([^?]+)/);
      if (m?.[1] && m[1] !== path) {
        try { await sb.storage.from('avatars').remove([m[1]]); } catch {}
      }
    }

    return { success: true, foto_url: url };
  } catch (err) {
    console.error('[salvarFotoPerfil]', err);
    return { error: err?.message || 'Erro ao salvar foto' };
  }
}

/**
 * Salva o avatar preset escolhido (limpa foto_url se existir).
 */
export async function salvarAvatarPreset(email, presetId) {
  try {
    if (!email || !presetId) return { error: 'Dados incompletos' };
    const valid = AVATAR_PRESETS.some(p => p.id === presetId);
    if (!valid) return { error: 'Preset inválido' };

    const colab = await findColabByEmail(email, 'id, foto_url');
    if (!colab) return { error: 'Colaborador não encontrado' };

    const sb = createSupabaseAdmin();
    await sb.from('colaboradores')
      .update({ avatar_preset: presetId, foto_url: null })
      .eq('id', colab.id);

    if (colab.foto_url) {
      const m = colab.foto_url.match(/\/avatars\/([^?]+)/);
      if (m?.[1]) {
        try { await sb.storage.from('avatars').remove([m[1]]); } catch {}
      }
    }

    return { success: true, preset: presetId };
  } catch (err) {
    console.error('[salvarAvatarPreset]', err);
    return { error: err?.message || 'Erro ao salvar avatar' };
  }
}

/**
 * Remove foto/preset, volta pra iniciais.
 */
export async function removerAvatar(email) {
  try {
    if (!email) return { error: 'Não autenticado' };
    const colab = await findColabByEmail(email, 'id, foto_url');
    if (!colab) return { error: 'Colaborador não encontrado' };

    const sb = createSupabaseAdmin();
    await sb.from('colaboradores')
      .update({ avatar_preset: null, foto_url: null })
      .eq('id', colab.id);

    if (colab.foto_url) {
      const m = colab.foto_url.match(/\/avatars\/([^?]+)/);
      if (m?.[1]) {
        try { await sb.storage.from('avatars').remove([m[1]]); } catch {}
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[removerAvatar]', err);
    return { error: err?.message || 'Erro ao remover' };
  }
}
