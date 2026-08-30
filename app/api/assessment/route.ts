import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/auth/request-context';
import { csrfCheck } from '@/lib/csrf';
import { canAccessMapeamentoCenarios } from '@/lib/access-gates';
import { configEfetivaDoColaborador } from '@/lib/turmas';
import { findColabByEmail } from '@/lib/authz';
import { assessmentCompetencyWasAnswered } from '@/lib/assessment/completion';

// PPP-alvo do colaborador: a escola dele define o PPP (escolas que compartilham
// o PPP usam o mesmo cenário). Sem escola/PPP → null = rede.
async function pppDaEscola(sb: any, escolaId: string | null): Promise<string | null> {
  if (!escolaId) return null;
  const { data, error } = await sb.from('escolas').select('ppp_escola_id').eq('id', escolaId).maybeSingle();
  if (error) throw new Error(`Falha ao resolver o PPP da pessoa: ${error.message}`);
  return data?.ppp_escola_id || null;
}

function selecionarCenariosElegiveis(cenariosRaw: any[] | null | undefined, pppEscolaId: string | null) {
  const porComp: Record<string, any[]> = {};
  (cenariosRaw || []).forEach((c: any) => {
    (porComp[c.competencia_id] = porComp[c.competencia_id] || []).push(c);
  });
  return Object.values(porComp).map((rows: any[]) =>
    (pppEscolaId && rows.find((r) => r.ppp_escola_id === pppEscolaId)) || rows.find((r) => !r.ppp_escola_id) || rows[0]);
}

function validarResposta(valor: any): string | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  return v.length > 0 && v.length <= 5000 ? v : null;
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const email = auth.email;
    const sb = createSupabaseAdmin();

    // `findColabByEmail` resolve o TENANT pelo header do host. A query direta
    // `.eq('email').single()` quebra para quem existe em 2+ empresas — são 6
    // e-mails hoje — porque `.single()` devolve erro com 2 linhas e a pessoa lê
    // "Colaborador não encontrado" no tenant onde ela está.
    const colab = await findColabByEmail(email, 'id, nome_completo, cargo, empresa_id, perfil_dominante, escola_id') as any;
    if (!colab) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

    // Config EFETIVA (empresa → turma → participação), não a da empresa: duas
    // turmas do mesmo tenant podem estar em etapas diferentes (mig 210).
    const cfgGet = await configEfetivaDoColaborador(sb, colab.empresa_id, colab.id);
    const gateGet = canAccessMapeamentoCenarios(cfgGet);
    if (!gateGet.allowed) {
      return NextResponse.json({ error: gateGet.message, code: gateGet.code, remediation: gateGet.remediation }, { status: 403 });
    }

    const { data: cenariosRaw, error: cenariosError } = await sb.from('banco_cenarios')
      .select('id, competencia_id, ppp_escola_id, titulo, descricao, alternativas, p1, p2, p3, p4')
      .eq('empresa_id', colab.empresa_id)
      .eq('cargo', colab.cargo)
      .order('created_at');
    if (cenariosError) return NextResponse.json({ error: cenariosError.message }, { status: 500 });

    // Roteia pelo PPP do colaborador (via escola): 1 cenário por competência —
    // PPP do colab > rede (ppp_escola_id null) > mais recente.
    const pppEscolaId = await pppDaEscola(sb, (colab as any).escola_id || null);
    const cenarios = selecionarCenariosElegiveis(cenariosRaw, pppEscolaId);

    const competenciaIds = [...new Set(cenarios.map((cenario: any) => cenario.competencia_id).filter(Boolean))];
    const { data: competencias, error: competenciasError } = competenciaIds.length
      ? await sb.from('competencias')
          .select('id,nome')
          .eq('empresa_id', colab.empresa_id)
          .in('id', competenciaIds)
      : { data: [], error: null };
    if (competenciasError) return NextResponse.json({ error: competenciasError.message }, { status: 500 });
    const nomePorId = new Map((competencias || []).map((competencia: any) => [competencia.id, competencia.nome]));

    const { data: respostas, error: respostasError } = await sb.from('respostas')
      .select('competencia_id,competencia_nome')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .not('r1', 'is', null);
    if (respostasError) return NextResponse.json({ error: respostasError.message }, { status: 500 });

    const respondidos = (cenarios || []).filter((cenario: any) => assessmentCompetencyWasAnswered({
      id: cenario.competencia_id,
      nome: nomePorId.get(cenario.competencia_id),
    }, respostas || []));
    const respondidasIds = new Set(respondidos.map((cenario: any) => cenario.competencia_id));
    const pendentes = (cenarios || []).filter((cenario: any) => !respondidasIds.has(cenario.competencia_id));

    return NextResponse.json({ colaborador: colab, pendentes, total: cenarios?.length || 0, respondidas: respondidasIds.size });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body = await req.json();
    const { cenario_id, competencia_id, r1, r2, r3, r4 } = body;
    if (!cenario_id || !competencia_id) {
      return NextResponse.json({ error: 'cenario_id+competencia_id obrigatórios' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();
    const colab = await findColabByEmail(auth.email, 'id, empresa_id, escola_id, cargo') as any;
    if (!colab) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 });

    const cfgPost = await configEfetivaDoColaborador(sb, colab.empresa_id, colab.id);
    const gatePost = canAccessMapeamentoCenarios(cfgPost);
    if (!gatePost.allowed) {
      return NextResponse.json({ error: gatePost.message, code: gatePost.code, remediation: gatePost.remediation }, { status: 403 });
    }

    const { data: cenariosRaw, error: cenariosError } = await sb.from('banco_cenarios')
      .select('id, competencia_id, ppp_escola_id')
      .eq('empresa_id', colab.empresa_id)
      .eq('cargo', colab.cargo)
      .order('created_at');
    if (cenariosError) return NextResponse.json({ error: cenariosError.message }, { status: 500 });

    const pppEscolaId = await pppDaEscola(sb, (colab as any).escola_id || null);
    const elegiveis = selecionarCenariosElegiveis(cenariosRaw, pppEscolaId);
    const cenario = elegiveis.find((c: any) => c.id === cenario_id);
    if (!cenario || cenario.competencia_id !== competencia_id) {
      return NextResponse.json({ error: 'Cenário não elegível para este colaborador' }, { status: 403 });
    }

    const { data: competencia, error: competenciaError } = await sb.from('competencias')
      .select('nome')
      .eq('empresa_id', colab.empresa_id)
      .eq('id', competencia_id)
      .maybeSingle();
    if (competenciaError) return NextResponse.json({ error: competenciaError.message }, { status: 500 });

    const { data: respostasExistentes, error: respostasExistentesError } = await sb.from('respostas')
      .select('id,competencia_id,competencia_nome')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .not('r1', 'is', null)
      .limit(100);
    if (respostasExistentesError) return NextResponse.json({ error: respostasExistentesError.message }, { status: 500 });
    if (assessmentCompetencyWasAnswered({ id: competencia_id, nome: competencia?.nome }, respostasExistentes || [])) {
      return NextResponse.json({ error: 'Competência já respondida' }, { status: 409 });
    }

    const respostas = [r1, r2, r3, r4].map(validarResposta);
    if (respostas.some((r) => !r)) {
      return NextResponse.json({ error: 'Respostas obrigatórias e limitadas a 5000 caracteres' }, { status: 400 });
    }

    const { error } = await sb.from('respostas').insert({
      empresa_id: colab.empresa_id,
      colaborador_id: colab.id,
      competencia_id,
      cenario_id,
      r1: respostas[0],
      r2: respostas[1],
      r3: respostas[2],
      r4: respostas[3],
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
