'use server';

import { tenantDb } from '@/lib/tenant-db';
import { mapComLimite } from '@/lib/concurrency';
import { callAI, type AIConfig } from '../ai-client';
import { extractJSON } from '../utils';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { getModelForTask, DEFAULT_TASK_MODELS } from '@/lib/ai-tasks';
import { travaRegeneracao, montarContextoIA3 } from '@/lib/ia3-cenarios';
import { TEMP, type Fase5Config } from './_shared';
import { escopoTenantDaLinha } from '@/lib/tenant-predicado';
import { celulasSemCenarioB, ehIntegrador, aReferenciaDaCelula } from '@/lib/season-engine/cenario-b';
import { ehCargoAncoraLideranca } from '@/lib/simuladores/lideranca/matriz-global';
import { buildCenarioBPrompts, buildCheckCenarioBUser, SYSTEM_CHECK_CENARIO_B, type ContextoCenarioB } from '@/lib/cenarios-b-prompt';

// ── Contexto e prompts do Cenário B ───────────────────────────────────────────
// Os prompts (gerador e auditor) vivem em lib/cenarios-b-prompt.ts e usam o MESMO
// contexto do Cenário A (montarContextoIA3): cargo com o contexto organizacional,
// régua N1 a N4, valores, perfil ideal e PPP de rede. Até 18/09/2026 o B recebia
// só o nome do cargo, e o bloco "CONTEXTO PPP / DOSSIÊ" levava só a lista de
// valores; o auditor via um PPP que o gerador não via.

/**
 * Versão do auditor gravada com a nota. Nota de outra versão não é comparável: em
 * 18/09/2026 o auditor passou a ver o contexto do cargo e a regra de anonimização,
 * e a trava de regeneração não pode comparar régua velha com régua nova.
 */
const VERSAO_AUDITOR_B = 2;

/** Contexto da célula (competência × cargo): o mesmo do A, com o PPP de REDE (o B não tem dimensão de escola). */
async function contextoDaCelula(sbRaw: any, empresaId: string, cargo: string, competenciaId: string):
  Promise<{ ok: true; ctx: ContextoCenarioB; comp: any } | { ok: false; error: string }> {
  const mc = await montarContextoIA3(sbRaw, empresaId, cargo, competenciaId, null);
  if ('error' in mc) return { ok: false, error: mc.error };
  const { empresa, comp, descritores, contextoPPP, valores, cargoDetalhe, gabCIS } = mc.ctx;
  return { ok: true, comp, ctx: { empresa, cargoNome: cargo, cargoDetalhe, comp, descritores, valores, contextoPPP, gabCIS } };
}

/** O cenário A de referência da célula (o de rede, senão o mais recente), com `alternativas`. */
async function cenarioADaCelula(tdb: any, competenciaId: string, cargo: string) {
  const { data, error } = await tdb.from('banco_cenarios')
    .select('id, titulo, descricao, cargo, competencia_id, ppp_escola_id, alternativas, created_at')
    .eq('competencia_id', competenciaId)
    .eq('cargo', cargo)
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');
  if (error) throw new Error(`cenário A da célula: ${error.message}`);
  return aReferenciaDaCelula((data || []) as any[]);
}

// Helper: audita 1 cenário B com a mesma lente do gerador. `cenarioA` é opcional:
// se passado, o auditor compara B com A.
async function avaliarCenB(cen: any, ctx: ContextoCenarioB, modelo: string | null, cenarioA: any, empresaId: string | null) {
  const user = buildCheckCenarioBUser(ctx, cen, cenarioA);
  const resposta = await callAI(SYSTEM_CHECK_CENARIO_B, user, { model: modelo || DEFAULT_TASK_MODELS['cenarios_b_check'] }, 4096, {
    temperature: TEMP, taskKey: 'cenarios_b_check', empresaId,
  });
  const resultado = await extractJSON(resposta);
  if (!resultado?.nota) return { success: false, error: 'Check não retornou nota' };

  // Validar coerência erro_grave × nota (veredito EM CÓDIGO)
  if (resultado.erro_grave && resultado.nota > 60) resultado.nota = 60;

  const statusCheck = resultado.nota >= 90 ? 'aprovado'
    : resultado.nota >= 80 ? 'aprovado_com_ressalvas'
    : 'revisar';

  return { success: true as const, resultado, statusCheck };
}

/** Persiste o resultado do check numa row existente (shape do Cenário B). */
async function persistirCheckCenB(sb: any, cenId: string, resultado: any, statusCheck: string) {
  const { data: cenLinha } = await sb.from('banco_cenarios').select('empresa_id').eq('id', cenId).maybeSingle();
  const { error: errCheck } = await escopoTenantDaLinha(
    sb.from('banco_cenarios').update({
      nota_check: resultado.nota,
      status_check: statusCheck,
      dimensoes_check: resultado.dimensoes || null,
      justificativa_check: resultado.justificativa || null,
      sugestao_check: resultado.sugestao || null,
      alertas_check: {
        alertas: resultado.alertas || [],
        ponto_mais_forte: resultado.ponto_mais_forte || null,
        ponto_mais_fraco: resultado.ponto_mais_fraco || null,
        problema_principal_vs_cenario_a: resultado.problema_principal_vs_cenario_a || null,
        riscos_de_triangulacao: resultado.riscos_de_triangulacao || [],
        perguntas_com_risco: resultado.perguntas_com_risco || [],
        versao_auditor: VERSAO_AUDITOR_B,
      },
      checked_at: new Date().toISOString(),
    }).eq('id', cenId),
    cenLinha,
  );
  // O guard E11 pegou este site quando a refatoração do D2 trocou a FORMA da
  // escrita: o `error` nunca foi checado aqui, mas antes o padrão não era
  // detectável. Nota do check que não grava é nota que some — a tela mostra o
  // cenário como não-checado e alguém paga a IA de novo.
  if (errCheck) console.error('[persistirCheckCenB] check não gravado:', errCheck.message);
}

/** Avalia E persiste (checks avulsos e em lote usam este). */
async function runCheckOnCenB(sb: any, cen: any, ctx: ContextoCenarioB, modelo: string | null, cenarioA: any, empresaId: string | null) {
  const av = await avaliarCenB(cen, ctx, modelo, cenarioA, empresaId);
  if (!av.success) return av as any;
  await persistirCheckCenB(sb, cen.id, av.resultado, av.statusCheck);
  return { success: true, nota: av.resultado.nota, status: av.statusCheck };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. GERAR CENÁRIOS B EM LOTE
// Cria cenários B customizados por cargo/competência (diferente do A)
// Inclui: dilema ético, faceta avaliada, validação Gemini
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarCenariosBLote(empresaId: string, aiConfig: Fase5Config = {}) {
  // Gate TENANT-SCOPED (auditoria 23/07): lê PPP e escreve cenários — empresaId
  // do client precisa bater com o tenant da sessão.
  const sbRaw = await requireEmpresaSupabase(empresaId, 'content.manage', 'gerarCenariosBLote');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // Cenários A existentes: banco_cenarios é misto, mas filtramos por
    // empresa explicitamente, então tdb está OK (deduz pelo tenantId).
    // `ppp_escola_id` e `created_at` escolhem o A de referência da célula;
    // `alternativas` leva a faceta e o trade-off do A ao prompt do B (antes o
    // select não trazia a coluna e esse bloco do prompt saía sempre vazio).
    const { data: cenariosA, error: errA } = await tdb.from('banco_cenarios')
      .select('id, titulo, descricao, cargo, competencia_id, ppp_escola_id, alternativas, created_at')
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');
    if (errA) return { success: false, error: `Falha ao ler os cenários A: ${errA.message}` };

    if (!cenariosA?.length) return { success: false, error: 'Nenhum cenário A encontrado. Rode IA3 primeiro.' };

    const compIdsNeeded = [...new Set(cenariosA.map(c => c.competencia_id).filter(Boolean))];
    const compMap = {};

    // Nomes das competências (para a cobertura por integrador). O contexto
    // completo de cada célula vem de `contextoDaCelula`, o mesmo do A.
    const { data: compsRows } = compIdsNeeded.length
      ? await tdb.from('competencias').select('id, nome, descricao, cod_comp, cargo').in('id', compIdsNeeded)
      : { data: [] };
    for (const comp of compsRows || []) compMap[comp.id] = comp;
    const compIds = Object.keys(compMap);

    // Uma geração por CÉLULA (competência × cargo), não por cenário A: numa rede
    // há um A por PPP, e o lote gerava N B para a mesma célula (FMEA F-C14).
    // Célula coberta por B do cargo (âncora ou integrador) é pulada; os
    // cargos-âncora do simulador de liderança não levam B.
    const { data: cenariosB, error: errB } = await tdb.from('banco_cenarios')
      .select('competencia_id, cargo, alternativas')
      .eq('tipo_cenario', 'cenario_b');
    if (errB) return { success: false, error: `Falha ao ler os cenários B: ${errB.message}` };
    const nomePorId = new Map<string, string>(Object.values(compMap).map((c: any) => [c.id, c.nome]));
    const celulas = celulasSemCenarioB(cenariosA as any[], cenariosB || [], nomePorId, { excluirCargo: ehCargoAncoraLideranca });
    const totalCelulas = new Set((cenariosA as any[])
      .filter((a) => a.competencia_id && a.cargo && !ehCargoAncoraLideranca(a.cargo))
      .map((a) => `${a.competencia_id}::${a.cargo}`)).size;

    const checkModel = aiConfig?.checkModel;
    // GERAÇÃO em paralelo (limite 3 — TPM de IA); cada item devolve um
    // marcador e os contadores são derivados no fim (semântica preservada).
    const marcadores = await mapComLimite(celulas, 3, async ({ referencia }) => {
      const cenA: any = referencia;
      const celula = await contextoDaCelula(sbRaw, empresaId, cenA.cargo, cenA.competencia_id);
      if ('error' in celula) { console.warn(`[CenB] ${cenA.cargo}: ${celula.error}`); return 'skip_sem_comp'; }
      const comp = celula.comp;

      const { system, user } = buildCenarioBPrompts(celula.ctx, cenA);
      let resultado = await callAI(system, user, aiConfig, 32768, { temperature: TEMP, taskKey: 'cenarios_b', empresaId });
      let cenarioData = await extractJSON(resultado);

      // ── Validação pós-resposta ──
      if (cenarioData) {
        const errors: string[] = [];
        if (!cenarioData.p1 || !cenarioData.p2 || !cenarioData.p3 || !cenarioData.p4) errors.push('Faltam perguntas p1-p4');
        if (typeof cenarioData.confianca_cenario === 'number' && (cenarioData.confianca_cenario < 0 || cenarioData.confianca_cenario > 1)) errors.push('confianca fora de 0-1');
        if (Array.isArray(cenarioData.stakeholders_centrais) && cenarioData.stakeholders_centrais.length > 2) errors.push('Max 2 stakeholders');

        // Heurística de semelhança: overlap de palavras substantivas entre A e B
        const stopwords = new Set(['de','da','do','das','dos','em','na','no','nas','nos','um','uma','o','a','os','as','que','e','para','com','por','se','ao','ou','mais','não','como','mas','sua','seu','seus','suas','este','esta','esse','essa']);
        const extractWords = (t: string) => (t || '').toLowerCase().replace(/[^a-záàâãéèêíóòôõúç\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
        const wordsA = new Set(extractWords(cenA.descricao));
        const wordsB = extractWords(cenarioData.descricao || '');
        const overlap = wordsB.filter(w => wordsA.has(w)).length;
        const overlapPct = wordsB.length > 0 ? overlap / wordsB.length : 0;
        if (overlapPct > 0.6) errors.push(`Semelhança excessiva com Cenário A (${Math.round(overlapPct * 100)}% overlap)`);

        if (errors.length > 0) {
          console.warn(`[CenB] ${comp.nome}: validação (${errors.join('; ')}). Retry.`);
          resultado = await callAI(system, user + `\n\n═══ CORREÇÃO NECESSÁRIA ═══\n${errors.join('\n')}`, aiConfig, 32768, { temperature: TEMP, taskKey: 'cenarios_b', empresaId });
          const retry = await extractJSON(resultado);
          if (retry?.titulo) cenarioData = retry;
        }
      }

      if (!cenarioData?.titulo) return 'falha';

      // Persistência enriquecida
      const { data: inserted, error: insErr } = await tdb.from('banco_cenarios').insert({
        competencia_id: cenA.competencia_id,
        cargo: cenA.cargo,
        titulo: cenarioData.titulo,
        descricao: cenarioData.descricao,
        p1: cenarioData.p1,
        p2: cenarioData.p2,
        p3: cenarioData.p3,
        p4: cenarioData.p4,
        alternativas: {
          p1: cenarioData.p1,
          p2: cenarioData.p2,
          p3: cenarioData.p3,
          p4: cenarioData.p4,
          faceta_avaliada: cenarioData.faceta_avaliada || null,
          facetas_secundarias: cenarioData.facetas_secundarias || [],
          diferenca_estrutural_vs_cenario_a: cenarioData.diferenca_estrutural_vs_cenario_a || null,
          por_que_essa_variacao_importa: cenarioData.por_que_essa_variacao_importa || null,
          tradeoff_testado: cenarioData.tradeoff_testado || null,
          armadilha_de_resposta_generica: cenarioData.armadilha_de_resposta_generica || null,
          objetivo_diagnostico: cenarioData.objetivo_diagnostico || null,
          referencia_avaliacao: cenarioData.referencia_avaliacao || null,
          dilema_etico: cenarioData.dilema_etico_embutido || null,
          confianca_cenario: typeof cenarioData.confianca_cenario === 'number' ? Math.max(0, Math.min(1, cenarioData.confianca_cenario)) : null,
          riscos_do_cenario: cenarioData.riscos_do_cenario || [],
        },
        tipo_cenario: 'cenario_b',
      }).select('id, titulo, descricao, cargo, alternativas').single();
      // 23505: outro lote gravou o B desta célula enquanto este gerava (índice
      // único da célula, migration 261). A célula está coberta; não é falha.
      if (insErr?.code === '23505') return 'skip_ja_tem';
      if (insErr) { console.error('[cenarioB insert]', insErr.message); return 'falha'; }

      // Check inline se modelo foi informado
      if (checkModel && inserted) {
        try {
          const chk = await runCheckOnCenB(sbRaw, inserted, celula.ctx, checkModel, cenA, empresaId);
          if (chk.success) {
            return chk.status === 'aprovado' ? 'gerado_aprovado' : 'gerado_revisar';
          }
        } catch (e) { console.error('[cenarioB check]', e.message); }
      }
      return 'gerado';
    });

    const gerados = marcadores.filter(m => m.startsWith('gerado')).length;
    const aprovados = marcadores.filter(m => m === 'gerado_aprovado').length;
    const revisar = marcadores.filter(m => m === 'gerado_revisar').length;

    const jaCobertas = marcadores.filter(m => m === 'skip_ja_tem').length;
    let msg = `${gerados} cenários B gerados`;
    if (checkModel) msg += ` | ${aprovados} aprovados, ${revisar} para revisar`;
    msg += ` (${celulas.length - jaCobertas} de ${totalCelulas} células sem B; ${cenariosA.length} cenários A, ${compIds.length} competências)`;
    return { success: true, message: msg };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1b. CHECK DE 1 CENÁRIO B
// ══════════════════════════════════════════════════════════════════════════════

export async function checkCenarioBUm(cenarioId: string, modelo: string | null = null) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  try {
    // banco_cenarios é misto → raw por id
    const { data: cen } = await sbRaw.from('banco_cenarios')
      .select('id, empresa_id, titulo, descricao, cargo, competencia_id, alternativas')
      .eq('id', cenarioId).single();
    if (!cen) return { success: false, error: 'Cenário não encontrado' };

    if (!cen.empresa_id) return { success: false, error: 'Cenário sem empresa_id (catálogo nacional não tem check)' };
    const tdb = tenantDb(cen.empresa_id);

    // A mesma lente do gerador (contexto do A) e o mesmo A de referência do lote.
    const celula = await contextoDaCelula(sbRaw, cen.empresa_id, cen.cargo, cen.competencia_id);
    if ('error' in celula) return { success: false, error: celula.error };
    const cenA = await cenarioADaCelula(tdb, cen.competencia_id, cen.cargo);

    const modeloResolvido = modelo || await getModelForTask(cen.empresa_id, 'cenarios_b_check');
    const r = await runCheckOnCenB(sbRaw, cen, celula.ctx, modeloResolvido, cenA, cen.empresa_id);
    if (!r.success) return r;
    return { success: true, message: `Check: ${r.nota}pts — ${r.status}`, nota: r.nota, status: r.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1c. REGENERAR 1 CENÁRIO B (usa feedback do check anterior)
// ══════════════════════════════════════════════════════════════════════════════

export async function regenerarCenarioB(cenarioId: string, aiConfig: AIConfig = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  try {
    // banco_cenarios é misto → raw por id
    const { data: cen, error: cenErr } = await sbRaw.from('banco_cenarios')
      .select('id, empresa_id, competencia_id, cargo, titulo, descricao, alternativas, nota_check, justificativa_check, sugestao_check')
      .eq('id', cenarioId).maybeSingle();
    if (cenErr) return { success: false, error: `Falha ao ler o cenário: ${cenErr.message}` };
    if (!cen) return { success: false, error: 'Cenário não encontrado' };

    // Integrador (cobre mais de uma competência, Ibipeba 01/09/2026): o prompt
    // daqui gera B de UMA competência e reescreve `alternativas` inteiro, o que
    // apagaria `competencias_integradas`. O fechamento das trilhas de duas
    // competências passaria a não ter B elegível.
    if (ehIntegrador((cen as any).alternativas)) {
      return { success: false, integrador: true, error: 'Cenário B integrador (cobre mais de uma competência): regerar por aqui apagaria a integração. Mantido como está.' };
    }

    if (!cen.empresa_id) return { success: false, error: 'Cenário sem empresa_id (não pode regenerar catálogo nacional)' };
    const tdb = tenantDb(cen.empresa_id);

    // O mesmo contexto do A e o mesmo A de referência do lote e do check.
    const celula = await contextoDaCelula(sbRaw, cen.empresa_id, cen.cargo, cen.competencia_id);
    if ('error' in celula) return { success: false, error: celula.error };
    const cenA = await cenarioADaCelula(tdb, cen.competencia_id, cen.cargo);

    // Feedback enriquecido do check
    const feedbackParts = [cen.justificativa_check, cen.sugestao_check];
    // Ler alertas_check enriquecidos se disponíveis
    const { data: cenFull } = await sbRaw.from('banco_cenarios')
      .select('alertas_check').eq('id', cenarioId).maybeSingle();
    const alertas = typeof cenFull?.alertas_check === 'object' ? cenFull.alertas_check : {};
    if (alertas.problema_principal_vs_cenario_a) feedbackParts.push(`Problema vs A: ${alertas.problema_principal_vs_cenario_a}`);
    if (Array.isArray(alertas.riscos_de_triangulacao) && alertas.riscos_de_triangulacao.length) {
      feedbackParts.push(`Riscos de triangulação: ${alertas.riscos_de_triangulacao.join('; ')}`);
    }
    if (Array.isArray(alertas.perguntas_com_risco)) {
      alertas.perguntas_com_risco.forEach((p: any) => {
        feedbackParts.push(`P${p.numero}: ${p.problema}${p.correcao_recomendada ? ` → ${p.correcao_recomendada}` : ''}`);
      });
    }
    const feedbackExtra = feedbackParts.filter(Boolean).join('\n');
    const refCenA = cenA || { cargo: cen.cargo, titulo: cen.titulo, descricao: cen.descricao };

    const { system, user } = buildCenarioBPrompts(celula.ctx, refCenA, feedbackExtra);
    const resposta = await callAI(system, user, aiConfig, 32768, { temperature: TEMP, taskKey: 'cenarios_b', empresaId: cen.empresa_id });
    const cenarioData = await extractJSON(resposta);
    if (!cenarioData?.titulo) return { success: false, error: 'IA não retornou cenário válido' };

    const alternativasB = {
      p1: cenarioData.p1,
      p2: cenarioData.p2,
      p3: cenarioData.p3,
      p4: cenarioData.p4,
      faceta_avaliada: cenarioData.faceta_avaliada || null,
      facetas_secundarias: cenarioData.facetas_secundarias || [],
      diferenca_estrutural_vs_cenario_a: cenarioData.diferenca_estrutural_vs_cenario_a || null,
      por_que_essa_variacao_importa: cenarioData.por_que_essa_variacao_importa || null,
      tradeoff_testado: cenarioData.tradeoff_testado || null,
      armadilha_de_resposta_generica: cenarioData.armadilha_de_resposta_generica || null,
      objetivo_diagnostico: cenarioData.objetivo_diagnostico || null,
      referencia_avaliacao: cenarioData.referencia_avaliacao || null,
      dilema_etico: cenarioData.dilema_etico_embutido || null,
      confianca_cenario: typeof cenarioData.confianca_cenario === 'number' ? Math.max(0, Math.min(1, cenarioData.confianca_cenario)) : null,
      riscos_do_cenario: cenarioData.riscos_do_cenario || [],
    };

    // TRAVA champion/challenger (mesma do IA3, 23/07): audita a CANDIDATA em
    // memória e SÓ aplica se a nota não piorar — regenerar nunca destrói uma
    // versão melhor. Falha de auditoria = NADA muda.
    const candidato = {
      id: cen.id, empresa_id: cen.empresa_id, competencia_id: cen.competencia_id,
      cargo: cen.cargo, titulo: cenarioData.titulo, descricao: cenarioData.descricao,
      alternativas: alternativasB,
    };
    const modeloCheck = (aiConfig as any)?.checkModel || await getModelForTask(cen.empresa_id, 'cenarios_b_check');
    const av: any = await avaliarCenB(candidato, celula.ctx, modeloCheck, cenA, cen.empresa_id);
    if (!av.success) return { success: false, error: `Auditoria da candidata falhou (${av.error}). Nada foi alterado.` };

    // A nota atual só é comparável se veio desta versão do auditor. Nota de outra
    // versão (antes de 18/09/2026 o auditor não via o contexto do cargo) é refeita
    // agora, na régua nova, antes de a trava decidir.
    let notaAnterior: number | null = typeof (cen as any).nota_check === 'number' ? (cen as any).nota_check : null;
    if (notaAnterior != null && alertas.versao_auditor !== VERSAO_AUDITOR_B) {
      const atual: any = await avaliarCenB(cen, celula.ctx, modeloCheck, cenA, cen.empresa_id);
      if (!atual.success) return { success: false, error: `Recheck da versão atual falhou (${atual.error}). Nada foi alterado.` };
      notaAnterior = atual.resultado.nota;
    }
    if (!travaRegeneracao(notaAnterior, av.resultado.nota)) {
      return {
        success: true, aplicado: false, nota: av.resultado.nota, notaAnterior, status: av.statusCheck,
        message: `Regeneração DESCARTADA: candidata ${av.resultado.nota}pts < atual ${notaAnterior}pts — mantida a versão atual (trava: nunca piora).`,
      };
    }

    const { data: cenLinhaRg } = await sbRaw.from('banco_cenarios').select('empresa_id').eq('id', cenarioId).maybeSingle();
    const { error: updErr } = await escopoTenantDaLinha(
      sbRaw.from('banco_cenarios').update({
      titulo: cenarioData.titulo,
      descricao: cenarioData.descricao,
      p1: cenarioData.p1,
      p2: cenarioData.p2,
      p3: cenarioData.p3,
      p4: cenarioData.p4,
      alternativas: alternativasB,
    }).eq('id', cenarioId),
      cenLinhaRg,
    );
    if (updErr) return { success: false, error: `${updErr.message} — versão anterior preservada` };
    await persistirCheckCenB(sbRaw, cenarioId, av.resultado, av.statusCheck);

    return {
      success: true, aplicado: true, nota: av.resultado.nota, notaAnterior, status: av.statusCheck,
      message: `Cenário B regenerado: ${av.resultado.nota}pts (${av.statusCheck})${notaAnterior != null ? ` — antes ${notaAnterior}pts` : ''}.`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. CARREGAR CENÁRIOS B (para tela de visualização)
// ══════════════════════════════════════════════════════════════════════════════

export async function loadCenariosB(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);

  // Buscar cenários B
  const { data } = await tdb.from('banco_cenarios')
    .select('*')
    .eq('tipo_cenario', 'cenario_b')
    .order('cargo', { ascending: true });

  if (!data?.length) return [];

  // Buscar cenários A correspondentes para pegar o nome da competência via título
  // (workaround: a query de competencias falha no Vercel)
  const { data: cenariosA } = await tdb.from('banco_cenarios')
    .select('competencia_id, titulo')
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');

  // Tentar buscar competências (pode falhar no Vercel)
  const compIds = [...new Set(data.map((c: any) => c.competencia_id).filter(Boolean))] as string[];
  const compMap: Record<string, string> = {};
  for (const cid of compIds) {
    const { data: comp } = await tdb.from('competencias').select('nome').eq('id', cid).maybeSingle();
    if (comp) compMap[cid] = comp.nome;
  }

  // Fallback: extrair faceta_avaliada do alternativas
  return data.map(c => ({
    ...c,
    competencia_nome: compMap[c.competencia_id] || c.alternativas?.faceta_avaliada || '',
    alternativas: typeof c.alternativas === 'string' ? JSON.parse(c.alternativas) : (c.alternativas || {}),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. CHECK CENÁRIOS B EM LOTE (mesma lógica do check cenário A)
// ══════════════════════════════════════════════════════════════════════════════

export async function checkCenariosBLote(empresaId: string, aiConfig: Fase5Config = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: cenarios } = await tdb.from('banco_cenarios')
      .select('id, empresa_id, titulo, descricao, cargo, competencia_id, alternativas, nota_check')
      .eq('tipo_cenario', 'cenario_b');

    if (!cenarios?.length) return { success: false, error: 'Nenhum cenário B encontrado. Gere cenários B primeiro.' };

    const pendentes = cenarios.filter(c => c.nota_check == null);
    if (!pendentes.length) return { success: true, message: `Todos os ${cenarios.length} cenários B já foram checados` };

    const modelo = aiConfig?.checkModel || aiConfig?.model || await getModelForTask(empresaId, 'cenarios_b_check');

    // Contexto e A de referência por CÉLULA, uma vez cada, e checks IA em
    // PARALELO com limite 4 (check é idempotente e barato de repetir). Até
    // 18/09/2026 este caminho auditava sem Cenário A nenhum: as dimensões
    // "diferença vs A" e "complementaridade" eram julgadas às cegas.
    const porCelula = new Map<string, Promise<{ celula: any; cenA: any }>>();
    const daCelula = (cen: any) => {
      const chave = `${cen.competencia_id}::${cen.cargo}`;
      if (!porCelula.has(chave)) {
        porCelula.set(chave, (async () => ({
          celula: await contextoDaCelula(sbRaw, empresaId, cen.cargo, cen.competencia_id),
          cenA: await cenarioADaCelula(tdb, cen.competencia_id, cen.cargo),
        }))());
      }
      return porCelula.get(chave)!;
    };

    const resultados = await mapComLimite(pendentes as any[], 4, async (cen: any) => {
      try {
        const { celula, cenA } = await daCelula(cen);
        if ('error' in celula) return 'erro';
        const r = await runCheckOnCenB(sbRaw, cen, celula.ctx, modelo, cenA, empresaId);
        return r.success ? 'ok' : 'erro';
      } catch { return 'erro'; }
    });
    const ok = resultados.filter(r => r === 'ok').length;
    const erros = resultados.filter(r => r === 'erro').length;

    return { success: true, message: `Check cenários B: ${ok} checados${erros ? `, ${erros} erros` : ''} (${cenarios.length - pendentes.length} já checados antes)` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. REGENERAR + RECHECAR EM LOTE (todos os cenários B com nota < 90)
// ══════════════════════════════════════════════════════════════════════════════

export async function regenerarERecheckarCenariosBLote(empresaId: string, aiConfig: Fase5Config = {}) {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    let query = tdb.from('banco_cenarios')
      .select('id, nota_check, titulo, alternativas')
      .eq('tipo_cenario', 'cenario_b');
    if (!aiConfig?.incluirAprovados) query = query.lt('nota_check', 90);
    const { data: todos, error: listErr } = await query;
    if (listErr) return { success: false, error: `Falha ao listar os cenários B: ${listErr.message}` };

    // Integradores ficam fora: `regenerarCenarioB` os recusa (apagaria a integração).
    const integradores = (todos || []).filter((c: any) => ehIntegrador(c.alternativas)).length;
    const cenarios = (todos || []).filter((c: any) => !ehIntegrador(c.alternativas));

    if (!cenarios.length) {
      return { success: true, message: `Nenhum cenário B para regenerar${integradores ? ` (${integradores} integradores preservados)` : ''}` };
    }

    // null → checkCenarioBUm resolve pela task (cenarios_b_check, pinned).
    const checkModel = aiConfig?.checkModel || null;
    // Regenerar+recheck em paralelo (limite 3 — cada item já são 2 chamadas IA)
    const marcadoresRg = await mapComLimite(cenarios as any[], 3, async (c: any) => {
      try {
        // O regen já audita a candidata e aplica só se não piorar (trava).
        const r1: any = await regenerarCenarioB(c.id, { model: aiConfig?.model, checkModel } as any);
        if (!r1.success) { return 'erro'; }
        if (r1.aplicado === false) return 'regen_mantido';
        return r1.status === 'aprovado' ? 'regen_aprovado' : 'regen_revisar';
      } catch { return 'erro'; }
    });
    const regenerados = marcadoresRg.filter(m => m.startsWith('regen')).length;
    const aprovados = marcadoresRg.filter(m => m === 'regen_aprovado').length;
    const revisar = marcadoresRg.filter(m => m === 'regen_revisar').length;
    const mantidos = marcadoresRg.filter(m => m === 'regen_mantido').length;
    const erros = marcadoresRg.filter(m => m === 'erro').length;

    return { success: true, message: `${regenerados} regenerados | ${aprovados} aprovados, ${revisar} ainda para revisar${mantidos ? `, ${mantidos} mantidos (trava)` : ''}${erros ? `, ${erros} erros` : ''}${integradores ? `, ${integradores} integradores preservados` : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
