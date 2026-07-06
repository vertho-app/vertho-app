import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRepresentativeOrAdminAction } from '@/lib/sales/permissions';

export const runtime = 'nodejs';

// Download do PDF original do material comercial. Gated a RC ativo ou admin —
// materiais internos (battlecard, scripts) não podem vazar por URL pública.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRepresentativeOrAdminAction();
  } catch {
    return new NextResponse('Acesso restrito ao canal comercial.', { status: 403 });
  }

  const { id } = await params;
  const sb = createSupabaseAdmin();
  const { data: material } = await sb
    .from('sales_materials')
    .select('title, storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!material?.storage_path) {
    return new NextResponse('Material não encontrado.', { status: 404 });
  }

  const { data: file, error } = await sb.storage.from('sales-materials').download(material.storage_path);
  if (error || !file) {
    return new NextResponse('Arquivo indisponível.', { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = String(material.title || 'material').replace(/[^\w.-]+/g, '-').slice(0, 60);
  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}.pdf"`,
    },
  });
}
