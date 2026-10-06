import { createSupabaseAdmin } from '@/lib/supabase';
import { NextResponse, type NextRequest } from 'next/server';
import { requireRole, assertTenantAccess } from '@/lib/auth/request-context';

export async function GET(request: NextRequest) {
  // RH ou plataforma, e não "qualquer pessoa do tenant": `alternativas` carrega o gabarito do cenário
  // (a armadilha da resposta genérica, a faceta testada, o fator complicador, o dilema ético) de TODOS
  // os cargos, e quem faz a avaliação é o colaborador. A rota não tem chamador no código e fica por
  // um possível chamador externo do legado (decisão de 04/10/2026); RH e admin seguem funcionando.
  const auth = await requireRole(request, ['rh', 'admin']);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresa');
  if (!empresaId) return NextResponse.json([], { status: 400 });

  const guard = assertTenantAccess(auth, empresaId);
  if (guard) return guard;

  const sb = createSupabaseAdmin();
  const { data } = await sb.from('banco_cenarios')
    .select('id, empresa_id, competencia_id, cargo, ppp_escola_id, titulo, descricao, alternativas, competencia:competencias(nome, cod_comp), ppp:ppp_escolas(escola)')
    .eq('empresa_id', empresaId)
    .order('cargo')
    .order('created_at', { ascending: false });

  const result = (data || []).map((c: any) => ({
    ...c,
    competencia_nome: c.competencia?.nome || null,
    competencia_cod: c.competencia?.cod_comp || null,
    ppp_nome: c.ppp_escola_id ? (c.ppp?.escola || 'PPP') : 'Rede',
  }));

  return NextResponse.json(result);
}
