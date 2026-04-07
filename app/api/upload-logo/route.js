import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const empresaId = formData.get('empresaId');

    if (!file || !empresaId) {
      return NextResponse.json({ error: 'file e empresaId obrigatórios' }, { status: 400 });
    }

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

    // Gerar nome único: logos/{empresaId}/logo.{ext}
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${empresaId}/logo.${ext}`;

    // Remover logo anterior (qualquer extensão)
    const { data: existing } = await sb.storage.from('logos').list(empresaId);
    if (existing?.length) {
      const toRemove = existing.map(f => `${empresaId}/${f.name}`);
      await sb.storage.from('logos').remove(toRemove);
    }

    // Upload
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await sb.storage
      .from('logos')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // URL pública
    const { data: urlData } = sb.storage.from('logos').getPublicUrl(path);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
