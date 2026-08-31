import { NextResponse } from 'next/server';
import { safeSecretEqual } from '@/lib/secure-compare';
import { contarEntregasT0, reenviarPendentesT0 } from '@/lib/conarh/reenvio-t0';
import { entregarT0 } from '@/lib/conarh/entrega-t0';
import { ENTREGA_T0 } from '@/lib/status';
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
 * CONARH 52 — disparo MANUAL da fila do T+0 (o recorte que não chegou).
 *
 * O gatilho automático é o cron `conarh_reenvio_t0` (15 em 15 min na janela da
 * feira). Este aqui existe para o minuto em que a Meta aprova o template no meio
 * de uma conversa: quem está no estande aperta e a fila esvazia na hora.
 *
 *   POST /api/conarh/reenviar-t0            → varre a fila inteira (teto + espaçamento)
 *   POST /api/conarh/reenviar-t0 {leadId}   → um lead só, ignorando o teto de tentativas
 *                                             (`forcar` reenvia até o já entregue)
 *
 * 🔑 A CHAVE VAI NO HEADER, não na query. `/api/conarh/fila` recebe a
 * `CONARH_PANEL_KEY` na URL porque é leitura, e URL vaza em histórico, referer e
 * log de acesso. Esta rota ESCREVE (manda mensagem para gente real, custa
 * dinheiro e consome tier do número), então a mesma chave entra por
 * `x-conarh-key` — mesmo segredo, superfície menor.
 *
 * Sem `CONARH_PANEL_KEY` configurada → FAIL-CLOSED em produção.
 */

export const runtime = 'nodejs';
// A varredura respeita o orçamento síncrono da política de cadência (240s por
// padrão, 6s entre mensagens). O teto da função tem que ser MAIOR que ele, senão
// quem corta é a Vercel — e aí o corte não fica registrado em lugar nenhum.
export const maxDuration = 300;

function verificarChave(req: Request): NextResponse | null {
  const panelKey = process.env.CONARH_PANEL_KEY;
  if (!panelKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[conarh/reenviar-t0] FAIL-CLOSED: CONARH_PANEL_KEY ausente em produção');
      return NextResponse.json({ error: 'Painel não configurado' }, { status: 503 });
    }
    console.warn('[conarh/reenviar-t0] dev/preview sem CONARH_PANEL_KEY — liberando sem chave');
    return null;
  }
  if (!safeSecretEqual(req.headers.get('x-conarh-key'), panelKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  if (blocoEstaOffline('conarh')) return respostaOffline();
  const bloqueio = verificarChave(req);
  if (bloqueio) return bloqueio;

  try {
    const body = await req.json().catch(() => ({}));
    const leadId: string | undefined = body?.leadId;

    // ── Um lead só: o caso do telefone corrigido à mão, ou do DESCONHECIDO
    // que a equipe decidiu reenviar. `forcar` é o único jeito de repetir um
    // ENVIADO — e por isso não é o default de lugar nenhum.
    if (leadId) {
      const r = await entregarT0(leadId, { forcar: body?.forcar === true });
      if (r.tipo === 'nao_encontrado') return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
      if (r.tipo === 'fora_da_campanha') return NextResponse.json({ error: 'Lead fora da campanha' }, { status: 400 });
      if (r.tipo === 'ja_entregue') {
        return NextResponse.json({ ok: true, jaEntregue: true, canal: r.canal, contagem: await contarEntregasT0() });
      }
      return NextResponse.json({
        ok: r.status === ENTREGA_T0.ENVIADO,
        status: r.status,
        canal: r.canal,
        erro: r.whatsappErro || r.emailErro,
        contagem: await contarEntregasT0(),
      });
    }

    // ── A fila inteira.
    //
    // 🔑 O DEFAULT desta rota INCLUI os esgotados, e a decisão é do SERVIDOR: o
    // teto de tentativas existe para o cron não martelar sozinho para sempre, e
    // esta rota é o caminho manual — se ela foi chamada, uma pessoa com a chave
    // já decidiu insistir. Herdar o teto do automático tornava a tela incapaz de
    // resgatar justamente quem mais precisa.
    //
    // Medido em 18/08/2026 (dia 1 da feira): um lead capturado 15:19 gastou as 10
    // tentativas contra a Z-API caída e, quando o template aprovou às 19:21, já
    // estava fora do cron E do botão — a tela mostrava "1 recorte não chegou" com
    // um botão que, para aquele lead, não fazia nada. A cota tinha sido queimada
    // por avaria do CANAL, não por recusa do destinatário.
    //
    // `incluirEsgotados: false` continua disponível para quem quiser a varredura
    // conservadora de propósito — só deixou de ser o que se ganha por omissão.
    const resultado = await reenviarPendentesT0({ incluirEsgotados: body?.incluirEsgotados !== false });
    return NextResponse.json({ ok: true, ...resultado, contagem: await contarEntregasT0() });
  } catch (err: any) {
    console.error('[conarh/reenviar-t0] FATAL', err?.message || err);
    return NextResponse.json({ error: 'Falha ao reenviar' }, { status: 500 });
  }
}
