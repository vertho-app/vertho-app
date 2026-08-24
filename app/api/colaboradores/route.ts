import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser, requireRole, assertTenantAccess, assertColabAccess } from '@/lib/auth/request-context';
import { csrfCheck } from '@/lib/csrf';

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
const ALLOWED_ROLES = new Set(['colaborador', 'gestor', 'rh', 'tutor']);

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

// GET lista colabs por empresa. Exige gestor/rh/admin da MESMA empresa.
export async function GET(req: Request) {
  const auth = await requireRole(req, ['gestor', 'rh', 'admin']);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get('empresa_id');
  const guard = assertTenantAccess(auth, empresaId);
  if (guard) return guard;

  const sb = createSupabaseAdmin();
  let query = sb.from('colaboradores')
    .select('*')
    .eq('empresa_id', empresaId!)
    .order('nome_completo');

  // Gestor: restringir à mesma area_depto (fail closed se gestor sem área)
  if (auth.role === 'gestor') {
    const gestorArea = auth.colaborador?.area_depto;
    if (!gestorArea) {
      return NextResponse.json({ error: 'gestor sem area_depto definida' }, { status: 403 });
    }
    query = query.eq('area_depto', gestorArea);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
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
  const { data: existente } = await sb.from('colaboradores').select('empresa_id').eq('id', id).maybeSingle();
  if (!existente) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });
  const guard = assertTenantAccess(auth, existente.empresa_id);
  if (guard) return guard;

  const { error } = await sb.from('colaboradores').delete()
    .eq('id', id).eq('empresa_id', existente.empresa_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
