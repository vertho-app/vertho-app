import { NextResponse } from 'next/server';
import { cleanupSessoes, triggerSegunda, triggerQuinta, triggerDiario, conarhFollowup, conarhReenvioT0, encerramentoIbipeba } from '@/actions/cron-jobs';
import { safeSecretEqual } from '@/lib/secure-compare';

// trigger_diario virou DISPATCHER (fan-out QStash por empresa — uma task por
// empresa, processada na rota worker com maxDuration próprio), então ele mesmo
// é rápido. O teto alto continua pelos demais jobs deste arquivo, que ainda
// varrem todas as empresas em loop sequencial na mesma lambda.
export const maxDuration = 800;

/**
 * GET /api/cron?action=<uma das do switch abaixo>
 *
 * 🔑 **Os horários vivem no `vercel.json`, e só lá.** É o arquivo que o Vercel
 * lê; qualquer tabela aqui é cópia, e cópia envelhece calada. Este cabeçalho
 * apontava três actions — duas delas SEM cron nenhum — e trocava UTC por BRT nas
 * três (D10 da auditoria de 22/08). Quem depurasse "o cron não rodou" a partir
 * daqui procuraria a execução três horas fora da janela real, e num arquivo onde
 * uma quinta perdida atrasa a jornada em uma semana inteira, sem catch-up.
 *
 * Para converter: **o cron do Vercel é UTC, e Brasília é UTC−3** (sem horário de
 * verão desde 2019). `0 5 * * *` sai às 2 da manhã em Brasília, não às 5 — e um
 * agendamento nas três primeiras horas do dia UTC cai no dia ANTERIOR em BRT.
 *
 * As actions que NÃO têm agendamento estão em `ACOES_SO_MANUAIS` logo abaixo, e
 * o guard confere os dois lados: agendado sem case, e case que não declarou de
 * que lado está. Nenhuma lista de horário aqui para envelhecer.
 *
 * Protegido por CRON_SECRET (header Authorization ou query param).
 */

/**
 * Cases que existem só para disparo MANUAL (botão de admin, curl, replay) — não
 * há entrada no `vercel.json` para eles, e isso é decisão, não esquecimento.
 *
 * ⚠️ Esta lista é conferida por `tests/unit/security/cron-agendado-existe.test.ts`
 * nos dois sentidos: nenhuma delas pode estar agendada, e todo case fora dela
 * tem que estar. Um case novo obriga a escolher um lado — que é o que faltava
 * quando o cabeçalho documentava 3 de 15.
 */
export const ACOES_SO_MANUAIS = [
  // seg = pílula única; qui = evidência. Quem roda hoje é o `trigger_diario`,
  // que cobre os dois e respeita a cadência configurada por empresa.
  'trigger_segunda',
  'trigger_quinta',
  // Recálculo pontual de taxa: roda quando alguém muda a régua, não por relógio.
  'recalcular_taxa',
  // ── CONARH 52: bloco OFF-LINE desde 31/08/2026 (lib/blocos-offline.ts) ────
  // Estas duas estavam AGENDADAS contra uma feira que terminou em 17/08: a
  // régua de follow-up rodava diariamente e o reenvio de T+0 a cada 15 min,
  // das 11h às 23h — 48 execuções por dia disparando cadência de WhatsApp para
  // os leads de um evento encerrado. Saíram do `vercel.json` na mesma edição.
  //
  // Os cases continuam no switch porque o código do bloco foi preservado, mas
  // `assertBlocoOnline('conarh')` recusa os dois: estão aqui por não terem
  // agendamento, não por serem uma porta manual de verdade.
  'conarh-followup',
  'conarh_reenvio_t0',
] as const;
export async function GET(req) {
  // Autenticação: Vercel envia Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const token = authHeader?.replace('Bearer ', '');
    if (!safeSecretEqual(token, cronSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // FAIL-CLOSED: sem CRON_SECRET em produção, o endpoint dispararia backups e
    // envios em massa para qualquer um. Recusa em vez de ficar aberto.
    console.error('[cron] FAIL-CLOSED: CRON_SECRET ausente em produção');
    return NextResponse.json({ error: 'Cron não configurado' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    let result;

    switch (action) {
      case 'cleanup_sessoes':
        result = await cleanupSessoes();
        // Aproveita o cron diário pra recalcular taxa_conclusao dos micro-conteúdos
        try {
          const { recalcularTaxaConclusao } = await import('@/actions/conteudos-metrics');
          const taxa = await recalcularTaxaConclusao();
          result.message = `${result.message || 'cleanup ok'} · taxa: ${taxa.message}`;
        } catch (e) {
          console.warn('[cron] taxa_conclusao falhou:', e.message);
        }
        break;

      case 'recalcular_taxa': {
        const { recalcularTaxaConclusao } = await import('@/actions/conteudos-metrics');
        result = await recalcularTaxaConclusao();
        break;
      }

      // Backup: falha vira 500 observável, como no reset_demo abaixo. Sem este
      // `throw` a rota devolvia `{ok: true}` com `result.success === false`
      // colado dentro — ou seja, o backup podia voltar INCOMPLETO todo dia e o
      // Vercel Cron registrava sucesso. De nada adianta a action passar a falhar
      // se quem a chama traduz a falha em 200.
      case 'backup_diario': {
        const { executarBackupDiario } = await import('@/actions/backup');
        const r = await executarBackupDiario();
        if (!r.success) throw new Error(r.error || 'backup falhou');
        result = r;
        break;
      }

      // Reset noturno dos ambientes de demonstração ao estado inicial, um por
      // vez. Convidados vencidos saem primeiro; qualquer convidado ainda em D+2
      // adia a recomposição daquele ambiente, para não perder sessão ou progresso.
      //
      // 🔑 **O adiamento é por AMBIENTE, e a lista sai de `DEMO_TENANT_PROFILES`.**
      // Até 01/09 este case chamava `resetAcmeDemo()` com o alvo escrito na mão:
      // o Grupo Sinal virou tenant demo em 25/08 e nunca teve reset noturno, e o
      // preflight de convidados lia só o ACME — um convidado ativo lá adiaria a
      // recomposição de todos. Ambiente que falha não impede os demais, mas o
      // erro sobe no fim: a rota traduz exceção em 500, que é o que torna a
      // falha observável no log do Vercel.
      case 'reset_demo': {
        const { cleanupExpiredDemoProspects } = await import('@/lib/demo/acme-prospect-tracking');
        const { DEMO_TENANT_PROFILES, resetDemoTenant, resetPausadoAte } = await import('@/lib/demo/reset-acme-demo');
        const { logAdminAction } = await import('@/lib/audit');
        const auditar = async (alvo, detalhes, resultado = null) => {
          try {
            await logAdminAction({
              adminEmail: 'system:cron',
              acao: 'demo.reset',
              alvo,
              detalhes,
              ...(resultado ? { resultado } : {}),
            });
          } catch { /* auditoria best-effort */ }
        };

        const ambientes = [];
        const falhas = [];
        const slugsDemo = Object.keys(DEMO_TENANT_PROFILES) as Array<keyof typeof DEMO_TENANT_PROFILES>;
        for (const slug of slugsDemo) {
          try {
            // A faxina de convidados VENCIDOS roda sempre, inclusive sob pausa:
            // ela é o que remove o acesso de quem passou do prazo. Pausar a
            // recomposição do ambiente não pode manter conta expirada de pé.
            const lifecycle = await cleanupExpiredDemoProspects(slug);

            // Pausa com data de fim (ver `resetPausadoAte`): enquanto vigora, o
            // ambiente não é RECOMPOSTO — é o que segura a experiência de um
            // convidado nomeado, que não tem o prazo D+2 do passaporte.
            const pausadoAte = resetPausadoAte(slug);
            if (pausadoAte) {
              const motivo = { skipped: true as const, motivo: 'reset_pausado', pausadoAte, expiredRemoved: lifecycle.expiredRemoved };
              await auditar(slug, motivo, 'parcial');
              ambientes.push({ slug, ...motivo });
              continue;
            }
            if (lifecycle.activeCount > 0) {
              await auditar(slug, { skipped: true, ...lifecycle }, 'parcial');
              ambientes.push({ slug, skipped: true, ...lifecycle });
              continue;
            }
            const r = await resetDemoTenant(slug);
            await auditar(slug, r.ok ? { counts: r.counts } : { error: r.error });
            if (!r.ok) throw new Error(r.error || 'reset do demo falhou');
            ambientes.push({ slug, counts: r.counts, expiredRemoved: lifecycle.expiredRemoved });
          } catch (erro) {
            const mensagem = erro?.message || String(erro);
            await auditar(slug, { error: mensagem }, 'erro');
            falhas.push(`${slug}: ${mensagem}`);
          }
        }

        if (falhas.length > 0) throw new Error(`reset do demo falhou · ${falhas.join(' | ')}`);
        const adiados = ambientes.filter((item) => item.skipped).length;
        result = {
          message: adiados > 0
            ? `${ambientes.length - adiados} ambiente(s) resetado(s) · ${adiados} adiado(s) por convidado em D+2`
            : `${ambientes.length} ambiente(s) resetado(s)`,
          ambientes,
        };
        break;
      }

      // Motor único da cadência (lê dia da pílula 1/2/evidência por empresa).
      case 'trigger_diario':
        result = await triggerDiario();
        break;

      /**
       * PÓS-VOO: "o que dizia que ia sair, saiu?" — 45 min DEPOIS do disparo.
       *
       * 🔴 Era chamado aqui mesmo, no fim do `trigger_diario`. Isso valia enquanto
       * o trigger ENVIAVA; desde que ele virou DISPATCHER (fan-out de uma task
       * QStash por empresa), medir no mesmo request é medir o enfileiramento — e
       * o alarme deixou de errar por omissão e passou a errar por afirmação: em
       * 17/08 gritou "nenhum WhatsApp saiu hoje · 36 pessoas sem nada" enquanto
       * as 36 pílulas eram entregues nos 20 segundos seguintes. Idem em 03/08.
       *
       * Alarme que grita num dia normal é pior que alarme ausente: ensina a
       * equipe a ignorá-lo justamente antes do dia em que ele estiver certo.
       */
      case 'postflight_entrega': {
        const { executarHealthCheck } = await import('@/lib/pipeline-health/core');
        result = await executarHealthCheck('postflight');
        break;
      }

      // PRÉ-VOO: avalia a entrega de AMANHÃ. Roda 10:00 UTC = ~25h antes do envio das
      // 11:00 UTC do dia seguinte. A folga é o ponto: achar o problema 5 minutos antes
      // não serve de nada — gerar um kit leva ~5min por DISC e um vídeo leva ~40min de
      // render. Não roda às 11:00 (24h exatas) só para não disputar a lambda com o
      // envio do próprio dia, que acontece nesse minuto.
      // AVISO DE PLANO PRONTO: quem teve relatório individual gerado DEPOIS do
      // corte e ainda não soube. Fora do laço de geração de propósito — relatório
      // sai em lote (34 em 38 min em Macaé) e um envio por item seria a rajada
      // que derrubou o número em 11/08. Aqui é espaçado e com teto.
      // Parâmetros OPCIONAIS, para reanúncio deliberado de um lote anterior ao
      // corte: `slug` (escopo obrigatório junto de `corte`), `corte` (ISO),
      // `teto` e `dry=1` (conta os elegíveis sem enviar). O cron automático não
      // passa nenhum deles e segue com o corte fixo. As envs de WhatsApp são
      // *Sensitive* e só existem aqui — por isso este é o único lugar de onde o
      // disparo pode sair; da máquina do dev, `enviarPorTemplate` não resolve o
      // nome do template.
      case 'avisar_planos': {
        const { avisarPlanosProntos } = await import('@/lib/notifications/avisar-plano-pronto');
        const slug = searchParams.get('slug');
        const corte = searchParams.get('corte');
        const teto = Number(searchParams.get('teto') || 0);
        result = await avisarPlanosProntos({
          ...(slug ? { apenasSlug: slug } : {}),
          ...(corte ? { corteIso: corte } : {}),
          ...(teto > 0 ? { teto } : {}),
          ...(searchParams.get('dry') === '1' ? { executar: false } : {}),
        });
        break;
      }

      case 'preflight_entrega': {
        const { executarHealthCheck } = await import('@/lib/pipeline-health/core');
        result = await executarHealthCheck('preflight');
        break;
      }

      // HORIZONTE: o que as PRÓXIMAS semanas vão pedir e ainda não existe. Semanal,
      // porque o pré-voo de 25h serve para corrigir o que existe, não para PRODUZIR:
      // kit leva ~5min por DISC. Medido em 27/07 (Ibipeba): a trilha troca de bloco de
      // competências na semana 5 e nenhum dos 3 pares (competência × cargo) novos tinha
      // kit, com o piloto já na semana 3 — ninguém dispara o que ninguém sabe que falta.
      case 'horizonte_kits': {
        const { executarHealthCheck } = await import('@/lib/pipeline-health/core');
        result = await executarHealthCheck('horizonte');
        break;
      }

      // Integridade estrutural (duplicatas, presos, órfãos). Independe de entrega e
      // serve para ver TENDÊNCIA: estes números crescem sozinhos onde falta constraint.
      case 'health_estrutural': {
        const { executarHealthCheck } = await import('@/lib/pipeline-health/core');
        result = await executarHealthCheck('estrutural');
        break;
      }

      // RECONCILIAÇÃO DE VÍDEO NOMINAL (F-V1): quem entrou depois do render da sua
      // célula fica no deck genérico PARA SEMPRE — a personalização fotografa a
      // coorte no instante do render e não há re-disparo. Aqui a lacuna é detectada
      // e a célula volta à fila; `personalizeCell` pula quem já está 'done'.
      // `limite` contém o custo: cada célula reconciliada custa um render de deck.
      case 'reconciliar_videos': {
        const { reconciliarPersonalizados } = await import('@/lib/video/reconciliar-personalizados');
        const limite = parseInt(searchParams.get('limite') || process.env.RECONCILIAR_VIDEOS_LIMITE || '3', 10);
        const r = await reconciliarPersonalizados({ executar: true, limite });
        result = {
          ...r,
          message: `Reconciliação: ${r.pessoasSemVideoNominal} pessoa(s) sem vídeo nominal em ${r.lacunas.length} célula(s) · ${r.celulasReenfileiradas.length} re-enfileirada(s)`
            + (r.ignoradasPorLimite ? ` · ${r.ignoradasPorLimite} adiada(s) pelo limite de ${limite}` : ''),
        };
        break;
      }

      // CUSTO DE IA POR TENANT: fecha a semana e manda por e-mail. Roda 07:00 UTC
      // de segunda = **04:00 em Brasília**, e cobre a semana FECHADA (segunda
      // anterior 00:00 → domingo 23:59:59 BRT). O horário tardio é o ponto: às
      // 04:00 não há mais chamada entrando na semana que se fecha, e o Batch da
      // madrugada — que grava com −50% e pode demorar horas — já assentou. Fechar
      // no domingo à noite contaria a mesma semana com um pedaço em voo.
      //
      // Parâmetros OPCIONAIS: `dry=1` monta a conta sem enviar (conferência sem
      // queimar um envio) e `agora=ISO` reprocessa uma semana anterior — o cron
      // automático não passa nenhum dos dois.
      case 'custo_ia_semanal': {
        const { executarRelatorioCustoIA } = await import('@/lib/custo-ia/relatorio-semanal');
        const agoraParam = searchParams.get('agora');
        const agora = agoraParam ? new Date(agoraParam) : undefined;
        if (agora && Number.isNaN(agora.getTime())) {
          return NextResponse.json({ error: 'agora inválido (use ISO)' }, { status: 400 });
        }
        result = await executarRelatorioCustoIA({
          ...(agora ? { agora } : {}),
          enviar: searchParams.get('dry') !== '1',
        });
        // O relatório é o produto: se nenhum destino recebeu, isto é falha, não
        // um 200 com a má notícia escondida no corpo. Mesma régua do backup.
        if (searchParams.get('dry') !== '1' && !result.enviados.length) {
          throw new Error(`relatório não chegou a ninguém: ${JSON.stringify(result.falhas)}`);
        }
        // O relatório inteiro no corpo da resposta são centenas de linhas que
        // ninguém lê no log do cron — o e-mail é o destino.
        delete (result as { relatorio?: unknown }).relatorio;
        break;
      }

      // CONARH 52 — régua T+1→T+5 dos leads da feira (F8). Best-effort por
      // lead dentro do núcleo; exceção global vira 500 observável no log.
      case 'conarh-followup':
        result = await conarhFollowup();
        break;

      // CONARH 52 — fila do T+0: re-tenta o recorte que não chegou (mig 221).
      // Roda de 15 em 15 min na janela da feira; é o gatilho que esvazia a fila
      // sem ninguém apertar nada quando a Meta aprovar o template.
      case 'conarh_reenvio_t0':
        result = await conarhReenvioT0();
        break;

      /**
       * Encerramento de Ibipeba — avisa quem ficou com semanas em aberto.
       *
       * AGENDADO com data de fim (`4-8 9` no vercel.json) e trava de janela no
       * código. Depois de 12/09/2026 a action fica inerte sozinha, e a entrada
       * do vercel.json pode sair. Ver o cabeçalho em `actions/cron-jobs.ts`.
       */
      case 'encerramento_ibipeba':
        result = await encerramentoIbipeba();
        break;

      // Legados — ver `ACOES_SO_MANUAIS` no topo (o guard confere que seguem
      // fora do vercel.json).
      case 'trigger_segunda':
        result = await triggerSegunda();
        break;

      case 'trigger_quinta':
        result = await triggerQuinta();
        break;

      default:
        return NextResponse.json({ error: `Action desconhecida: ${action}` }, { status: 400 });
    }

    console.log(`[cron] ${action}:`, result.message);
    return NextResponse.json({ ok: true, action, ...result });

  } catch (err) {
    console.error(`[cron] ${action} falhou:`, err.message);
    return NextResponse.json({ ok: false, action, error: err.message }, { status: 500 });
  }
}
