import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRole, assertTenantAccess } from '@/lib/auth/request-context';
import { heavyLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';

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
export async function POST(request: Request) {
  try {
    const csrf = csrfCheck(request);
    if (csrf) return csrf;

    // Só RH ou platform admin pode fazer upload de conteúdo curado
    const auth = await requireRole(request, ['rh', 'admin']);
    if (auth instanceof Response) return auth;

    const limited = heavyLimiter.check(request, auth.email);
    if (limited) return limited;

    const { formato, filename } = await request.json();
    if (!formato || !filename) return NextResponse.json({ error: 'formato+filename obrigatórios' }, { status: 400 });

    // Sanitiza filename e monta path tenant-aware (dev pode subir em empresa/empresa_id/)
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const empresaSlug = auth.colaborador?.empresa_id || 'global';
    const path = `${formato}/${empresaSlug}/${Date.now()}-${safeFilename}`;

    // Signed upload URL (válida por 60 min)
    const sb = createSupabaseAdmin();
    const { data, error } = await sb.storage.from('conteudos').createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    });
  } catch (err: any) {
    console.error('[upload/signed-url]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
