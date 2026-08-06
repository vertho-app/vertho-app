/**
 * Núcleo do trigger diário PARA UMA EMPRESA (fan-out F-C*: uma task QStash por
 * empresa → o worker app/api/webhooks/qstash/trigger-diario-empresa processa
 * UMA empresa por invocação, com maxDuration próprio — o loop sequencial
 * monolítico estourava a lambda e as empresas do fim ficavam sem envio).
 *
 * Sem gate de auth e sem 'use server' (regra do repo: export de 'use server'
 * vira endpoint). Quem chama é o dispatcher (actions/cron-jobs.ts →
 * triggerDiario, que detém o lock diário) ou o worker QStash. Precedente de
 * extração: conarhFollowup → lib/conarh/regua.ts.
 *
 * Diferenças em relação ao corpo original embutido em cron-jobs.ts:
 *  1. N+1 de trilhas morto: UMA query `trilhas` com `.in('colaborador_id', …)`
 *     antes do loop + redução em JS (antes: 1 query por envio).
 *  2. delay() por empresa: o espaçamento de 2s/mensagem era um contador GLOBAL
 *     compartilhado entre empresas; com o fan-out cada empresa é uma lambda,
 *     então o espaçamento é por empresa (índice da mensagem dentro dela).
 *  3. Carimbo de WhatsApp só APÓS envio confirmado: o publish carrega
 *     `fase4EnvioId`/`carimboCampo` e quem grava `ultima_pilulaN_whatsapp_em`
 *     é o webhook whatsapp-cis, depois do sendWhatsapp ok (F-C4).
 */
import { mesmoDiaUTC, pilulaPendente } from '@/lib/notifications/carimbo-canal';
import { tenantDb } from '@/lib/tenant-db';
import { APP_URL, tenantUrl } from '@/lib/domain';
import { templateWhatsAppPilula, templateWhatsAppEvidencia, templateWhatsAppNudgeDesafio } from '@/lib/notifications';
import { textoPilulaWhatsapp, emailPilula, enviarEmailPilula, deepLinkSemana, templateWhatsAppMissao, emailMissao } from '@/lib/notifications/pilula-envio';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { totalSemanasDoPlano } from '@/lib/season-engine/trilha-runtime';
import { publicarWhatsappCis } from '@/lib/qstash-publish';
import { pushHabilitado } from '@/lib/notifications/flag';
import { enviarPush } from '@/lib/notifications/push-core';
import { pushPilula, pushMissao } from '@/lib/notifications/push-copy';
import { temaPilula } from '@/lib/notifications/pilula-envio';
import { ENVIO } from '@/lib/status';

const TOTAL_SEMANAS = 14;
const SEMANAS_IMPL = [4, 8, 12]; // Semanas de implementação (sem pílula nova)

export interface EmpresaDiario {
  id: string;
  nome?: string | null;
  slug?: string | null;
  is_demo?: boolean | null;
  sys_config?: any;
}

export interface ResumoEmpresaDiario {
  pilulas: number;
  emails: number;
  evidencias: number;
  nudges: number;
  erros: number;
}

/**
 * Processa a cadência de HOJE de uma empresa (1ª pílula, missão, 2ª pílula DUO,
 * evidência + avanço de semana). LANÇA em falha inesperada — o isolamento por
 * empresa (try/catch) fica no chamador: no dispatcher inline ele impede uma
 * empresa quebrada de calar as outras; no worker QStash a exceção vira 5xx e
 * a task é retentada (idempotente no mesmo dia graças aos carimbos por canal).
 */
export async function processarEmpresaDiario(
  empresa: EmpresaDiario,
  { hoje, hojeUTC }: { hoje: number; hojeUTC: string },
): Promise<ResumoEmpresaDiario> {
  let pilulas = 0, emails = 0, evidencias = 0, nudges = 0, erros = 0;

  const cadencia = (empresa as any).sys_config?.cadencia || {};
  const diaP1 = cadencia.fase4_dia_pilula ?? 1;            // default segunda
  const diaP2 = cadencia.fase4_dia_pilula2 ?? 2;           // default terça (2ª pílula DUO)
  const diaEv = cadencia.fase4_dia_evidencia ?? 4;         // default quinta
  if (hoje !== diaP1 && hoje !== diaP2 && hoje !== diaEv) {
    return { pilulas, emails, evidencias, nudges, erros }; // empresa sem nada hoje
  }

  // Deep-link da pílula = URL do TENANT (ibipeba.vertho.ai), não a genérica.
  const baseUrl = (empresa as any).slug ? tenantUrl((empresa as any).slug) : APP_URL;
  // Demo NÃO envia comunicação real (e-mail); WhatsApp já não vai por falta de telefone.
  const ehDemo = !!(empresa as any).is_demo;

  const tdb = tenantDb(empresa.id);
  const { data: envios } = await tdb.from('fase4_envios')
    .select('id, colaborador_id, semana_atual, status, ultima_evidencia_em, ultima_pilula1_em, ultima_pilula2_em, ultima_pilula1_whatsapp_em, ultima_pilula1_email_em, ultima_pilula1_push_em, ultima_pilula2_whatsapp_em, ultima_pilula2_email_em, ultima_pilula2_push_em, colaboradores!inner(nome_completo, whatsapp, telefone, email, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
    .eq('status', ENVIO.ATIVO);
  if (!envios?.length) return { pilulas, emails, evidencias, nudges, erros };

  // Trilha mais recente de CADA colaborador em UMA query (era 1 query por
  // envio — N+1). Ordenada por numero_temporada desc, a PRIMEIRA ocorrência
  // de cada colaborador na redução é a trilha latest (byte-igual ao
  // `.order(...).limit(1).maybeSingle()` anterior).
  const trilhaPorColab = new Map<string, any>();
  try {
    const colabIds = [...new Set((envios as any[]).map((e) => e.colaborador_id))];
    const { data: trilhas } = await tdb.from('trilhas')
      .select('colaborador_id, numero_temporada, temporada_plano, competencia_foco')
      .in('colaborador_id', colabIds)
      .order('numero_temporada', { ascending: false });
    for (const t of (trilhas || []) as any[]) {
      if (!trilhaPorColab.has(t.colaborador_id)) trilhaPorColab.set(t.colaborador_id, t);
    }
  } catch (e: any) { console.warn('[triggerDiario] trilhas bulk:', e?.message); }

  // Espaçamento de 2s por mensagem DENTRO da empresa (antes era um contador
  // global entre empresas; com o fan-out cada empresa roda na sua lambda).
  let msgsAgendadas = 0;
  const delay = () => (msgsAgendadas++) * 2;

  // Quem tem push ativo nesta empresa. UMA query por execução, não uma por
  // pessoa: sem este conjunto, saber "o canal push é aplicável a fulano?" custaria
  // um SELECT por colaborador só para decidir a pendência.
  // Empresa sem a flag nem consulta — o custo do canal novo escala com adoção,
  // não com o tamanho do tenant.
  const pushLigado = await pushHabilitado(empresa.id);
  const comPush = new Set<string>();
  if (pushLigado) {
    const { data: eps, error: errEps } = await tdb
      .from('notification_endpoints')
      .select('colaborador_id')
      .eq('enabled', true);
    // supabase-js RETORNA `{ error }`: sem checar, uma falha viraria "ninguém
    // tem push" e o canal sumiria da pendência em silêncio — exatamente o tipo
    // de ausência que já foi confundida com "ninguém quis".
    if (errEps) console.warn('[triggerDiario] endpoints de push:', errEps.message);
    else for (const e of (eps as any[]) || []) comPush.add(e.colaborador_id);
  }

  for (const envio of (envios as any[])) {
    const semana = envio.semana_atual || 1;

    // Plano da semana (temporada_plano) → conteúdos do dia (DUO) p/ pílula e
    // desafio + TAMANHO REAL do plano. O avanço de semana pára no fim do
    // plano (piloto/custom têm 1–4 semanas — antes o cron avançava cego até
    // 14, nudgeando semanas que não existem). Sem trilha/plano → fallback 14
    // (colabs legados, byte-igual ao comportamento anterior).
    let plan: any = null, conteudosDia: any[] = [], competenciaFoco: any = null;
    let plano: any[] = [];
    let totalSemanas = TOTAL_SEMANAS;
    try {
      const trilha = trilhaPorColab.get(envio.colaborador_id);
      competenciaFoco = trilha?.competencia_foco;
      plano = (trilha?.temporada_plano || []) as any[];
      totalSemanas = totalSemanasDoPlano(plano, TOTAL_SEMANAS);
      plan = plano.find((s: any) => Number(s.semana) === Number(semana)) || plano[semana - 1] || null;
      if (plan) {
        conteudosDia = (Array.isArray(plan.conteudos_dia) && plan.conteudos_dia.length)
          ? plan.conteudos_dia
          : (plan.conteudo ? [{ competencia: competenciaFoco, descritor: plan.descritor, conteudo: plan.conteudo }] : []);
      }
    } catch (e: any) { console.warn('[triggerDiario] plano:', e?.message); }

    if (semana > totalSemanas) {
      if (hoje === diaEv) await tdb.from('fase4_envios').update({ status: ENVIO.CONCLUIDO }).eq('id', envio.id);
      continue;
    }
    const nome = envio.colaboradores.nome_completo || 'Colaborador';
    // Telefone: coluna `whatsapp` ou, no fallback, `telefone` (muitos tenants só têm este).
    const telefone = envio.colaboradores.whatsapp || envio.colaboradores.telefone;
    const email = !ehDemo ? (envio.colaboradores.email || null) : null;
    const formatoPref = derivarPrioridadeFormatos(envio.colaboradores)[0];
    // ultimo_envio DERIVADO em JS (não existe coluna): o mais recente dos 3 carimbos.
    const ultimoEnvio = [envio.ultima_pilula1_em, envio.ultima_pilula2_em, envio.ultima_evidencia_em]
      .filter(Boolean).map((d: any) => new Date(d).getTime()).sort((a, b) => b - a)[0] || null;

    // Envia a pílula do dia por WhatsApp E e-mail (cada canal best-effort), no
    // formato preferido + deep-link do tenant. Carimba o timestamp da pílula.
    const enviarPilulaDia = async (item: any, stampCol: 'ultima_pilula1_em' | 'ultima_pilula2_em') => {
      const pilula = stampCol === 'ultima_pilula1_em' ? 1 : 2;   // atribuição de abertura (?p=)
      const wppCol = pilula === 1 ? 'ultima_pilula1_whatsapp_em' : 'ultima_pilula2_whatsapp_em';
      const mailCol = pilula === 1 ? 'ultima_pilula1_email_em' : 'ultima_pilula2_email_em';
      const pushCol = pilula === 1 ? 'ultima_pilula1_push_em' : 'ultima_pilula2_push_em';
      const opts = { formato: formatoPref, semana, baseUrl, pilula };
      const agora = new Date().toISOString();
      const stamp: Record<string, string> = {};
      let whatsappEnfileirado = false;

      // CARIMBO POR CANAL: cada canal só se carimba se DEU CERTO, e cada um tem
      // a sua guarda de idempotência. E-mail: síncrono, carimba aqui se ok.
      // WhatsApp: o carimbo NÃO acontece mais no enfileiramento — vai no
      // payload (fase4EnvioId/carimboCampo) e quem grava é o webhook
      // whatsapp-cis APÓS o sendWhatsapp confirmar (F-C4: antes uma queda do
      // provedor entre publish e consumo virava perda silenciosa com o banco
      // afirmando "pílula enviada"; observado em prod 20/07/2026, Ibipeba).
      // Se o webhook nunca confirmar, o canal segue PENDENTE e recuperável —
      // que é exatamente a semântica da guarda por canal.
      if (telefone && !mesmoDiaUTC(envio[wppCol], hojeUTC)) {
        try {
          await publicarWhatsappCis({
            telefone,
            mensagem: templateWhatsAppPilula(nome, semana, textoPilulaWhatsapp(item, opts)),
            fase4EnvioId: envio.id,
            carimboCampo: wppCol,
          }, delay());
          pilulas++; whatsappEnfileirado = true;
        } catch { erros++; }
      }
      if (email && !mesmoDiaUTC(envio[mailCol], hojeUTC)) {
        const { subject, html } = emailPilula(nome, item, opts);
        const r = await enviarEmailPilula(email, subject, html, {
          kind: 'pilula',
          empresaId: empresa.id,
          colaboradorId: envio.colaborador_id,
          dedupeKey: `${mailCol}:${envio.id}`,
        });
        if (r.ok) { emails++; stamp[mailCol] = agora; } else erros++;
      }

      // ── PUSH (3º canal) ──
      // Roda EM PARALELO ao WhatsApp/e-mail de propósito: a pessoa é notificada
      // duas vezes pela mesma pílula durante a fase de medição, que é o desenho
      // — só assim os canais são comparáveis sobre a MESMA população. É custo
      // reconhecido e temporário; o critério de saída está no docs/APP-MOBILE.md.
      //
      // `comPush` já garante que só entra quem tem inscrição ativa, então isto
      // não custa nada para quem não aderiu.
      if (pushLigado && comPush.has(envio.colaborador_id) && !mesmoDiaUTC(envio[pushCol], hojeUTC)) {
        const texto = pushPilula(semana, temaPilula(item));
        const r = await enviarPush({
          colaboradorId: envio.colaborador_id,
          empresaId: empresa.id,
          kind: 'pilula',
          titulo: texto.titulo,
          corpo: texto.corpo,
          // MESMO destino do WhatsApp e do e-mail: comparar canais exige que a
          // única variável seja o canal, não para onde cada um leva.
          url: deepLinkSemana(baseUrl, semana, formatoPref, pilula),
          dedupeKey: `${pushCol}:${envio.id}`,
        });
        // Carimba só o próprio sucesso — mesma regra dos irmãos. Zero entregues
        // (endpoint morto entre a leitura e o envio) deixa o canal PENDENTE.
        if (r.entregues > 0) { stamp[pushCol] = agora; } else if (r.falhas > 0) erros++;
      }

      // O ciclo só fecha se ALGUM canal saiu. DECISÃO (fan-out): o consolidado
      // `ultima_pilulaN_em` é gravado quando o e-mail saiu (síncrono) OU o
      // WhatsApp foi ENFILEIRADO — o mesmo critério de antes, quando o
      // carimbo do WhatsApp também acontecia no publish. O carimbo POR CANAL
      // do WhatsApp chega depois, via webhook; se nada saiu/enfileirou, sem
      // carimbo: o gate do dia continua aberto e a falha fica visível no banco.
      if (Object.keys(stamp).length || whatsappEnfileirado) {
        await tdb.from('fase4_envios').update({ ...stamp, [stampCol]: agora }).eq('id', envio.id);
      }
    };

    // Há canal PENDENTE hoje? Ver lib/notifications/carimbo-canal.
    const temPush = comPush.has(envio.colaborador_id);
    const pendente = (wppCol: string, mailCol: string, pushCol?: string) =>
      pilulaPendente({
        temTelefone: !!telefone, temEmail: !!email, temPush,
        carimboWhatsapp: envio[wppCol], carimboEmail: envio[mailCol],
        carimboPush: pushCol ? envio[pushCol] : null,
        hojeUTC,
      });

    // ── 1ª PÍLULA ──
    if (hoje === diaP1 && !ehImpl(semana, plan) && conteudosDia[0] && pendente('ultima_pilula1_whatsapp_em', 'ultima_pilula1_email_em', 'ultima_pilula1_push_em')) {
      await enviarPilulaDia(conteudosDia[0], 'ultima_pilula1_em');
    }

    // ── MISSÃO (semana de aplicação 4/8/12): a segunda ANUNCIA a missão ──
    // Antes a semana de aplicação não tinha contato nenhum até a evidência de
    // quinta — a pessoa descobria a missão por conta (medido 03/08, Ibipeba:
    // 36/36 sem envio na segunda da semana 4). Agora a segunda abre a semana
    // com texto padrão + vídeo explicativo + deep-link. Reusa os carimbos da
    // pílula 1 (idempotência); o postflight não mede semana de aplicação.
    if (hoje === diaP1 && plan?.tipo === 'aplicacao' && pendente('ultima_pilula1_whatsapp_em', 'ultima_pilula1_email_em', 'ultima_pilula1_push_em')) {
      // acao_principal precisa do plano NORMALIZADO — no banco a missão pode
      // estar como JSON cru/truncado (estado real de 33/36 trilhas da Ibipeba).
      let acaoPrincipal: string | null = null;
      try {
        const planoNorm = normalizeTemporadaPlano(plano);
        const planNorm = planoNorm.find((s: any) => Number(s.semana) === Number(semana)) || planoNorm[semana - 1];
        acaoPrincipal = planNorm?.missao?.acao_principal || null;
      } catch (e: any) { console.warn('[triggerDiario] missão normalize:', e?.message); }
      const optsMissao = { semana, baseUrl, acaoPrincipal };
      const agora = new Date().toISOString();
      const stamp: Record<string, string> = {};
      let whatsappEnfileirado = false;
      if (telefone && !mesmoDiaUTC(envio.ultima_pilula1_whatsapp_em, hojeUTC)) {
        try {
          // Mesmo contrato da pílula: carimbo do canal só no webhook, pós-envio.
          await publicarWhatsappCis({
            telefone,
            mensagem: templateWhatsAppMissao(nome, optsMissao),
            fase4EnvioId: envio.id,
            carimboCampo: 'ultima_pilula1_whatsapp_em',
          }, delay());
          pilulas++; whatsappEnfileirado = true;
        } catch { erros++; }
      }
      if (email && !mesmoDiaUTC(envio.ultima_pilula1_email_em, hojeUTC)) {
        const { subject, html } = emailMissao(nome, optsMissao);
        // Kind próprio: a missão da semana de aplicação NÃO é pílula. Reaproveitar
        // o kind faria a contagem de cadência incluir um evento de outra natureza.
        const r = await enviarEmailPilula(email, subject, html, {
          kind: 'missao',
          empresaId: empresa.id,
          colaboradorId: envio.colaborador_id,
          dedupeKey: `missao:${envio.id}`,
        });
        if (r.ok) { emails++; stamp.ultima_pilula1_email_em = agora; } else erros++;
      }
      if (pushLigado && comPush.has(envio.colaborador_id) && !mesmoDiaUTC(envio.ultima_pilula1_push_em, hojeUTC)) {
        const texto = pushMissao(semana);
        const r = await enviarPush({
          colaboradorId: envio.colaborador_id,
          empresaId: empresa.id,
          kind: 'missao',
          titulo: texto.titulo,
          corpo: texto.corpo,
          url: deepLinkSemana(baseUrl, semana),
          dedupeKey: `missao-push:${envio.id}`,
        });
        if (r.entregues > 0) { stamp.ultima_pilula1_push_em = agora; } else if (r.falhas > 0) erros++;
      }
      if (Object.keys(stamp).length || whatsappEnfileirado) {
        await tdb.from('fase4_envios').update({ ...stamp, ultima_pilula1_em: agora }).eq('id', envio.id);
      }
    }

    // ── 2ª PÍLULA (DUO) ──
    if (hoje === diaP2 && !ehImpl(semana, plan) && conteudosDia[1] && pendente('ultima_pilula2_whatsapp_em', 'ultima_pilula2_email_em', 'ultima_pilula2_push_em')) {
      await enviarPilulaDia(conteudosDia[1], 'ultima_pilula2_em');
    }

    // ── EVIDÊNCIA + avanço de semana ──
    if (hoje === diaEv && !mesmoDiaUTC(envio.ultima_evidencia_em, hojeUTC)) {
      // Nudge de inatividade (2+ semanas sem envio) — não avança semana.
      if (ultimoEnvio && (Date.now() - ultimoEnvio) / 86_400_000 >= 14) {
        if (telefone) {
          const nudgeMsg = `Olá, ${nome}! 👋\n\nNotamos que você está há mais de 2 semanas sem interagir com sua trilha.\n\nQue tal retomar hoje?\n\n— Vertho Mentor IA`;
          try { await publicarWhatsappCis({ telefone, mensagem: nudgeMsg }, delay()); nudges++; } catch {}
        }
        await tdb.from('fase4_envios').update({ ultima_evidencia_em: new Date().toISOString() }).eq('id', envio.id);
        continue;
      }
      // Quinta = NUDGE de prática. O desafio JÁ está no conteúdo da semana (cada
      // formato aterrissa nele) E no card "Desafio" do week page — re-mandar o texto
      // inteiro seria o 3º envio redundante. Aqui só cobramos + linkamos a semana
      // (rever o desafio + relatar à Mentora IA). Aplicação/missão (4/8/12) → lembrete
      // de evidência clássico.
      if (telefone) {
        const ehDesafio = plan && plan.tipo !== 'aplicacao' && !ehImpl(semana, plan) && conteudosDia.length;
        const mensagem = ehDesafio
          ? templateWhatsAppNudgeDesafio(nome, deepLinkSemana(baseUrl, semana))
          : templateWhatsAppEvidencia(nome, semana);
        try { await publicarWhatsappCis({ telefone, mensagem }, delay()); evidencias++; } catch { erros++; }
      }
      // Avanço de semana INCONDICIONAL (decisão de produto — não mexer): a
      // evidência é a alavanca do calendário, independente de canal entregue.
      await tdb.from('fase4_envios').update({ semana_atual: semana + 1, ultima_evidencia_em: new Date().toISOString() }).eq('id', envio.id);
    }
  }

  return { pilulas, emails, evidencias, nudges, erros };
}

/**
 * Semana de implementação = semana SEM pílula nova (a de missão prática).
 *
 * Pergunta ao PLANO da trilha (`tipo: 'aplicacao'`), não a uma lista de
 * números. A lista `[4, 8, 12]` só vale no formato de 14 semanas: na jornada
 * de 7 (05/08/2026) não há semana de missão, e a semana 4 — que É de conteúdo —
 * ficaria sem pílula, em silêncio, para todo mundo desse modo. O plano é
 * carimbado na geração, então responde certo para qualquer modo, inclusive os
 * que ainda não existem.
 *
 * `plan` ausente (colab legado sem plano) cai na lista antiga — mesmo
 * comportamento de antes para quem já roda.
 */
function ehImpl(semana: number, plan: any | null): boolean {
  if (plan?.tipo) return plan.tipo === 'aplicacao';
  return SEMANAS_IMPL.includes(semana);
}
