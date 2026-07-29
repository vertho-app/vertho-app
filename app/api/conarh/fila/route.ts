import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { safeSecretEqual } from '@/lib/secure-compare';
import { inicioHojeBRT } from '@/lib/conarh/conteudo';

/**
 * CONARH 52 — fila do dia no tablet (F4 do sprint consolidado).
 *
 * GET /api/conarh/fila?key=... → leads de HOJE (dia em America/Sao_Paulo) do
 * scope conarh-2026, somente leitura: nome, organização, porta, competência,
 * horizonte, classe e horário da captura. É a tela que o expositor consulta
 * entre um visitante e outro — funciona mesmo com sync atrasado.
 *
 * Envs novas:
 *   - CONARH_PANEL_KEY — chave de leitura compartilhada com os tablets do
 *     estande. Ausente → FAIL-CLOSED em produção (a fila expõe nome e
 *     telefone-adjacente de leads, não pode ficar aberta).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verificarChave(req: Request): NextResponse | null {
  const panelKey = process.env.CONARH_PANEL_KEY;
  if (!panelKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[conarh/fila] FAIL-CLOSED: CONARH_PANEL_KEY ausente em produção');
      return NextResponse.json({ error: 'Painel não configurado' }, { status: 503 });
    }
    console.warn('[conarh/fila] dev/preview sem CONARH_PANEL_KEY — liberando sem chave');
    return null;
  }
  const { searchParams } = new URL(req.url);
  if (!safeSecretEqual(searchParams.get('key'), panelKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const bloqueio = verificarChave(req);
  if (bloqueio) return bloqueio;

  const sb = createSupabaseAdmin();
  const inicioDia = inicioHojeBRT();

  const { data, error } = await sb
    .from('diag_leads')
    .select('id, nome, organizacao, porta_escolhida, competencia_critica, horizonte, classe, reuniao_em, criado_em')
    .eq('scope_id', 'conarh-2026')
    .gte('criado_em', inicioDia)
    .order('criado_em', { ascending: false })
    .limit(300);

  if (error) {
    console.error('[conarh/fila] query falhou:', error.message);
    return NextResponse.json({ error: 'Falha ao ler a fila' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    dia: inicioDia.slice(0, 10),
    total: data?.length || 0,
    leads: (data || []).map((l: any) => ({
      id: l.id,
      nome: l.nome,
      organizacao: l.organizacao,
      porta: l.porta_escolhida,
      competencia: l.competencia_critica,
      horizonte: l.horizonte,
      classe: l.classe,
      reuniao_em: l.reuniao_em,
      criado_em: l.criado_em,
    })),
  });
}
