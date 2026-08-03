import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { safeSecretEqual } from '@/lib/secure-compare';
import { inicioHojeBRT, totalDescritoresPorta2 } from '@/lib/conarh/conteudo';

/**
 * CONARH 52 — painel diário de 5 números + funil por porta (F7 do sprint).
 *
 * GET /api/conarh/painel?key=... → JSON com os números do DIA (America/Sao_Paulo):
 *   - rotas concluídas   (diag_eventos tipo conarh_rota_concluida)
 *   - leads A            (diag_leads classe='A' do scope conarh-2026)
 *   - leads B            (classe='B')
 *   - reuniões com data  (reuniao_em preenchido)
 *   - total de capturas
 *   - funil por porta    (contagem por porta_escolhida, 1–5)
 *   - divergências médias da porta 2 (média de itens em sessao.divergencias) —
 *     o ativo de dados do evento ("como um critério explícito muda a avaliação").
 *     Só entram sessões COMPLETAS (todos os descritores reavaliados): o modo
 *     curto da porta 2 deixa o visitante pular o resto da matriz, e sessão
 *     encurtada tem menos chance de divergir só porque foi mais curta. Contar
 *     as duas juntas afunda a média que vira número publicável. As parciais são
 *     devolvidas em `sessoes_parciais` — descarte declarado, nunca silencioso.
 *
 * Envs novas:
 *   - CONARH_PANEL_KEY — mesma chave da fila. FAIL-CLOSED em produção.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verificarChave(req: Request): NextResponse | null {
  const panelKey = process.env.CONARH_PANEL_KEY;
  if (!panelKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[conarh/painel] FAIL-CLOSED: CONARH_PANEL_KEY ausente em produção');
      return NextResponse.json({ error: 'Painel não configurado' }, { status: 503 });
    }
    console.warn('[conarh/painel] dev/preview sem CONARH_PANEL_KEY — liberando sem chave');
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

  // Rotas concluídas (telemetria da demo) — o tipo já é específico do CONARH.
  const { count: rotasConcluidas, error: errRotas } = await sb
    .from('diag_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'conarh_rota_concluida')
    .gte('criado_em', inicioDia);
  if (errRotas) console.error('[conarh/painel] eventos:', errRotas.message);

  // Leads do dia — uma leitura só, agregada em JS (volume de feira: centenas).
  const { data: leads, error: errLeads } = await sb
    .from('diag_leads')
    .select('classe, porta_escolhida, reuniao_em, sessao')
    .eq('scope_id', 'conarh-2026')
    .gte('criado_em', inicioDia)
    .limit(1000);
  if (errLeads) {
    console.error('[conarh/painel] leads:', errLeads.message);
    return NextResponse.json({ error: 'Falha ao ler o painel' }, { status: 500 });
  }

  const lista = leads || [];
  const funilPorPorta: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const totalDescritores = totalDescritoresPorta2();
  let divergenciasTotal = 0;
  let divergenciasN = 0;
  let sessoesParciais = 0;

  for (const l of lista as any[]) {
    if (l.porta_escolhida >= 1 && l.porta_escolhida <= 5) {
      funilPorPorta[String(l.porta_escolhida)]++;
    }
    // Divergências vs. motor registradas na porta 2 (o toque interativo).
    const divs = l.sessao?.divergencias;
    if (!Array.isArray(divs)) continue;
    const avaliados = Array.isArray(l.sessao?.reavaliacao) ? l.sessao.reavaliacao.length : 0;
    if (totalDescritores > 0 && avaliados < totalDescritores) {
      sessoesParciais++;
      continue;
    }
    divergenciasTotal += divs.length;
    divergenciasN++;
  }

  return NextResponse.json({
    ok: true,
    dia: inicioDia.slice(0, 10),
    numeros: {
      rotas_concluidas: rotasConcluidas || 0,
      leads_a: lista.filter((l: any) => l.classe === 'A').length,
      leads_b: lista.filter((l: any) => l.classe === 'B').length,
      reunioes_com_data: lista.filter((l: any) => !!l.reuniao_em).length,
      total_capturas: lista.length,
    },
    funil_por_porta: funilPorPorta,
    divergencias_porta2: {
      media: divergenciasN ? Math.round((divergenciasTotal / divergenciasN) * 100) / 100 : null,
      sessoes: divergenciasN,
      // Encurtadas pelo modo curto: fora da média, mas visíveis no painel.
      sessoes_parciais: sessoesParciais,
      descritores_por_sessao: totalDescritores,
      // F7: nenhum recorte publicável com n < 7 — o painel já avisa.
      amostra_suficiente: divergenciasN >= 7,
    },
  });
}
