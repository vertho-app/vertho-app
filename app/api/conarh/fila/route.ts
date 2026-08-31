import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { safeSecretEqual } from '@/lib/secure-compare';
import { inicioHojeBRT } from '@/lib/conarh/conteudo';
import { contarEntregasT0 } from '@/lib/conarh/reenvio-t0';
import { BLOCOS_OFFLINE, blocoEstaOffline } from '@/lib/blocos-offline';

/**
 * ⛔ CONARH 52 — bloco OFF-LINE desde 31/08/2026 (lib/blocos-offline.ts).
 *
 * Estas rotas são autenticadas por CHAVE, não por sessão: o tablet do estande e
 * o painel do sócio chamavam com a key na query ou no header. Fechar apenas as
 * telas deixaria a chave valendo — e ela circulou pela equipe durante a feira.
 *
 * 410 Gone, não 404: o recurso existiu e foi retirado de propósito. E o gate usa
 * `blocoEstaOffline()` (que devolve `boolean`) em vez de um `return` seco no
 * topo — com `strict: false`, um return incondicional torna o resto do handler
 * inalcançável e o TypeScript PERDE o narrowing das uniões discriminadas abaixo,
 * enchendo o typecheck de erros no código preservado.
 */
function respostaOffline() {
  const reg = BLOCOS_OFFLINE.conarh;
  return NextResponse.json(
    { error: `CONARH 52 está off-line desde ${reg.desde}.`, motivo: reg.evidencia },
    { status: 410 },
  );
}


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
  if (blocoEstaOffline('conarh')) return respostaOffline();
  const bloqueio = verificarChave(req);
  if (bloqueio) return bloqueio;

  const sb = createSupabaseAdmin();
  const inicioDia = inicioHojeBRT();

  const { data, error } = await sb
    .from('diag_leads')
    .select('id, nome, organizacao, porta_escolhida, competencia_critica, horizonte, classe, reuniao_em, criado_em, t0_status, t0_erro')
    .eq('scope_id', 'conarh-2026')
    .gte('criado_em', inicioDia)
    .order('criado_em', { ascending: false })
    .limit(300);

  if (error) {
    console.error('[conarh/fila] query falhou:', error.message);
    return NextResponse.json({ error: 'Falha ao ler a fila' }, { status: 500 });
  }

  // Contagem de entregas do T+0 — da CAMPANHA INTEIRA, não do dia: quem ficou
  // devendo ontem continua devendo hoje, e o dia 3 da feira não pode zerar o
  // pendente do dia 1. Best-effort: se a contagem falhar, a fila ainda abre (é a
  // tela que o expositor usa entre um visitante e outro).
  let entregas: Awaited<ReturnType<typeof contarEntregasT0>> | null = null;
  try {
    entregas = await contarEntregasT0();
  } catch (err: any) {
    console.error('[conarh/fila] contagem de entregas falhou:', err?.message || err);
  }

  return NextResponse.json({
    ok: true,
    dia: inicioDia.slice(0, 10),
    total: data?.length || 0,
    entregas,
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
      // O recorte chegou? É a única coluna desta tela que não é sobre o
      // visitante, e sim sobre o que NÓS devemos a ele.
      t0_status: l.t0_status,
      t0_erro: l.t0_erro,
    })),
  });
}
