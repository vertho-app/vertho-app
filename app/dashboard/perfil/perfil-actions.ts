'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { AVATAR_PRESETS } from '@/lib/avatar-presets';
import { localeCookieName, normalizeAppLocale } from '@/lib/i18n';

/**
 * Carrega dados do perfil do colaborador.
 */
export async function loadPerfil() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(
    email,
    'id, nome_completo, email, cargo, area_depto, empresa_id, role, foto_url, avatar_preset'
  );
  if (!colab) return { error: 'Colaborador nao encontrado' };

  const sb = createSupabaseAdmin();
  let locale: string | null = null;
  try {
    const { data: localeData } = await sb.from('colaboradores')
      .select('locale')
      .eq('id', colab.id)
      .maybeSingle();
    locale = normalizeAppLocale((localeData as any)?.locale);
  } catch {}

  const { data: empresa } = await sb.from('empresas')
    .select('nome, default_locale')
    .eq('id', colab.empresa_id)
    .maybeSingle();

  return {
    colaborador: { ...colab, locale: locale || normalizeAppLocale((empresa as any)?.default_locale) || 'pt-BR' },
    empresaNome: empresa?.nome || '',
  };
}

/**
 * Salva a preferência de idioma do colaborador.
 * O cookie garante efeito imediato; a coluna `locale` mantém a preferência persistida.
 */
export async function salvarLocalePerfil(localeValue) {
  try {
    const locale = normalizeAppLocale(localeValue);
    if (!locale) return { error: 'Idioma inválido' };

    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    cookieStore.set(localeCookieName, locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });

    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { success: true, locale, persisted: false };

    const colab: any = await findColabByEmail(email, 'id');
    if (!colab) return { success: true, locale, persisted: false };

    const sb = createSupabaseAdmin();
    const { error } = await sb.from('colaboradores')
      .update({ locale })
      .eq('id', colab.id);

    if (error) {
      const msg = error.message || '';
      if (/locale|schema cache|column/i.test(msg)) {
        return { success: true, locale, persisted: false };
      }
      return { error: msg };
    }

    return { success: true, locale, persisted: true };
  } catch (err) {
    console.error('[salvarLocalePerfil]', err);
    return { error: err?.message || 'Erro ao salvar idioma' };
  }
}

/**
 * Upload de foto pro bucket `avatars` e grava `foto_url` no colab.
 * Aceita { base64, mime }. Limpa avatar_preset porque foto tem precedência.
 */
export async function salvarFotoPerfil({ base64, mime }) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    if (!base64) return { error: 'Foto obrigatória' };

    const colab: any = await findColabByEmail(email, 'id, empresa_id, foto_url');
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
export async function salvarAvatarPreset(presetId) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    if (!presetId) return { error: 'Dados incompletos' };
    const valid = AVATAR_PRESETS.some(p => p.id === presetId);
    if (!valid) return { error: 'Preset inválido' };

    const colab: any = await findColabByEmail(email, 'id, foto_url');
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
export async function removerAvatar() {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    const colab: any = await findColabByEmail(email, 'id, foto_url');
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
