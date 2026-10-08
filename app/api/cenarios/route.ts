import { tenantDb, type TenantDb } from '@/lib/tenant-db';
import { NextResponse, type NextRequest } from 'next/server';
import { requireRole, assertTenantAccess } from '@/lib/auth/request-context';

type Cenario = {
  id: string;
  empresa_id: string;
  competencia_id: string | null;
  cargo: string | null;
  ppp_escola_id: string | null;
  titulo: string | null;
  descricao: string | null;
  alternativas: unknown;
};
type Competencia = { id: string; nome: string | null; cod_comp: string | null };
type Ppp = { id: string; escola: string | null };

// banco_cenarios.competencia_id não tem FK para embedding no PostgREST.
// Consultas separadas também impedem enriquecer um cenário com dados de outro tenant.
async function buscarReferencias<T extends { id: string }>(
  tdb: TenantDb,
  tabela: 'competencias' | 'ppp_escolas',
  colunas: string,
  ids: string[],
): Promise<{ data: T[]; error: boolean }> {
  const rows: T[] = [];
  // Limita o tamanho do filtro na URL, mesmo com muitos cenários distintos.
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    const { data, error } = await tdb.from(tabela)
      .select(colunas)
      .in('id', ids.slice(inicio, inicio + 100));
    if (error) return { data: [], error: true };
    rows.push(...((data || []) as T[]));
  }
  return { data: rows, error: false };
}

const indisponivel = () => NextResponse.json(
  { error: 'Não foi possível carregar os cenários.' },
  { status: 503 },
);

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

  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('banco_cenarios')
    .select('id, empresa_id, competencia_id, cargo, ppp_escola_id, titulo, descricao, alternativas')
    .order('cargo')
    .order('created_at', { ascending: false });
  if (error) return indisponivel();

  const cenarios = (data || []) as Cenario[];
  if (!cenarios.length) return NextResponse.json([]);

  const competenciaIds = [...new Set(cenarios.flatMap(c => c.competencia_id ? [c.competencia_id] : []))];
  const pppIds = [...new Set(cenarios.flatMap(c => c.ppp_escola_id ? [c.ppp_escola_id] : []))];
  const [competencias, ppps] = await Promise.all([
    buscarReferencias<Competencia>(tdb, 'competencias', 'id, nome, cod_comp', competenciaIds),
    buscarReferencias<Ppp>(tdb, 'ppp_escolas', 'id, escola', pppIds),
  ]);
  if (competencias.error || ppps.error) return indisponivel();

  const competenciaPorId = new Map(competencias.data.map(c => [c.id, c]));
  const pppPorId = new Map(ppps.data.map(p => [p.id, p]));

  const result = cenarios.map(c => {
    const comp = c.competencia_id ? competenciaPorId.get(c.competencia_id) : null;
    const escola = c.ppp_escola_id ? pppPorId.get(c.ppp_escola_id) : null;
    const competencia = comp ? { nome: comp.nome, cod_comp: comp.cod_comp } : null;
    const ppp = escola ? { escola: escola.escola } : null;
    return {
      ...c,
      competencia,
      ppp,
      competencia_nome: competencia?.nome || null,
      competencia_cod: competencia?.cod_comp || null,
      ppp_nome: c.ppp_escola_id ? (ppp?.escola || 'PPP') : 'Rede',
    };
  });

  return NextResponse.json(result);
}
