import { NextResponse } from 'next/server';
import { cleanupSessoes, triggerSegunda, triggerQuinta, triggerDiario, conarhFollowup, conarhReenvioT0 } from '@/actions/cron-jobs';
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

      // Reset noturno do ambiente de demonstração (tenant acme-demo) ao estado
      // inicial. Falha → 500 (observável no log do Vercel). Tenant-safe.
      case 'reset_demo': {
        const { resetAcmeDemo } = await import('@/lib/demo/reset-acme-demo');
        const r = await resetAcmeDemo();
        try {
          const { logAdminAction } = await import('@/lib/audit');
          await logAdminAction({ adminEmail: 'system:cron', acao: 'demo.reset', alvo: 'acme-demo', detalhes: r.ok ? { counts: r.counts } : { error: r.error } });
        } catch { /* auditoria best-effort */ }
        if (!r.ok) throw new Error(r.error || 'reset do demo falhou');
        try {
          const { removeAcmeProspectAuthUsers } = await import('@/lib/demo/acme-prospect-experience');
          await removeAcmeProspectAuthUsers();
        } catch (error: any) {
          // O reset tenant-scoped já revogou o contexto no produto. Auth órfão
          // é higiene best-effort e não deve transformar a recomposição em 500.
          console.warn('[cron.reset_demo] limpar convidados Auth:', error?.message);
        }
        result = { message: `demo resetada · ${JSON.stringify(r.counts)}`, counts: r.counts };
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
