import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser, requireRole, assertTenantAccess, assertColabAccess } from '@/lib/auth/request-context';
import { csrfCheck } from '@/lib/csrf';
import { canViewColabJourney } from '@/lib/authz';
import { z } from 'zod';
import { preverExclusaoPace, excluirCadastroComBackupPace } from '@/lib/simulador-vendas/exclusao';
import { falha, json } from '@/lib/simulador-vendas/http';

// Whitelist de colunas editáveis via este CRUD genérico. Sem isso, o body cru
// era inserido/atualizado direto com service-role — um rh poderia setar role
// arbitrário ou escrever em qualquer das ~100 colunas (incl. campos de DISC que
// são populados por fluxos dedicados). Campos comportamentais NÃO entram aqui.
const EDITABLE_FIELDS = [
  'nome_completo', 'email', 'cargo', 'area_depto',
  'telefone', 'whatsapp',
  'gestor_nome', 'gestor_email', 'gestor_whatsapp',
  'role', 'locale', 'login_por_whatsapp',
  'foto_url', 'avatar_preset', 'perfil_dominante',
] as const;

// platform_admin é tabela separada (platform_admins) — nunca atribuível aqui.
const ALLOWED_ROLES = new Set(['colaborador', 'gestor', 'rh']);

function pickEditable(body: Record<string, any>): { fields: Record<string, any>; error?: string } {
  const fields: Record<string, any> = {};
  for (const k of EDITABLE_FIELDS) {
    if (body[k] !== undefined) fields[k] = body[k];
  }
  if (fields.role !== undefined && !ALLOWED_ROLES.has(fields.role)) {
    return { fields, error: `role inválido: ${fields.role}` };
  }
  return { fields };
}

/**
 * Colunas que a listagem devolve. R-11 (revisão de 02/10/2026): era
 * `select('*')`, as ~100 colunas da pessoa (DISC, PDFs, telefones, notas) para
 * cada linha da área inteira. Lista de pessoas não precisa disso; quem precisa
 * de mais lê pelo fluxo próprio, com o gate dele.
 */
const COLUNAS_LISTAGEM = 'id, empresa_id, nome_completo, email, cargo, area_depto, role, gestor_nome, gestor_email';

// GET lista colabs por empresa. Exige gestor/rh/admin da MESMA empresa.
export async function GET(req: Request) {
  const auth = await requireRole(req, ['gestor', 'rh', 'admin']);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get('empresa_id');
  const guard = assertTenantAccess(auth, empresaId);
  if (guard) return guard;

  const sb = createSupabaseAdmin();
  // Paginado até a página curta: o PostgREST corta em 1.000 linhas calado, e
  // para o gestor o recorte é feito AQUI, depois da leitura.
  const linhas: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('colaboradores')
      .select(COLUNAS_LISTAGEM)
      .eq('empresa_id', empresaId!)
      .order('nome_completo')
      .order('id')
      .range(de, de + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    linhas.push(...(data || []));
    if ((data || []).length < 1000) break;
  }

  // Gestor vê os LIDERADOS (e a si mesmo), pela régua única de
  // `canViewColabJourney`: `gestor_email` igual, sem diferença de caixa, em
  // código e nunca por `ilike`. Era `area_depto` (R-11): das 369 relações
  // gestor e liderado do banco, só 61 têm a mesma área, então o gestor via
  // quem é só da mesma área e não via o liderado de verdade.
  if (auth.role === 'gestor' && !auth.isPlatformAdmin) {
    return NextResponse.json(linhas.filter((c) => canViewColabJourney(auth, c)));
  }
  return NextResponse.json(linhas);
}

// POST cria colab. Exige rh/admin da MESMA empresa do body.
export async function POST(req: Request) {
  const csrf = csrfCheck(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, ['rh', 'admin']);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const guard = assertTenantAccess(auth, body?.empresa_id);
  if (guard) return guard;

  const { fields, error: vErr } = pickEditable(body);
  if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });
  if (!fields.email) return NextResponse.json({ error: 'email obrigatório' }, { status: 400 });

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('colaboradores')
    .insert({ ...fields, empresa_id: body.empresa_id })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT atualiza colab. Exige rh/admin da empresa do colab (consulta antes).
export async function PUT(req: Request) {
  const csrf = csrfCheck(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, ['rh', 'admin']);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const sb = createSupabaseAdmin();
  const { data: existente } = await sb.from('colaboradores').select('empresa_id').eq('id', id).maybeSingle();
  if (!existente) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });
  const guard = assertTenantAccess(auth, existente.empresa_id);
  if (guard) return guard;

  // Bloqueia mudança de empresa_id via PUT (não faz parte do fluxo admin)
  if (updates.empresa_id && updates.empresa_id !== existente.empresa_id) {
    return NextResponse.json({ error: 'não é permitido mover colab entre empresas via API' }, { status: 400 });
  }

  const { fields, error: vErr } = pickEditable(updates);
  if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'nenhum campo editável informado' }, { status: 400 });
  }

  // O `.eq('empresa_id')` repete o tenant JÁ verificado por assertTenantAccess:
  // fecha a janela entre a leitura e a escrita (id que muda de tenant no meio
  // casa 0 linhas em vez de gravar no lugar errado). D2 da auditoria 22/08.
  const { data, error } = await sb.from('colaboradores').update(fields)
    .eq('id', id).eq('empresa_id', existente.empresa_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE colab. Exige rh/admin da empresa do colab.
export async function DELETE(req: Request) {
  const csrf = csrfCheck(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, ['rh', 'admin']);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const sb = createSupabaseAdmin();
  const { data: existente,error: leituraError } = await sb.from('colaboradores').select('empresa_id').eq('id', id).maybeSingle();
  if (leituraError) return NextResponse.json({ error:'Não foi possível consultar o cadastro.' },{ status:503 });
  if (!existente) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });
  const guard = assertTenantAccess(auth, existente.empresa_id);
  if (guard) return guard;

  try {
    const alvo = { tipo: 'colaborador' as const, id: z.string().uuid().parse(id) };
    const confirmacao = req.headers.get('x-confirmacao-exclusao-pace');
    if (!confirmacao) {
      const previa = await preverExclusaoPace(existente.empresa_id, alvo);
      return json({ error: 'Confira a prévia e confirme a exclusão reenviando x-confirmacao-exclusao-pace.', previa }, 409);
    }
    await excluirCadastroComBackupPace(existente.empresa_id, alvo, confirmacao, auth.email);
    return json({ success: true });
  } catch (error) { return falha(error); }
}
