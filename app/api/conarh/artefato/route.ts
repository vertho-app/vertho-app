import { NextResponse } from 'next/server';
import { safeSecretEqual } from '@/lib/secure-compare';
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
 * CONARH 52 — worker T+0 do artefato (F5 do sprint consolidado).
 *
 * Recebe { leadId } da captura (actions/lead-comercial.ts) e delega a entrega ao
 * NÚCLEO `lib/conarh/entrega-t0.ts` — WhatsApp (template da Cloud API, com o
 * legado como reserva) + e-mail Resend, ambos com o link do Mapa da Evolução.
 *
 * 🔑 Esta rota é só GATE + tradução para HTTP. O corpo vive no núcleo porque a
 * varredura de pendentes (`lib/conarh/reenvio-t0.ts`, cron + botão da equipe)
 * precisa do MESMO caminho: dois gêmeos divergem, e o CLAUDE.md tem três casos
 * medidos de correção aplicada no gêmeo que não roda.
 *
 * ⚠️ `followup_step` só avança se algo CHEGOU — regra e histórico no núcleo.
 *
 * Autenticação (mesmo padrão de app/api/radar/lead-pdf):
 *   1. header x-internal-dispatch == INTERNAL_DISPATCH_SECRET, ou
 *   2. assinatura QStash (QSTASH_CURRENT/NEXT_SIGNING_KEY);
 *   sem nenhum dos dois configurados → FAIL-CLOSED em produção.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

async function verifyRequest(req: Request, body: string): Promise<boolean> {
  // 1) Bypass via header interno (server-to-server fallback quando QStash não está configurado).
  const internalSecret = process.env.INTERNAL_DISPATCH_SECRET;
  if (internalSecret) {
    const headerToken = req.headers.get('x-internal-dispatch') || '';
    if (safeSecretEqual(headerToken, internalSecret)) return true;
  }

  // 2) QStash signature
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[conarh/artefato] FAIL-CLOSED: nem signing keys nem internal secret em produção');
      return false;
    }
    console.warn('[conarh/artefato] dev/preview sem signing keys — pulando verificação');
    return true;
  }
  try {
    const { Receiver } = await import('@upstash/qstash');
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
    const signature = req.headers.get('upstash-signature') || '';
    await receiver.verify({ signature, body });
    return true;
  } catch (err: any) {
    console.error('[conarh/artefato] Assinatura QStash inválida:', err?.message);
    return false;
  }
}

export async function POST(req: Request) {
  if (blocoEstaOffline('conarh')) return respostaOffline();
  try {
    const rawBody = await req.text();
    const valid = await verifyRequest(req, rawBody);
    if (!valid) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });

    const payload = JSON.parse(rawBody);
    const leadId: string | null = payload.leadId;
    if (!leadId) return NextResponse.json({ error: 'leadId obrigatório' }, { status: 400 });

    // `forcar` é server-to-server (segredo interno ou QStash), nunca do browser:
    // o disparo manual de UM lead passa pela rota da equipe, que tem o seu gate.
    const r = await entregarT0(leadId, { forcar: payload.forcar === true });

    if (r.tipo === 'nao_encontrado') {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
    }
    if (r.tipo === 'fora_da_campanha') {
      return NextResponse.json({ error: 'Lead fora da campanha CONARH' }, { status: 400 });
    }
    if (r.tipo === 'ja_entregue') {
      // 200: para o QStash, repetir não é erro — é o retry encontrando trabalho
      // já feito. Devolver 500 aqui faria o retry insistir para sempre.
      return NextResponse.json({ ok: true, leadId, mapaUrl: r.mapaUrl, jaEntregue: true, canal: r.canal });
    }

    return NextResponse.json({
      // `ok` é a ENTREGA, não a execução: um T+0 que não chegou a ninguém devolve
      // ok:false com 200 (o trabalho foi feito, o resultado é que foi negativo).
      // Quem lê isto é o disparo manual da equipe, que precisa distinguir os dois.
      ok: r.status === ENTREGA_T0.ENVIADO,
      leadId,
      mapaUrl: r.mapaUrl,
      status: r.status,
      canal: r.canal,
      whatsappEnviado: r.whatsapp,
      whatsappErro: r.whatsappErro,
      emailEnviado: r.email,
      emailErrMsg: r.emailErro,
    });
  } catch (err: any) {
    console.error('[conarh/artefato] FATAL', err);
    // 500 sinaliza pro QStash retentar
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
