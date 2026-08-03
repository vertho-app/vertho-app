'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { mesmoDiaUTC, pilulaPendente } from '@/lib/notifications/carimbo-canal';
import { tenantDb } from '@/lib/tenant-db';
import { APP_URL, APP_WEBHOOK_URL, QSTASH_BASE_URL, tenantUrl } from '@/lib/domain';
import { templateWhatsAppPilula, templateWhatsAppEvidencia, templateWhatsAppDesafioQuinta, templateWhatsAppNudgeDesafio } from '@/lib/notifications';
import { textoPilulaWhatsapp, emailPilula, enviarEmailPilula, deepLinkSemana, templateWhatsAppMissao, emailMissao } from '@/lib/notifications/pilula-envio';
import { resolverDesafioDoKit } from '@/lib/season-engine/kit/desafio-semana';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { totalSemanasDoPlano } from '@/lib/season-engine/trilha-runtime';
import { requireAdminOrCronAction } from '@/lib/auth/action-context';
import { assertWhatsappAvailable } from '@/lib/whatsapp';

const TIMEOUT_ABANDONO_HORAS = 48;
const TOTAL_SEMANAS = 14;
const SEMANAS_IMPL = [4, 8, 12]; // Semanas de implementação (sem pílula nova)

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP: Resetar sessões abandonadas (>48h de inatividade)
// Equivalente ao GAS: LimpezaSessoes.js → limparSessoesAbandonadas()
// ═══════════════════════════════════════════════════════════════════════════════

export async function cleanupSessoes() {
  await requireAdminOrCronAction();
  // Cron CROSS-TENANT por design: varre todas empresas em uma só varredura.
  // Usa raw porque a query precisa atravessar todos os tenants (admin scope).
  // Em vez de tdb por iteração, manter raw aqui é correto — é um job de
  // manutenção da plataforma, não uma operação de tenant individual.
  const sbRaw = createSupabaseAdmin();
  const cutoff = new Date(Date.now() - TIMEOUT_ABANDONO_HORAS * 60 * 60 * 1000).toISOString();

  // Buscar sessões ativas com updated_at > 48h
  const { data: abandonadas } = await sbRaw.from('sessoes_avaliacao')
    .select('id, colaborador_id, competencia_id, updated_at')
    .eq('status', 'em_andamento')
    .lt('updated_at', cutoff);

  if (!abandonadas?.length) return { resetadas: 0, message: 'Nenhuma sessão abandonada' };

  let resetadas = 0;

  for (const sessao of abandonadas) {
    // Resetar sessão para estado inicial
    const { error } = await sbRaw.from('sessoes_avaliacao')
      .update({
        status: 'em_andamento',
        fase: 'cenario',
        aprofundamentos: 0,
        confianca: 0,
        evidencias: [],
        rascunho_avaliacao: null,
        validacao_audit: null,
        avaliacao_final: null,
        nivel: null,
        nota_decimal: null,
        lacuna: null,
        // Avança updated_at: sem isso a sessão continuaria < cutoff e seria
        // re-resetada a cada execução do cron (loop diário que apaga o chat).
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessao.id);

    if (!error) {
      // Limpar mensagens do chat (histórico)
      await sbRaw.from('mensagens_chat').delete().eq('sessao_id', sessao.id);

      // Registrar motivo do reset
      await sbRaw.from('mensagens_chat').insert({
        sessao_id: sessao.id,
        role: 'system',
        content: `Sessão resetada por inatividade (>${TIMEOUT_ABANDONO_HORAS}h)`,
        metadata: { motivo: 'timeout_abandono', cutoff },
      });

      resetadas++;
    }
  }

  return { resetadas, message: `${resetadas} sessões resetadas por inatividade` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER SEGUNDA: Enviar pílula semanal (conteúdo de aprendizado)
// Equivalente ao GAS: Fase4.js → triggerSegundaFase4()
// ═══════════════════════════════════════════════════════════════════════════════

export async function triggerSegunda() {
  await requireAdminOrCronAction();
  // Cron itera todas empresas, mas usa tenantDb por iteração pra escopar
  // operações tenant-owned (fase4_envios, capacitacao). empresas é raw (id é tenant).
  const sbRaw = createSupabaseAdmin();

  // Buscar todas as empresas com fase 4 ativa
  const { data: empresas } = await sbRaw.from('empresas')
    .select('id, nome, slug, sys_config');

  if (!empresas?.length) return { enviados: 0, message: 'Nenhuma empresa encontrada' };

  let totalEnviados = 0;
  let totalErros = 0;

  for (const empresa of empresas) {
    const cadencia = empresa.sys_config?.cadencia || {};
    const horaConfig = cadencia.fase4_hora || 8;
    const tdb = tenantDb(empresa.id);

    // Buscar colaboradores com fase4 ativa
    const { data: envios } = await tdb.from('fase4_envios')
      .select('id, colaborador_id, semana_atual, sequencia, status, colaboradores!inner(nome_completo, email, whatsapp)')
      .eq('status', 'ativo');

    if (!envios?.length) continue;

    for (const envio of (envios as any[])) {
      const semana = envio.semana_atual || 1;
      const nome = envio.colaboradores.nome_completo || 'Colaborador';
      const email = envio.colaboradores.email;
      const telefone = envio.colaboradores.whatsapp;

      // Verificar se concluiu
      if (semana > TOTAL_SEMANAS) {
        await tdb.from('fase4_envios')
          .update({ status: 'concluido' })
          .eq('id', envio.id);
        continue;
      }

      const ehImpl = SEMANAS_IMPL.includes(semana);
      let sequencia = [];
      try { sequencia = typeof envio.sequencia === 'string' ? JSON.parse(envio.sequencia) : envio.sequencia || []; }
      catch { continue; }

      const pilula = (!ehImpl && semana <= sequencia.length) ? sequencia[semana - 1] : null;
      const titulo = pilula?.titulo || `Semana ${semana}`;
      const conteudo = ehImpl
        ? `Esta é uma semana de implementação. Aplique o que aprendeu nas últimas semanas e registre suas evidências.`
        : (pilula?.resumo || titulo);

      // Registrar envio na capacitação. empresa_id é injetado pelo tdb.insert
      // Nota: tabela capacitacao pode não existir em todos os ambientes (legado)
      try {
        await tdb.from('capacitacao').insert({
          colaborador_id: envio.colaborador_id,
          semana: semana,
          tipo: ehImpl ? 'implementacao' : 'pilula',
          pilula_ok: false,
          pontos: 0,
        });
      } catch (e) {
        console.warn('[triggerSegunda] capacitacao insert falhou (tabela pode não existir):', e?.message);
      }

      // Enviar WhatsApp via QStash (se tiver telefone)
      if (telefone) {
        const mensagem = templateWhatsAppPilula(nome, semana, conteudo);
        try {
          await publishToQStash({ telefone, mensagem }, totalEnviados * 2);
          totalEnviados++;
        } catch { totalErros++; }
      }

      // Atualizar último envio
      await tdb.from('fase4_envios')
        .update({ ultimo_envio: new Date().toISOString() })
        .eq('id', envio.id);
    }
  }

  return { enviados: totalEnviados, erros: totalErros, message: `Segunda: ${totalEnviados} pílulas enviadas` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER QUINTA: Solicitar evidência de aplicação
// Equivalente ao GAS: Fase4.js → triggerQuintaFase4()
// ═══════════════════════════════════════════════════════════════════════════════

export async function triggerQuinta() {
  await requireAdminOrCronAction();
  const sbRaw = createSupabaseAdmin();

  const { data: empresas } = await sbRaw.from('empresas')
    .select('id, nome, slug, sys_config');

  if (!empresas?.length) return { enviados: 0, message: 'Nenhuma empresa encontrada' };

  let totalEnviados = 0;
  let totalErros = 0;
  let nudges = 0;

  for (const empresa of empresas) {
    const tdb = tenantDb(empresa.id);
    const { data: envios } = await tdb.from('fase4_envios')
      .select('id, colaborador_id, semana_atual, sequencia, status, ultimo_envio, ultima_evidencia_em, colaboradores!inner(nome_completo, email, whatsapp, perfil_dominante)')
      .eq('status', 'ativo');

    if (!envios?.length) continue;

    const hojeUTC = new Date().toISOString().slice(0, 10);

    for (const envio of (envios as any[])) {
      const semana = envio.semana_atual || 1;
      const nome = envio.colaboradores.nome_completo || 'Colaborador';
      const telefone = envio.colaboradores.whatsapp;

      if (semana > TOTAL_SEMANAS) continue;

      // Idempotência: se já processamos a quinta deste envio hoje (retry da
      // Vercel, replay de mensagem ou disparo manual), não reenvia nem avança
      // a semana de novo — evita pular conteúdo. Migration 120.
      if (envio.ultima_evidencia_em &&
          new Date(envio.ultima_evidencia_em).toISOString().slice(0, 10) === hojeUTC) {
        continue;
      }

      // Verificar inatividade (2+ semanas sem envio)
      if (envio.ultimo_envio) {
        const ultimoEnvio = new Date(envio.ultimo_envio);
        const diasSemEnvio = (Date.now() - ultimoEnvio.getTime()) / (1000 * 60 * 60 * 24);
        if (diasSemEnvio >= 14) {
          // Nudge de inatividade
          if (telefone) {
            const nudgeMsg = `Olá, ${nome}! 👋\n\nNotamos que você está há mais de 2 semanas sem interagir com sua trilha de desenvolvimento.\n\nSua evolução é importante para nós. Que tal retomar hoje?\n\n— Vertho Mentor IA`;
            try {
              await publishToQStash({ telefone, mensagem: nudgeMsg }, (totalEnviados + nudges) * 2);
              nudges++;
            } catch {}
          }
          // Marca processamento do dia (idempotência) sem avançar semana.
          await tdb.from('fase4_envios')
            .update({ ultima_evidencia_em: new Date().toISOString() })
            .eq('id', envio.id);
          continue;
        }
      }

      // Cobra o DESAFIO específico da semana (do KIT, por DISC do colab) quando
      // resolvível; senão, cai na mensagem genérica de evidência. Fase 3 — fechar
      // a mensagem de quinta. Best-effort: qualquer falha → genérico.
      let desafioTexto = '';
      if (telefone) {
        try {
          const { data: trilha } = await tdb.from('trilhas')
            .select('temporada_plano, competencia_foco')
            .eq('colaborador_id', envio.colaborador_id)
            .order('numero_temporada', { ascending: false }).limit(1).maybeSingle();
          const plano = (trilha?.temporada_plano || []) as any[];
          const plan = plano.find((s: any) => Number(s.semana) === Number(semana)) || plano[semana - 1];
          const disc = String(envio.colaboradores.perfil_dominante || '').trim().charAt(0).toUpperCase();
          if (plan && plan.tipo !== 'aplicacao' && disc) {
            if (Array.isArray(plan.conteudos_dia) && plan.conteudos_dia.length) {
              const linhas = await Promise.all(plan.conteudos_dia.map(async (e: any) => {
                const k = await resolverDesafioDoKit(sbRaw, { empresaId: empresa.id, competencia: e.competencia, descritor: e.descritor, disc }).catch(() => null);
                return k?.desafio_texto || e.conteudo?.desafio_texto;
              }));
              desafioTexto = linhas.filter(Boolean).join('\n\n');
            } else {
              const k = await resolverDesafioDoKit(sbRaw, { empresaId: empresa.id, competencia: trilha?.competencia_foco, descritor: plan.descritor, disc }).catch(() => null);
              desafioTexto = k?.desafio_texto || plan.conteudo?.desafio_texto || '';
            }
          }
        } catch (e: any) { console.warn('[triggerQuinta] resolver desafio:', e?.message); }

        const mensagem = desafioTexto ? templateWhatsAppDesafioQuinta(nome, desafioTexto) : templateWhatsAppEvidencia(nome, semana);
        try {
          await publishToQStash({ telefone, mensagem }, totalEnviados * 2);
          totalEnviados++;
        } catch { totalErros++; }
      }

      // Avançar semana + marcar processamento do dia (idempotência, migration 120)
      await tdb.from('fase4_envios')
        .update({ semana_atual: semana + 1, ultima_evidencia_em: new Date().toISOString() })
        .eq('id', envio.id);
    }
  }

  return { enviados: totalEnviados, erros: totalErros, nudges, message: `Quinta: ${totalEnviados} evidências solicitadas, ${nudges} nudges` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER DIÁRIO: motor único da cadência (substitui seg+qui no cron).
// Lê a cadência de CADA empresa (dia da 1ª pílula, 2ª pílula DUO, evidência) e,
// se HOJE for um desses dias, dispara o que cabe. A pílula vem do temporada_plano
// (conteudos_dia = DUO), não da sequencia legada. Idempotente por dia (colunas
// ultima_pilula1_em/ultima_pilula2_em/ultima_evidencia_em). O AVANÇO de semana
// continua na evidência. Dia: getUTCDay() (0=dom..6=sáb) = mesmo índice da tela.
// ═══════════════════════════════════════════════════════════════════════════════


export async function triggerDiario() {
  await requireAdminOrCronAction();

  // LOCK DIÁRIO (F-C3): duas execuções sobrepostas leem os mesmos carimbos `null` e
  // ambas enviam — pílula 2× e o avanço de semana aplicado 2×, que PULA conteúdo.
  const { adquirirLockDiario } = await import('@/lib/cron-lock');
  const lock = await adquirirLockDiario('trigger_diario');
  if (!lock.adquirido) {
    console.warn('[triggerDiario] execução ignorada:', lock.motivo);
    return { pilulas: 0, emails: 0, evidencias: 0, nudges: 0, erros: 0, ignorado: true, message: `Ignorado: ${lock.motivo}` };
  }

  try {
  const sbRaw = createSupabaseAdmin();
  const { data: empresas } = await sbRaw.from('empresas').select('id, nome, slug, is_demo, sys_config');
  if (!empresas?.length) {
    await lock.liberar('nenhuma empresa');
    return { pilulas: 0, evidencias: 0, message: 'Nenhuma empresa encontrada' };
  }

  const hoje = new Date().getUTCDay();          // 0=dom..6=sáb (= índice da config)
  const hojeUTC = new Date().toISOString().slice(0, 10);
  let pilulas = 0, emails = 0, evidencias = 0, nudges = 0, erros = 0;
  // Empresas cujo processamento explodiu — reportadas no retorno em vez de sumirem.
  const empresasComFalha: string[] = [];

  for (const empresa of empresas) {
    // ISOLAMENTO POR EMPRESA: sem este try/catch, uma exceção (carimbo, tenantDb,
    // plano corrompido) aborta o run INTEIRO e todas as empresas seguintes do dia
    // ficam sem envio — e o Vercel Cron não re-tenta. Uma empresa quebrada não pode
    // calar as outras (FMEA §1.3).
    try {
    const cadencia = (empresa as any).sys_config?.cadencia || {};
    const diaP1 = cadencia.fase4_dia_pilula ?? 1;            // default segunda
    const diaP2 = cadencia.fase4_dia_pilula2 ?? 2;           // default terça (2ª pílula DUO)
    const diaEv = cadencia.fase4_dia_evidencia ?? 4;         // default quinta
    if (hoje !== diaP1 && hoje !== diaP2 && hoje !== diaEv) continue; // empresa sem nada hoje

    // Deep-link da pílula = URL do TENANT (ibipeba.vertho.ai), não a genérica.
    const baseUrl = (empresa as any).slug ? tenantUrl((empresa as any).slug) : APP_URL;
    // Demo NÃO envia comunicação real (e-mail); WhatsApp já não vai por falta de telefone.
    const ehDemo = !!(empresa as any).is_demo;

    const tdb = tenantDb(empresa.id);
    const { data: envios } = await tdb.from('fase4_envios')
      .select('id, colaborador_id, semana_atual, status, ultima_evidencia_em, ultima_pilula1_em, ultima_pilula2_em, ultima_pilula1_whatsapp_em, ultima_pilula1_email_em, ultima_pilula2_whatsapp_em, ultima_pilula2_email_em, colaboradores!inner(nome_completo, whatsapp, telefone, email, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
      .eq('status', 'ativo');
    if (!envios?.length) continue;

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
        const { data: trilha } = await tdb.from('trilhas')
          .select('temporada_plano, competencia_foco')
          .eq('colaborador_id', envio.colaborador_id)
          .order('numero_temporada', { ascending: false }).limit(1).maybeSingle();
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
        if (hoje === diaEv) await tdb.from('fase4_envios').update({ status: 'concluido' }).eq('id', envio.id);
        continue;
      }
      const nome = envio.colaboradores.nome_completo || 'Colaborador';
      // Telefone: coluna `whatsapp` ou, no fallback, `telefone` (muitos tenants só têm este).
      const telefone = envio.colaboradores.whatsapp || envio.colaboradores.telefone;
      const email = !ehDemo ? (envio.colaboradores.email || null) : null;
      const cargo = envio.colaboradores.cargo;
      const disc = String(envio.colaboradores.perfil_dominante || '').trim().charAt(0).toUpperCase();
      const ehImpl = SEMANAS_IMPL.includes(semana);
      // Formato preferido do colab (deep-link da pílula abre a semana já nesse formato).
      const formatoPref = derivarPrioridadeFormatos(envio.colaboradores)[0];
      // ultimo_envio DERIVADO em JS (não existe coluna): o mais recente dos 3 carimbos.
      const ultimoEnvio = [envio.ultima_pilula1_em, envio.ultima_pilula2_em, envio.ultima_evidencia_em]
        .filter(Boolean).map((d: any) => new Date(d).getTime()).sort((a, b) => b - a)[0] || null;

      const delay = () => (pilulas + evidencias + nudges) * 2;

      // Envia a pílula do dia por WhatsApp E e-mail (cada canal best-effort), no
      // formato preferido + deep-link do tenant. Carimba o timestamp da pílula.
      const enviarPilulaDia = async (item: any, stampCol: 'ultima_pilula1_em' | 'ultima_pilula2_em') => {
        const pilula = stampCol === 'ultima_pilula1_em' ? 1 : 2;   // atribuição de abertura (?p=)
        const wppCol = pilula === 1 ? 'ultima_pilula1_whatsapp_em' : 'ultima_pilula2_whatsapp_em';
        const mailCol = pilula === 1 ? 'ultima_pilula1_email_em' : 'ultima_pilula2_email_em';
        const opts = { formato: formatoPref, semana, baseUrl, pilula };
        const agora = new Date().toISOString();
        const stamp: Record<string, string> = {};

        // CARIMBO POR CANAL: cada canal só se carimba se DEU CERTO, e cada um tem
        // a sua guarda de idempotência. Antes o update era incondicional e ficava
        // fora do try/catch — numa queda da Z-API o banco afirmava "pílula enviada"
        // com ZERO WhatsApp entregue, o mesmoDiaUTC bloqueava o reenvio e a
        // /admin/engajamento reportava 100%. Observado em prod 20/07/2026 (Ibipeba:
        // 36 carimbos, 0 WhatsApp). Com a guarda por canal, um disparo extra no
        // mesmo dia recupera SÓ o canal que faltou, sem duplicar o que já saiu.
        // ⚠️ O carimbo de WhatsApp prova ENFILEIRAMENTO com provedor saudável, não
        // entrega: quem entrega é o webhook whatsapp-cis. Se o provedor cair entre
        // o publish e o consumo, o QStash retenta e, esgotando, a perda volta a ser
        // silenciosa. Entrega real exige o webhook carimbar de volta (payload sem
        // referência do envio hoje — ver FMEA F-C4).
        if (telefone && !mesmoDiaUTC(envio[wppCol], hojeUTC)) {
          try {
            await publishToQStash({ telefone, mensagem: templateWhatsAppPilula(nome, semana, textoPilulaWhatsapp(item, opts)) }, delay());
            pilulas++; stamp[wppCol] = agora;
          } catch { erros++; }
        }
        if (email && !mesmoDiaUTC(envio[mailCol], hojeUTC)) {
          const { subject, html } = emailPilula(nome, item, opts);
          const r = await enviarEmailPilula(email, subject, html);
          if (r.ok) { emails++; stamp[mailCol] = agora; } else erros++;
        }
        // O ciclo só fecha se ALGUM canal entregou. Nada saiu → sem carimbo, o
        // gate do dia continua aberto e a falha fica visível no banco.
        if (Object.keys(stamp).length) {
          await tdb.from('fase4_envios').update({ ...stamp, [stampCol]: agora }).eq('id', envio.id);
        }
      };

      // Há canal PENDENTE hoje? Ver lib/notifications/carimbo-canal.
      const pendente = (wppCol: string, mailCol: string) =>
        pilulaPendente({
          temTelefone: !!telefone, temEmail: !!email,
          carimboWhatsapp: envio[wppCol], carimboEmail: envio[mailCol], hojeUTC,
        });

      // ── 1ª PÍLULA ──
      if (hoje === diaP1 && !ehImpl && conteudosDia[0] && pendente('ultima_pilula1_whatsapp_em', 'ultima_pilula1_email_em')) {
        await enviarPilulaDia(conteudosDia[0], 'ultima_pilula1_em');
      }

      // ── MISSÃO (semana de aplicação 4/8/12): a segunda ANUNCIA a missão ──
      // Antes a semana de aplicação não tinha contato nenhum até a evidência de
      // quinta — a pessoa descobria a missão por conta (medido 03/08, Ibipeba:
      // 36/36 sem envio na segunda da semana 4). Agora a segunda abre a semana
      // com texto padrão + vídeo explicativo + deep-link. Reusa os carimbos da
      // pílula 1 (idempotência); o postflight não mede semana de aplicação.
      if (hoje === diaP1 && plan?.tipo === 'aplicacao' && pendente('ultima_pilula1_whatsapp_em', 'ultima_pilula1_email_em')) {
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
        if (telefone && !mesmoDiaUTC(envio.ultima_pilula1_whatsapp_em, hojeUTC)) {
          try {
            await publishToQStash({ telefone, mensagem: templateWhatsAppMissao(nome, optsMissao) }, delay());
            pilulas++; stamp.ultima_pilula1_whatsapp_em = agora;
          } catch { erros++; }
        }
        if (email && !mesmoDiaUTC(envio.ultima_pilula1_email_em, hojeUTC)) {
          const { subject, html } = emailMissao(nome, optsMissao);
          const r = await enviarEmailPilula(email, subject, html);
          if (r.ok) { emails++; stamp.ultima_pilula1_email_em = agora; } else erros++;
        }
        if (Object.keys(stamp).length) {
          await tdb.from('fase4_envios').update({ ...stamp, ultima_pilula1_em: agora }).eq('id', envio.id);
        }
      }

      // ── 2ª PÍLULA (DUO) ──
      if (hoje === diaP2 && !ehImpl && conteudosDia[1] && pendente('ultima_pilula2_whatsapp_em', 'ultima_pilula2_email_em')) {
        await enviarPilulaDia(conteudosDia[1], 'ultima_pilula2_em');
      }

      // ── EVIDÊNCIA + avanço de semana ──
      if (hoje === diaEv && !mesmoDiaUTC(envio.ultima_evidencia_em, hojeUTC)) {
        // Nudge de inatividade (2+ semanas sem envio) — não avança semana.
        if (ultimoEnvio && (Date.now() - ultimoEnvio) / 86_400_000 >= 14) {
          if (telefone) {
            const nudgeMsg = `Olá, ${nome}! 👋\n\nNotamos que você está há mais de 2 semanas sem interagir com sua trilha.\n\nQue tal retomar hoje?\n\n— Vertho Mentor IA`;
            try { await publishToQStash({ telefone, mensagem: nudgeMsg }, delay()); nudges++; } catch {}
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
          const ehDesafio = plan && plan.tipo !== 'aplicacao' && !ehImpl && conteudosDia.length;
          const mensagem = ehDesafio
            ? templateWhatsAppNudgeDesafio(nome, deepLinkSemana(baseUrl, semana))
            : templateWhatsAppEvidencia(nome, semana);
          try { await publishToQStash({ telefone, mensagem }, delay()); evidencias++; } catch { erros++; }
        }
        await tdb.from('fase4_envios').update({ semana_atual: semana + 1, ultima_evidencia_em: new Date().toISOString() }).eq('id', envio.id);
      }
    }
    } catch (e: any) {
      erros++;
      empresasComFalha.push((empresa as any).slug || (empresa as any).id);
      console.error(`[triggerDiario] empresa ${(empresa as any).slug} falhou:`, e?.message);
    }
  }

  const alerta = empresasComFalha.length ? ` · ⚠️ falharam: ${empresasComFalha.join(', ')}` : '';
  const message = `Diário: ${pilulas} pílulas WhatsApp, ${emails} e-mails, ${evidencias} evidências, ${nudges} nudges${alerta}`;
  await lock.liberar(message);
  return { pilulas, emails, evidencias, nudges, erros, empresasComFalha, message };
  } catch (err: any) {
    // Marca a execução como encerrada mesmo em falha global — senão o lock ficaria
    // pendurado e o retry de hoje seria recusado como "execução em andamento".
    await lock.liberar(`ERRO: ${err?.message || err}`);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONARH FOLLOW-UP: régua T+1 → T+5 dos leads da feira (F8 do sprint).
// Núcleo em lib/conarh/regua.ts (headless, sem gate) — aqui só o gate e a
// delegação, mesmo padrão do evolution-report. Diário ~12:00 UTC.
// ═══════════════════════════════════════════════════════════════════════════════

export async function conarhFollowup() {
  await requireAdminOrCronAction();
  const { executarReguaConarh } = await import('@/lib/conarh/regua');
  return executarReguaConarh();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Publicar no QStash (reutilizado de whatsapp-lote.js)
// ═══════════════════════════════════════════════════════════════════════════════

async function publishToQStash(payload: any, delaySec: number = 0) {
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!qstashToken) {
    // LANÇA — não "pula". Antes esta função dava `return` (sucesso implícito) e o
    // chamador seguia para `pilulas++` + carimbo do canal: o WhatsApp da coorte
    // inteira morria em silêncio, com o banco afirmando que a pílula saiu e a
    // /admin/engajamento reportando 100%. Lançar faz o `catch` do chamador contar
    // erro e NÃO carimbar, deixando o dia pendente e visível ao pós-voo.
    // O gêmeo `actions/whatsapp-lote.ts:18` sempre lançou; eram dois caminhos com
    // comportamentos opostos para a mesma falha.
    throw new Error('QSTASH_TOKEN não configurado — canal WhatsApp indisponível');
  }

  await assertWhatsappAvailable();

  // Usa APP_WEBHOOK_URL (app.{ROOT_DOMAIN}) — APP_URL pode apontar pra raiz
  // vertho.ai que está servida pelo Gamma e retorna 405 nos endpoints API.
  const webhookUrl = `${APP_WEBHOOK_URL}/api/webhooks/qstash/whatsapp-cis`;

  // QStash exige URL raw no path (sem encodeURIComponent) — encoded dá "invalid scheme"
  const res = await fetch(`${QSTASH_BASE_URL}/v2/publish/${webhookUrl}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${qstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': `${delaySec}s`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`QStash ${res.status}: ${detail}`);
  }
}
