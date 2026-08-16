import { NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdmin } from '@/lib/supabase';
import { safeSecretEqual } from '@/lib/secure-compare';
import { interpretarPayload, camposDoStatus, encareceu } from '@/lib/whatsapp/cloud-webhook';
import { decidirDono, filtroDeTelefone } from '@/lib/whatsapp/resolver-dono';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { fanoutInboxPush } from '@/lib/notifications/inbox-push';

/**
 * Webhook da WhatsApp Cloud API — mensagens recebidas e status de entrega.
 *
 * GET  = handshake de verificação (a Meta chama uma vez, ao configurar).
 * POST = eventos. Ver `lib/whatsapp/cloud-webhook.ts` para o formato.
 *
 * ⚠️ ESTE ENDPOINT É PÚBLICO na internet e a autenticação é a ASSINATURA do
 * corpo (`X-Hub-Signature-256`, HMAC-SHA256 com o app secret). Sem validá-la,
 * qualquer um injeta mensagem falsa na caixa de entrada de um tenant — e, pior,
 * marca como "entregue" uma mensagem que nunca chegou, corrompendo justamente a
 * métrica que este webhook existe para tornar confiável.
 *
 * ⚠️ RESPONDER 200 É A REGRA, mesmo em evento que não entendemos. A Meta
 * reentrega enquanto não receber 200 e DESATIVA a inscrição se o erro persistir:
 * um 500 por um campo novo deixaria o canal inteiro mudo. O que falha aqui vira
 * degradação registrada, não status de erro. A exceção é a assinatura inválida —
 * essa é 401 de propósito, porque não é "evento estranho", é requisição não
 * autenticada.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Verificação do handshake (GET) — a Meta manda o desafio uma vez. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const modo = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const esperado = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!esperado) {
    console.error('[whatsapp-cloud] FAIL-CLOSED: META_WEBHOOK_VERIFY_TOKEN ausente');
    return new NextResponse('não configurado', { status: 503 });
  }
  if (modo === 'subscribe' && safeSecretEqual(token, esperado)) {
    // A Meta espera o challenge CRU no corpo, não JSON.
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

/**
 * Valida `X-Hub-Signature-256` sobre o corpo CRU.
 *
 * Tem que ser o corpo cru, byte a byte: reserializar o JSON muda espaços e ordem
 * de chaves e a assinatura não bate mais. Por isso a rota lê `req.text()` antes
 * de qualquer `JSON.parse`.
 */
function assinaturaValida(raw: string, header: string | null): boolean {
  const segredo = process.env.META_APP_SECRET;
  if (!segredo) return false;
  if (!header?.startsWith('sha256=')) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', segredo).update(raw, 'utf8').digest('hex');
  // `safeSecretEqual` (lib/secure-compare) em vez de comparação própria: ele
  // hasheia os dois lados antes do timingSafeEqual, então não lança por
  // comprimentos diferentes nem vaza o tamanho pelo tempo.
  return safeSecretEqual(header, esperado);
}

export async function POST(req: Request) {
  const raw = await req.text();

  if (!process.env.META_APP_SECRET) {
    // FAIL-CLOSED: sem segredo não há como distinguir a Meta de um impostor.
    console.error('[whatsapp-cloud] FAIL-CLOSED: META_APP_SECRET ausente');
    return NextResponse.json({ error: 'não configurado' }, { status: 503 });
  }
  if (!assinaturaValida(raw, req.headers.get('x-hub-signature-256'))) {
    console.error('[whatsapp-cloud] assinatura inválida');
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    // 200 de propósito: corpo ilegível não melhora com retry, e insistir nele
    // custa a inscrição do webhook.
    console.error('[whatsapp-cloud] corpo não é JSON');
    return NextResponse.json({ ok: true, ignorado: 'corpo inválido' });
  }

  const { mensagens, statuses, templates, avisosConta, ignorados } = interpretarPayload(body);
  const sb = createSupabaseAdmin();

  // ── Status / categoria de template ────────────────────────────────────────
  //
  // Motivo de existir: a categoria devolvida na criação é PROVISÓRIA e muda
  // durante a revisão. Em 14/08/2026, 4 de 8 templates submetidos como UTILITY
  // viraram MARKETING — e MARKETING custa ~6× mais. Até aqui só se descobria
  // consultando a Graph API na mão, um a um.
  for (const t of templates) {
    try {
      const { error } = await sb.from('whatsapp_template_eventos').insert({
        waba_id: t.wabaId,
        template_id: t.templateId,
        template_nome: t.templateNome,
        template_idioma: t.templateIdioma,
        tipo_evento: t.tipoEvento,
        evento: t.evento,
        categoria_anterior: t.categoriaAnterior,
        categoria_nova: t.categoriaNova,
        motivo: t.motivo,
        raw: t.raw as any,
      });
      if (error) throw new Error(error.message);

      if (encareceu(t.categoriaAnterior, t.categoriaNova)) {
        // `critico`: multiplica por ~6 o custo daquele template, e o efeito é
        // permanente até alguém agir. Diferente de uma falha de envio, isto não
        // se resolve sozinho no dia seguinte.
        await registrarDegradacao({
          fluxo: 'envio',
          tipo: DEGRADACAO.WHATSAPP_TEMPLATE_ENCARECEU,
          chave: t.templateNome,
          severidade: 'critico',
          detalhe: {
            template: t.templateNome,
            de: t.categoriaAnterior,
            para: t.categoriaNova,
            motivo: t.motivo,
          },
        });
      }

      // Qualidade caindo é o aviso ANTES da pausa: a Meta pausa o template cuja
      // qualidade despenca, e aí a cadência daquele papel fica muda sem erro de
      // envio nenhum. `UNKNOWN` não é queda — é ausência de medida.
      if (t.tipoEvento === 'quality_update' && ['YELLOW', 'RED'].includes(String(t.evento || '').toUpperCase())) {
        await registrarDegradacao({
          fluxo: 'envio',
          tipo: DEGRADACAO.WHATSAPP_TEMPLATE_QUALIDADE,
          chave: t.templateNome,
          severidade: 'critico',
          detalhe: { template: t.templateNome, qualidade: t.evento },
        });
      }
    } catch (e: any) {
      console.error('[whatsapp-cloud] evento de template falhou:', e?.message);
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.WHATSAPP_STATUS_PERDIDO,
        chave: 'template-evento',
        severidade: 'aviso',
        detalhe: { template: t.templateNome, motivo: e?.message || String(e) },
      });
    }
  }

  // ── Advertência / punição na CONTA ────────────────────────────────────────
  //
  // 🔴 O evento de efeito mais amplo que este webhook recebe. Não é sobre uma
  // mensagem: depois de uma advertência por classificar marketing como utility,
  // UTILITY→MARKETING passa a ser INSTANTÂNEO (sem as 24h de aviso prévio), e a
  // escada segue para rate limit e para recategorizar TODOS os UTILITY da WABA
  // por 7-30 dias — o custo de toda a cadência, de uma vez.
  //
  // ⚠️ `account_update` NÃO estava assinado em 16/08/2026 (medido em
  // `GET /{app-id}/subscriptions`). Este bloco existe antes da assinatura de
  // propósito: assinar depois é apertar um botão, e não escrever código no meio
  // de um incidente. `account_alerts` e `account_review_update` já chegam.
  for (const a of avisosConta) {
    // `console.error` além da degradação: este é o único evento aqui cujo
    // destinatário certo é uma PESSOA no mesmo dia, não o health da madrugada.
    console.error(`[whatsapp-cloud] AVISO DE CONTA campo=${a.campo} evento=${a.evento} violacao=${a.violacao} restricoes=${a.restricoes.join(',') || '(nenhuma)'}`);
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.WHATSAPP_CONTA_ADVERTIDA,
      // Chave por campo+evento: advertência e punição são estados diferentes e
      // não podem colapsar num contador só.
      chave: `${a.campo}:${a.evento || 'sem-evento'}`,
      severidade: 'critico',
      detalhe: {
        campo: a.campo,
        evento: a.evento,
        violacao: a.violacao,
        restricoes: a.restricoes,
        descricao: a.descricao,
      },
    });
  }

  // ── Mensagens recebidas ───────────────────────────────────────────────────
  const paraPush: Array<{ m: (typeof mensagens)[number]; empresaId: string | null; empresaNome: string | null }> = [];
  for (const m of mensagens) {
    try {
      const { empresaId, colaboradorId, ambiguidade } = await resolverDono(sb, m.fromPhone);
      // upsert por wa_message_id: a Meta reentrega o mesmo evento.
      const { error } = await sb.from('whatsapp_mensagens_recebidas')
        .upsert({
          empresa_id: empresaId,
          colaborador_id: colaboradorId,
          ambiguidade,
          wa_message_id: m.waMessageId,
          from_phone: m.fromPhone,
          to_phone_id: m.toPhoneId,
          tipo: m.tipo,
          texto: m.texto,
          raw: m.raw as any,
          recebida_em: m.recebidaEm,
        }, { onConflict: 'wa_message_id', ignoreDuplicates: true });
      // supabase-js RETORNA {error} — sem este check a mensagem sumiria calada.
      if (error) throw new Error(error.message);

      // Coleta para push (só se gravou). Nome da empresa para o título — barato,
      // uma query por mensagem nova (volume inbound é ~1/dia, não é lote).
      let empresaNome: string | null = null;
      if (empresaId) {
        try {
          const { data: emp } = await sb.from('empresas').select('nome').eq('id', empresaId).maybeSingle();
          empresaNome = (emp as any)?.nome ?? null;
        } catch {}
      }
      paraPush.push({ m, empresaId, empresaNome });
    } catch (e: any) {
      console.error('[whatsapp-cloud] gravar mensagem falhou:', e?.message);
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.WHATSAPP_INBOUND_PERDIDO,
        chave: 'inbound',
        severidade: 'critico',
        detalhe: { wamid: m.waMessageId, motivo: e?.message || String(e) },
      });
    }
  }

  // Push da inbox para a equipe — DEPOIS da resposta, via after().
  // Sem after(), um envio lento seguraria o 200 e a Meta reentregaria/desativaria.
  if (paraPush.length) {
    after(async () => {
      for (const { m, empresaId, empresaNome } of paraPush) {
        const preview =
          (m.texto && m.texto.trim().slice(0, 120)) ||
          (m.tipo === 'audio' ? '🎤 áudio' : m.tipo === 'image' ? '🖼️ imagem' : m.tipo === 'document' ? '📄 documento' : `nova mensagem (${m.tipo})`);
        try {
          await fanoutInboxPush({
            waMessageId: m.waMessageId,
            fromPhone: m.fromPhone,
            preview,
            empresaId,
            empresaNome,
          });
        } catch (e: any) {
          console.error('[whatsapp-cloud] fanout push falhou:', e?.message);
        }
      }
    });
  }

  // ── Status de entrega ─────────────────────────────────────────────────────
  for (const s of statuses) {
    try {
      // `.select('id')` não é enfeite: sem ele, um update que casa ZERO linhas
      // volta com `error: null` e passa por sucesso. E casar zero é o caso
      // provável, não o raro — quando isto foi escrito, 0 de 979 linhas de
      // `notification_deliveries` tinham `provider_message_id`, ou seja, TODO
      // status recebido morria em silêncio. Justamente a métrica que este
      // webhook existe para tornar confiável.
      const { data, error } = await sb.from('notification_deliveries')
        .update(camposDoStatus(s))
        .eq('provider_message_id', s.waMessageId)
        .select('id');
      if (error) throw new Error(error.message);

      if (!data?.length) {
        // Não é falha de gravação: é status de uma mensagem que não temos
        // registrada (envio anterior à mig 212, ou telemetria que falhou no
        // aceite). Aviso, porque degrada a MEDIÇÃO e não a entrega.
        await registrarDegradacao({
          fluxo: 'envio',
          tipo: DEGRADACAO.WHATSAPP_STATUS_PERDIDO,
          chave: 'sem-destino',
          severidade: 'aviso',
          detalhe: { wamid: s.waMessageId, status: s.status, motivo: 'nenhuma entrega com este provider_message_id' },
        });
      }
    } catch (e: any) {
      // Status perdido degrada a MEDIÇÃO, não a entrega — aviso, não crítico.
      console.error('[whatsapp-cloud] status falhou:', e?.message);
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.WHATSAPP_STATUS_PERDIDO,
        chave: 'status',
        severidade: 'aviso',
        detalhe: { wamid: s.waMessageId, status: s.status, motivo: e?.message || String(e) },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mensagens: mensagens.length,
    templates: templates.length,
    statuses: statuses.length,
    ignorados,
  });
}

/**
 * De quem é este telefone? — a CONSULTA. A decisão vive em
 * `lib/whatsapp/resolver-dono.ts`, que é pura e testável sem banco.
 *
 * 🔴 SEM `.limit()`, e isso é a correção, não descuido. A versão anterior lia 5
 * linhas e concluía "empresa única" sobre elas: com um telefone presente em 7
 * pessoas de 6 empresas (medido no cadastro em 15/08/2026), bastava o Postgres
 * — que não tinha `ORDER BY` para obedecer — devolver cinco da mesma empresa
 * para a mensagem ser carimbada com o TENANT ERRADO. Um telefone casa com um
 * punhado de linhas; trazer todas custa nada e é o que torna a conclusão válida.
 */
async function resolverDono(sb: any, telefone: string) {
  const filtro = filtroDeTelefone(telefone);
  // Sem dígitos não há o que casar — e um `.or('')` não filtraria nada,
  // devolvendo a tabela inteira como se fosse candidata.
  if (!filtro) return { empresaId: null, colaboradorId: null, ambiguidade: 'telefone-vazio' };

  const { data, error } = await sb.from('colaboradores')
    .select('id, empresa_id')
    .or(filtro);

  if (error) return { empresaId: null, colaboradorId: null, ambiguidade: `erro-na-resolucao: ${error.message}` };
  return decidirDono((data || []) as { id: string; empresa_id: string | null }[]);
}
