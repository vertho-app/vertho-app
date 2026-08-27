'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { templateWhatsAppPilula, templateWhatsAppEvidencia, templateWhatsAppDesafioQuinta } from '@/lib/notifications';
import { resolverDesafiosDaSemana } from '@/lib/season-engine/kit/entrega-semana';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';
import { requireAdminOrCronAction } from '@/lib/auth/action-context';
import { processarEmpresaDiario } from '@/lib/fase4/trigger-diario-empresa';
import { publicarQStashTask, publicarWhatsappCis } from '@/lib/qstash-publish';
import { criarRelogioCadencia, maxPorDisparo } from '@/lib/whatsapp/cadencia';
import { deepLinkSemana } from '@/lib/notifications/pilula-envio';
import { APP_URL, tenantUrl } from '@/lib/domain';

const TIMEOUT_ABANDONO_HORAS = 48;
const TOTAL_SEMANAS = 14;
// Semanas de implementação do formato de 14 semanas. Este cron (`triggerSegunda`)
// serve o caminho LEGADO da fase 4 (`fase4_envios.sequencia`, sem
// `temporada_plano`) e NÃO está agendado no vercel.json — roda só por disparo
// manual. Quem responde pela pergunta no caminho vivo é
// `ehSemanaDeImplementacao` (lib/season-engine/trilha-runtime), que lê o plano
// da trilha e por isso acerta na jornada de 7 semanas.
const SEMANAS_IMPL = [4, 8, 12];

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
  let adiados = 0;

  // Cadência pela política única (lib/whatsapp/cadencia). Era `totalEnviados * 2`
  // — 2s por mensagem, a taxa EXATA que bloqueou o número em 11/08/2026. Este
  // caminho é legado (o cron vivo é `trigger_diario`), mas continua alcançável
  // por `/api/cron?action=trigger_segunda`, e um disparo manual num tenant grande
  // sairia na velocidade do incidente.
  //
  // UM relógio para a execução inteira, não um por empresa: aqui o loop de
  // empresas é sequencial dentro da MESMA invocação, e o que o WhatsApp vê é a
  // soma — reiniciar o contador a cada empresa devolveria a rajada pela janela.
  const relogio = criarRelogioCadencia();

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
        if (relogio.tetoAtingido()) {
          // Teto de volume: adia. Sem carimbo de envio, a pessoa continua
          // pendente e entra no próximo disparo.
          adiados++;
        } else {
          const mensagem = templateWhatsAppPilula(nome, semana, conteudo);
          try {
            await publishToQStash({ telefone, mensagem }, relogio.proximo());
            totalEnviados++;
          } catch { totalErros++; }
        }
      }

      // Atualizar último envio
      await tdb.from('fase4_envios')
        .update({ ultimo_envio: new Date().toISOString() })
        .eq('id', envio.id);
    }
  }

  const adiadoSeg = adiados > 0 ? `, ${adiados} adiados pelo teto de ${maxPorDisparo()}` : '';
  return { enviados: totalEnviados, erros: totalErros, adiados, message: `Segunda: ${totalEnviados} pílulas enviadas${adiadoSeg}` };
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
  let adiados = 0;

  // Um relógio para a execução inteira — mesmo motivo do triggerSegunda: nudge e
  // evidência saem pelo MESMO número, então precisam compartilhar a cadência e o
  // teto (dois contadores independentes dobrariam a taxa real).
  const relogio = criarRelogioCadencia();

  for (const empresa of empresas) {
    const tdb = tenantDb(empresa.id);
    const { data: envios, error: errEnvios } = await tdb.from('fase4_envios')
      .select('id, colaborador_id, semana_atual, sequencia, status, ultimo_envio, ultima_evidencia_em, colaboradores!inner(nome_completo, email, whatsapp, perfil_dominante, cargo)')
      .eq('status', 'ativo');

    // `!envios?.length` trata igual duas coisas MUITO diferentes: "esta empresa
    // não tem ninguém ativo" e "não consegui ler quem está ativo". O segundo
    // caso pulava a empresa inteira em silêncio, e o cron reportava sucesso —
    // a mesma classe do F-C4 (`precarregarKits` devolvendo Map vazio truthy).
    if (errEnvios) {
      console.error(`[triggerQuinta] leitura de fase4_envios falhou (empresa ${empresa.id}):`, errEnvios.message);
      totalErros++;
      continue;
    }
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
          if (telefone && !relogio.tetoAtingido()) {
            const nudgeMsg = `Olá, ${nome}! 👋\n\nNotamos que você está há mais de 2 semanas sem interagir com sua trilha de desenvolvimento.\n\nSua evolução é importante para nós. Que tal retomar hoje?\n\n— Vertho Mentor IA`;
            try {
              await publishToQStash({ telefone, mensagem: nudgeMsg }, relogio.proximo());
              nudges++;
            } catch {}
          } else if (telefone) {
            adiados++;
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
          const { data: trilha, error: errTrilha } = await tdb.from('trilhas')
            .select('temporada_plano, competencia_foco, programa_modo, programa_config')
            .eq('colaborador_id', envio.colaborador_id)
            .order('numero_temporada', { ascending: false }).limit(1).maybeSingle();
          // Falha de leitura aqui não impede o envio — cai na mensagem genérica
          // de evidência, que é degradação legítima na ENTREGA. O que não pode
          // é ser indistinguível de "esta pessoa não tem trilha".
          if (errTrilha) throw new Error(`leitura da trilha falhou: ${errTrilha.message}`);
          const plano = (trilha?.temporada_plano || []) as any[];
          const plan = plano.find((s: any) => Number(s.semana) === Number(semana)) || plano[semana - 1];
          const disc = String(envio.colaboradores.perfil_dominante || '').trim().charAt(0).toUpperCase();
          if (plan && plan.tipo !== 'aplicacao' && disc) {
            // FONTE ÚNICA — a mesma da tela e da conversa de Evidências. Este
            // trecho juntava TODAS as entregas com `\n\n`, ignorando
            // `desafioUnicoPorCompetencia`: a pessoa lia uma tarefa na tela e
            // recebia duas por WhatsApp. E resolvia o kit sem `cargo`, que
            // `cargoServe` trata como curinga — podia cobrar a tarefa escrita
            // para outro cargo (o que a tela barra desde 29/07).
            const desafios = await resolverDesafiosDaSemana(sbRaw, plan, {
              empresaId: empresa.id,
              disc,
              cargo: (envio.colaboradores as any).cargo,
              competenciaFallback: trilha?.competencia_foco,
              desafioUnicoPorCompetencia: getProgramaConfigDaTrilha(trilha as any).desafioUnicoPorCompetencia,
              colaboradorId: envio.colaborador_id,
            });
            desafioTexto = desafios.map((d) => d.desafio_texto).join('\n\n');
          }
        } catch (e: any) { console.warn('[triggerQuinta] resolver desafio:', e?.message); }

        if (relogio.tetoAtingido()) {
          adiados++;
        } else {
          // O template aprovado da evidência exige o link da semana (variável
          // {{3}}). O deep-link é do TENANT, não do domínio genérico — mesma
          // regra do trigger diário.
          const linkSemana = deepLinkSemana(
            (empresa as any).slug ? tenantUrl((empresa as any).slug) : APP_URL,
            semana,
          );
          const mensagem = desafioTexto ? templateWhatsAppDesafioQuinta(nome, desafioTexto) : templateWhatsAppEvidencia(nome, semana, linkSemana);
          try {
            await publishToQStash({ telefone, mensagem }, relogio.proximo());
            totalEnviados++;
          } catch { totalErros++; }
        }
      }

      // Avançar semana + marcar processamento do dia (idempotência, migration 120)
      await tdb.from('fase4_envios')
        .update({ semana_atual: semana + 1, ultima_evidencia_em: new Date().toISOString() })
        .eq('id', envio.id);
    }
  }

  const adiadoQui = adiados > 0 ? `, ${adiados} adiados pelo teto de ${maxPorDisparo()}` : '';
  return { enviados: totalEnviados, erros: totalErros, nudges, adiados, message: `Quinta: ${totalEnviados} evidências solicitadas, ${nudges} nudges${adiadoQui}` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER DIÁRIO — DISPATCHER (fan-out por empresa).
// Lê a cadência de CADA empresa (dia da 1ª pílula, 2ª pílula DUO, evidência) e,
// para as que têm algo HOJE, publica UMA task QStash por empresa na rota worker
// /api/webhooks/qstash/trigger-diario-empresa — que processa UMA empresa por
// invocação (maxDuration próprio). Antes isto era um loop sequencial numa única
// lambda: com muitas empresas estourava o maxDuration e as do fim ficavam sem
// envio. O núcleo por empresa vive em lib/fase4/trigger-diario-empresa.ts
// (idempotente por dia via carimbos por canal; o avanço de semana continua na
// evidência). Sem QSTASH_TOKEN (dev local) → fallback: processa inline em loop.
// ═══════════════════════════════════════════════════════════════════════════════


export async function triggerDiario() {
  await requireAdminOrCronAction();

  // LOCK DIÁRIO (F-C3): duas execuções sobrepostas enfileirariam 2× as tasks
  // (pílula duplicada nos dois canais e avanço de semana aplicado 2×, que PULA
  // conteúdo). O lock fica no DISPATCHER — o worker é idempotente pelos carimbos.
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

  // Só empresas com cadência HOJE geram task (defaults: pílula 1 = seg, pílula
  // 2 DUO = ter, evidência = qui). O worker re-checa — aqui é para não enfileirar
  // task à toa.
  const doDia = (empresas as any[]).filter((e) => {
    const cadencia = e.sys_config?.cadencia || {};
    return hoje === (cadencia.fase4_dia_pilula ?? 1)
        || hoje === (cadencia.fase4_dia_pilula2 ?? 2)
        || hoje === (cadencia.fase4_dia_evidencia ?? 4);
  });

  // FAN-OUT: uma task por empresa, sem delay entre tasks (o espaçamento de 2s
  // por mensagem passou a ser POR EMPRESA, dentro do worker).
  if (process.env.QSTASH_TOKEN) {
    let empresasEnfileiradas = 0;
    const empresasComFalha: string[] = [];
    for (const empresa of doDia) {
      try {
        await publicarQStashTask('/api/webhooks/qstash/trigger-diario-empresa', { empresaId: empresa.id });
        empresasEnfileiradas++;
      } catch (e: any) {
        empresasComFalha.push(empresa.slug || empresa.id);
        console.error(`[triggerDiario] falha ao enfileirar ${empresa.slug || empresa.id}:`, e?.message);
      }
    }
    const alerta = empresasComFalha.length ? ` · ⚠️ não enfileiradas: ${empresasComFalha.join(', ')}` : '';
    const message = `Diário (fan-out): ${empresasEnfileiradas}/${doDia.length} empresas enfileiradas${alerta}`;
    await lock.liberar(message);
    return { pilulas: 0, emails: 0, evidencias: 0, nudges: 0, erros: empresasComFalha.length, empresasEnfileiradas, empresasComFalha, message };
  }

  // FALLBACK sem QSTASH (dev local — mesmo padrão de app/radar/actions.ts):
  // processa as empresas inline em loop, como antes do fan-out.
  console.warn('[triggerDiario] QSTASH_TOKEN ausente — processando INLINE (sem fan-out)');
  let pilulas = 0, emails = 0, evidencias = 0, nudges = 0, erros = 0, adiadosPorTeto = 0;
  // Empresas cujo processamento explodiu — reportadas no retorno em vez de sumirem.
  const empresasComFalha: string[] = [];

  for (const empresa of doDia) {
    // ISOLAMENTO POR EMPRESA: sem este try/catch, uma exceção (carimbo, tenantDb,
    // plano corrompido) aborta o run INTEIRO e todas as empresas seguintes do dia
    // ficam sem envio — e o Vercel Cron não re-tenta. Uma empresa quebrada não pode
    // calar as outras (FMEA §1.3). No fan-out esse isolamento é a task QStash.
    try {
      const r = await processarEmpresaDiario(empresa, { hoje, hojeUTC });
      pilulas += r.pilulas; emails += r.emails; evidencias += r.evidencias;
      nudges += r.nudges; erros += r.erros; adiadosPorTeto += r.adiadosPorTeto;
    } catch (e: any) {
      erros++;
      empresasComFalha.push((empresa as any).slug || (empresa as any).id);
      console.error(`[triggerDiario] empresa ${(empresa as any).slug} falhou:`, e?.message);
    }
  }

  const alerta = empresasComFalha.length ? ` · ⚠️ falharam: ${empresasComFalha.join(', ')}` : '';
  // Adiados aparecem no texto do lock: "12 pílulas" com 200 na coorte só é lido
  // corretamente ao lado de "188 adiados pelo teto".
  const adiadoTxt = adiadosPorTeto ? ` · ${adiadosPorTeto} adiados pelo teto` : '';
  const message = `Diário (inline): ${pilulas} pílulas WhatsApp, ${emails} e-mails, ${evidencias} evidências, ${nudges} nudges${adiadoTxt}${alerta}`;
  await lock.liberar(message);
  return { pilulas, emails, evidencias, nudges, erros, adiadosPorTeto, empresasComFalha, message };
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
// CONARH T+0 PENDENTE: re-tenta o recorte que não chegou.
// Núcleo em lib/conarh/reenvio-t0.ts. A cada 15 min na janela da feira — é o que
// faz a fila esvaziar SOZINHA no minuto em que a Meta aprovar o template
// (`recorte_demonstracao` estava PENDING em 18/08, dia 1). Rodada sem pendente é
// uma query que devolve 0 linhas: barata o bastante para não valer um interruptor.
// ═══════════════════════════════════════════════════════════════════════════════

export async function conarhReenvioT0() {
  await requireAdminOrCronAction();
  const { reenviarPendentesT0 } = await import('@/lib/conarh/reenvio-t0');
  return reenviarPendentesT0();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Publicar no QStash (reutilizado de whatsapp-lote.js)
// ═══════════════════════════════════════════════════════════════════════════════

// Mantida para os triggers legados (segunda/quinta); o corpo vive em
// lib/qstash-publish.ts para ser compartilhado com o núcleo do trigger diário
// (arquivo 'use server' não pode exportar helper — viraria endpoint).
async function publishToQStash(payload: any, delaySec: number = 0) {
  return publicarWhatsappCis(payload, delaySec);
}
