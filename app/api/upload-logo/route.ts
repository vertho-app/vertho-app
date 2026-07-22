import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRole, assertTenantAccess } from '@/lib/auth/request-context';
import { csrfCheck } from '@/lib/csrf';

export async function POST(req) {
  try {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;

    // RH da empresa pode trocar o logo; platform admin também (via requireRole('admin')).
    const auth = await requireRole(req, ['rh', 'admin']);
    if (auth instanceof Response) return auth;

    const formData = await req.formData();
    const file = formData.get('file');
    const empresaId = formData.get('empresaId');

    if (!file || !empresaId) {
      return NextResponse.json({ error: 'file e empresaId obrigatórios' }, { status: 400 });
    }

    const tenantGuard = assertTenantAccess(auth, String(empresaId));
    if (tenantGuard) return tenantGuard;

    // Validar tipo
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido. Use PNG, JPG, SVG ou WebP.' }, { status: 400 });
    }

    // Validar tamanho (2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo 2MB.' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();

    // Path VERSIONADO: logo-{timestamp}.{ext}. Path fixo (logo.png) mantinha a
    // URL pública idêntica entre uploads → CDN/browser serviam o logo ANTIGO
    // por até 1h (cache default do Storage) e o <img> nem refazia o fetch —
    // "troquei o logo e voltou o mesmo". URL nova a cada upload = zero cache
    // stale, e o cache pode ser LONGO (o conteúdo de uma URL nunca muda).
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${empresaId}/logo-${Date.now()}.${ext}`;

    // Upload PRIMEIRO, limpeza depois — nunca deletar antes de ter o novo no ar.
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await sb.storage
      .from('logos')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
        cacheControl: '31536000',
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = sb.storage.from('logos').getPublicUrl(path);

    // Persiste DIRETO no ui_config: com path versionado, "subiu mas não clicou
    // Salvar" deixaria o login apontando pro arquivo antigo (que vai ser
    // removido abaixo). Upload de logo é operação completa por si só; o botão
    // Salvar segue cuidando das cores.
    const { data: emp } = await sb.from('empresas')
      .select('ui_config').eq('id', String(empresaId)).maybeSingle();
    const { error: cfgError } = await sb.from('empresas')
      .update({ ui_config: { ...(emp?.ui_config || {}), logo_url: urlData.publicUrl } })
      .eq('id', String(empresaId));
    if (cfgError) {
      return NextResponse.json({ error: cfgError.message }, { status: 500 });
    }

    // Limpeza best-effort dos logos anteriores (o novo já está persistido).
    try {
      const { data: existing } = await sb.storage.from('logos').list(String(empresaId));
      const toRemove = (existing || [])
        .filter(f => `${empresaId}/${f.name}` !== path)
        .map(f => `${empresaId}/${f.name}`);
      if (toRemove.length) await sb.storage.from('logos').remove(toRemove);
    } catch (e) {
      console.warn('[upload-logo] limpeza de logos antigos falhou:', e?.message);
    }

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
