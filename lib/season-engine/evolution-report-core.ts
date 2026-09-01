import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';
import { PILOTO_SPEC_VERSION } from '@/lib/season-engine/piloto-trava';
import { PROGRESSO, TRILHA } from '@/lib/status';
import { encadearProximaJornada } from './encadear-jornada';
// Régua de convergência em FONTE ÚNICA — o fixture da demo classifica pela
// mesma função, senão a vitrine mostraria um veredito que o motor não produz.
import { CONVERGENCIA, classificarConvergencia } from './convergencia';

/**
 * Fim de jornada = começo da próxima (modo `jornada`, 05/08/2026). Roda DEPOIS
 * de a trilha estar marcada como concluída, e nunca derruba o fechamento: se a
 * geração falhar, a jornada concluída segue concluída e a degradação fica
 * registrada (`jornada-encadeamento-falhou`) para o admin gerar pelo caminho
 * normal. Nos outros modos é um no-op — concluir é o fim do ciclo.
 *
 * O import do gerador é dinâmico porque `trilha-core` importa este arquivo em
 * cadeia; estático fecharia o ciclo.
 */
async function encadear(sbRaw: any, tdb: any, trilhaId: string): Promise<void> {
  try {
    const { gerarTemporadaCoreHeadless } = await import('./trilha-core');
    const r = await encadearProximaJornada(sbRaw, tdb, trilhaId, (args) =>
      gerarTemporadaCoreHeadless(sbRaw, args),
    );
    if (r.encadeou) {
      console.log(`[jornada] trilha ${trilhaId} concluída → jornada ${r.numeroTemporada} em "${r.competencia}" (${r.trilhaId})`);
    }
  } catch (e: any) {
    console.error('[jornada] encadeamento falhou:', e?.message || e);
  }
}

/**
 * Núcleo HEADLESS do Evolution Report — SEM gate de auth e SEM endpoint HTTP.
 * Extraído de actions/evolution-report.ts (que tinha a flag `internal`, dívida do
 * config/use-server-internal-allowlist.json): em arquivo 'use server' todo export
 * é endpoint e a flag era escolhida pelo CLIENTE — `internal: { empresaId: null }`
 * pulava o gate de admin E o recheck de tenant (auth bypass + escrita cross-tenant:
 * marcava trilha alheia como CONCLUIDA e sobrescrevia evolution_report).
 *
 * Quem chama:
 *   - AUTO-TRIGGERS com sessão de colab (rota /api/temporada/evaluation ao finalizar
 *     o cenário B): importam daqui DIRETO e passam `opts.empresaId` = tenant da
 *     SESSÃO (nunca do body do client), depois do assertColabAccess da rota.
 *   - Admin Vertho (tela de auditoria sem14): usa a action gatada em
 *     actions/evolution-report.ts, que aplica `requireAdminSupabase` e delega pra cá.
 *
 * B5 (defense-in-depth): quando `opts.empresaId` é informado, a trilha precisa
 * pertencer a esse tenant — rejeita trilhaId forjado de outro tenant. Omitido/null
 * = caller admin já gatado (cross-tenant autorizado) e o check é pulado.
 */

/**
 * Consolida semana 13 (qualitativa) + semana 14 (quantitativa) num Evolution Report.
 * Salva em trilhas.evolution_report e marca status=TRILHA.CONCLUIDA.
 */
export async function gerarEvolutionReportCore(trilhaId: string, opts?: { empresaId?: string | null }) {
  try {
    // Descobre tenant via trilha (raw — query inicial sem tenant conhecido).
    const sbRaw = createSupabaseAdmin();
    const { data: trilha, error: errTrilha } = await sbRaw.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, competencias_foco, descritores_selecionados, programa_modo, programa_config')
      .eq('id', trilhaId).maybeSingle();
    // Falha de banco ≠ trilha inexistente. Sem esta linha um timeout de pool
    // virava "Trilha não encontrada", que manda a pessoa procurar um dado que
    // está lá — é a mesma troca que faz o certificado acusar "participação
    // < 75%" quando quem falhou foi a query (F15 da auditoria).
    if (errTrilha) return { success: false, error: `Falha ao ler a trilha: ${errTrilha.message}` };
    if (!trilha) return { success: false, error: 'Trilha não encontrada' };

    // B5: caller com sessão de colab usa service-role (bypassa RLS) → EXIGE prova
    // do tenant e rejeita trilha de outro tenant. Impede escalonamento horizontal
    // se um caller futuro esquecer o assertColabAccess antes de passar o trilhaId.
    if (opts?.empresaId && trilha.empresa_id !== opts.empresaId) {
      return { success: false, error: 'Trilha de outro tenant — acesso negado.' };
    }

    const tdb = tenantDb(trilha.empresa_id);

    // Semanas da qualitativa/cenário vêm da config do programa (regular/DUO =
    // 13/14; piloto = 2/3), pela FONTE ÚNICA (carimbo da trilha → sys_config).
    const programaConfig = await resolverConfigDaTrilha(sbRaw, trilha);
    const isPiloto = programaConfig.modo === 'piloto';

    const { data: prog13 } = await tdb.from('temporada_semana_progresso')
      .select('reflexao').eq('trilha_id', trilhaId).eq('semana', programaConfig.semanaAcumulada).maybeSingle();
    const { data: prog14 } = await tdb.from('temporada_semana_progresso')
      .select('feedback, status').eq('trilha_id', trilhaId).eq('semana', programaConfig.semanaCenarioB).maybeSingle();

    const qualitativa = prog13?.reflexao?.evolucao_percebida || [];
    const quantitativa = prog14?.feedback?.avaliacao_por_descritor || [];
    const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];

    // GUARDS — o report é o ato que marca a trilha como TRILHA.CONCLUIDA; nunca
    // concluir sobre fechamento inexistente/incompleto (generate_report é
    // chamável a qualquer momento pela rota):
    if (prog14?.status !== PROGRESSO.CONCLUIDO) {
      return { success: false, error: `Fechamento (semana ${programaConfig.semanaCenarioB}) ainda não concluído — report não gerado.` };
    }
    if (!Array.isArray(quantitativa) || quantitativa.length === 0) {
      return { success: false, error: 'Fechamento sem avaliação por descritor (scorer não persistiu) — report não gerado.' };
    }
    if (isPiloto && prog14?.feedback?.spec_version !== PILOTO_SPEC_VERSION) {
      return { success: false, error: `Fechamento do piloto sem spec_version='${PILOTO_SPEC_VERSION}' (trava não aplicada?) — report não gerado.` };
    }
    // B4: NÃO bloqueia mais se o scorer avaliou N-1 descritores. Antes isso
    // PRENDIA a trilha (o colab via a avaliação mas a temporada nunca concluía,
    // e regerar relia o mesmo persistido). Agora gera com o que há (faltantes
    // ficam nulos no consolidado) + flag `incompleto` pro admin regerar/re-scorar.
    const pilotoIncompleto = isPiloto && quantitativa.length < descritores.length;

    // ── Piloto: relatório SEM delta/evolução ─────────────────────────────
    // 2 semanas não medem evolução. A competência entra como PONTO DE
    // PARTIDA (baseline) e o fechamento como DEMONSTRAÇÃO da avaliação.
    // nota_avaliacao já vem TRAVADA do fechamento (piso >= baseline), com
    // bruto + piso_aplicado preservados — nunca mutação silenciosa.
    if (isPiloto) {
      const consolidadoPiloto = descritores.map((d: any) => {
        const n = quantitativa.find((x: any) => x.descritor === d.descritor) || {};
        return {
          competencia: d.competencia || trilha.competencia_foco,
          descritor: d.descritor,
          baseline: n.nota_pre ?? d.nota_atual ?? null,
          nota_avaliacao: n.nota_pos ?? null,
          nota_avaliacao_bruta: n.nota_pos_bruto ?? n.nota_pos ?? null,
          piso_aplicado: !!n.piso_aplicado,
          justificativa_cenario: n.justificativa || null,
        };
      });
      const evolution_report = {
        modo: 'piloto',
        spec_version: prog14?.feedback?.spec_version || PILOTO_SPEC_VERSION,
        descritores: consolidadoPiloto,
        resumo_avaliacao: prog14?.feedback?.resumo_avaliacao || null,
        nota_media_pos: prog14?.feedback?.nota_media_pos ?? null,
        piso_aplicado: !!prog14?.feedback?.piso_aplicado,
        // B4: sinaliza fechamento incompleto (scorer avaliou < N descritores).
        incompleto: pilotoIncompleto,
        descritores_avaliados: quantitativa.length,
        descritores_esperados: descritores.length,
      };
      // O supabase-js RETORNA `{ error }` — não lança. Sem checar, um update que
      // não gravou saía daqui como `success: true`: o relatório aparecia na tela
      // e a trilha continuava aberta no banco, sem nada acusando.
      const { error: errUpPiloto } = await tdb.from('trilhas').update({
        evolution_report,
        evolution_generated_at: new Date().toISOString(),
        status: TRILHA.CONCLUIDA,
      }).eq('id', trilhaId);
      if (errUpPiloto) return { success: false, error: `Falha ao gravar o relatório: ${errUpPiloto.message}` };
      await encadear(sbRaw, tdb, trilhaId);
      return { success: true, evolution_report };
    }

    const consolidado = descritores.map((d: any) => {
      const q = qualitativa.find((x: any) => x.descritor === d.descritor) || {};
      const n = quantitativa.find((x: any) => x.descritor === d.descritor) || {};
      const nota_pre = n.nota_pre ?? d.nota_atual ?? 1.5;
      const nota_pos = n.nota_pos ?? q.nivel_percebido ?? nota_pre;
      return {
        competencia: d.competencia || trilha.competencia_foco,
        descritor: d.descritor,
        nota_pre, nota_pos,
        nivel_percebido: q.nivel_percebido ?? null,
        antes: q.antes || null,
        depois: q.depois || null,
        justificativa_cenario: n.justificativa || null,
        convergencia: classificarConvergencia({ nota_pre, nota_pos, nivel_percebido: q.nivel_percebido }),
      };
    });

    const evolution_report = {
      descritores: consolidado,
      insight_geral: prog13?.reflexao?.insight_geral || null,
      proximo_passo: prog13?.reflexao?.proximo_passo || null,
      resumo_avaliacao: prog14?.feedback?.resumo_avaliacao || null,
      nota_media_pos: prog14?.feedback?.nota_media_pos || null,
      resumo: {
        confirmadas: consolidado.filter(c => c.convergencia === CONVERGENCIA.CONFIRMADA).length,
        parciais: consolidado.filter(c => c.convergencia === CONVERGENCIA.PARCIAL).length,
        estagnacoes: consolidado.filter(c => c.convergencia === CONVERGENCIA.ESTAVEL).length,
      },
    };

    const { error: errUp } = await tdb.from('trilhas').update({
      evolution_report,
      evolution_generated_at: new Date().toISOString(),
      status: TRILHA.CONCLUIDA,
    }).eq('id', trilhaId);
    if (errUp) return { success: false, error: `Falha ao gravar o relatório: ${errUp.message}` };

    await encadear(sbRaw, tdb, trilhaId);

    return { success: true, evolution_report };
  } catch (err) {
    console.error('[VERTHO] gerarEvolutionReportCore:', err);
    return { success: false, error: err?.message };
  }
}
