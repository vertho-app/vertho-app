import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';

/**
 * POST /api/upload/signed-url
 * Body: { formato, filename }
 *
 * Retorna signed URL pro colab/admin fazer upload DIRETO pro Supabase Storage,
 * sem passar o binário pelo servidor Next. Elimina limite de bodySizeLimit e
 * reduz superfície de abuso (server não é mais proxy de arquivo gigante).
 *
 * Após upload, cliente chama `registrarUpload(storage_path)` em server action
 * pra persistir metadata em micro_conteudos.
 */
export async function POST(request) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const sb = createSupabaseAdmin();
    const { data: userData } = await sb.auth.getUser(auth.slice(7));
    const email = userData?.user?.email;
    if (!email) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const ctx = await getUserContext(email);
    // Só RH ou platform admin pode fazer upload de conteúdo curado
    if (ctx?.role !== 'rh' && !ctx?.isPlatformAdmin) {
      return NextResponse.json({ error: 'Acesso restrito a RH/admin' }, { status: 403 });
    }

    const { formato, filename } = await request.json();
    if (!formato || !filename) return NextResponse.json({ error: 'formato+filename obrigatórios' }, { status: 400 });

    // Sanitiza filename e monta path tenant-aware (dev pode subir em empresa/empresa_id/)
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const empresaSlug = ctx.colaborador?.empresa_id || 'global';
    const path = `${formato}/${empresaSlug}/${Date.now()}-${safeFilename}`;

    // Signed upload URL (válida por 60 min)
    const { data, error } = await sb.storage.from('conteudos').createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    });
  } catch (err) {
    console.error('[upload/signed-url]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
