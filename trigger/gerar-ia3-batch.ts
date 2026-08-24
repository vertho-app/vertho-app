import { task } from '@trigger.dev/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  montarContextoIA3, buildIA3SystemPrompt, buildIA3UserPrompt,
  validarRespostaIA3, montarAlternativasIA3, persistirCenarioIA3,
  montarCheckIA3Prompt, normalizarResultadoCheckIA3, persistirCheckIA3,
  gerarCenarioIA3Core, checkCenarioIA3Core,
} from '@/lib/ia3-cenarios';
import { submitClaudeBatch, submitOpenAIBatch, type BatchReq } from '@/lib/ai-batch';

/**
 * IA3 (cenários A + check dual) em LOTE, em BACKGROUND — molde do gerar-ia2-batch.
 * A tela enfileira (enqueueIA3Batch cria ia_jobs + dispara esta task) e faz
 * polling de ia_jobs.progress. Roda service-role; isolamento por tenantDb nos
 * blocos do núcleo (lib/ia3-cenarios).
 *
 * Duas ondas de batch:
 *   1. GERAÇÃO (Claude, −50%): 1 request por item da fila → valida → persiste.
 *      Item com validação com erros → retry SÍNCRONO (mesma mecânica do core).
 *   2. CHECK (OpenAI −50% p/ gpt-*; Claude −50% p/ claude-*; senão síncrono):
 *      1 request por cenário persistido → nota/status derivados EM CÓDIGO.
 *
 * Resiliência (mesmo contrato do IA2): falha POR-ITEM registra e segue; falha
 * do BATCH inteiro cai no fallback síncrono por item (nunca perde conteúdo).
 */
export const gerarIA3BatchTask = task({
  id: 'gerar-ia3-batch',
  maxDuration: 3600,
  run: async (payload: { jobId: string }) => {
    const sb = createSupabaseAdmin();
    const patch = (f: Record<string, unknown>) =>
      sb.from('ia_jobs').update({ ...f, updated_at: new Date().toISOString() }).eq('id', payload.jobId);

    const { data: job } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);
    await patch({ status: 'running' });

    try {
      const empresaId: string = job.empresa_id;
      const pp: any = job.params || {};
      const aiConfig = pp.aiConfig || {};
      const items: Array<{ cargo: string; competencia_id: string; ppp_escola_id: string | null; nome: string }> =
        Array.isArray(pp.items) ? pp.items : [];
      const genModel = String(aiConfig?.model || 'claude-sonnet-4-6');
      const checkModel: string | null = aiConfig?.checkModel || null;

      // total = geração + (check, se houver) — a barra reflete as duas ondas.
      const total = items.length * (checkModel ? 2 : 1);
      const resultados: Array<{ cargo: string; ok: boolean; error?: string; message?: string }> = [];
      let done = 0;
      const pushProgress = (current: string) => patch({ progress: { done, total, current, resultados } });
      await patch({ progress: { done: 0, total, current: `lote (batch) — ${items.length} cenário(s)…`, resultados: [] } });

      // ── Onda 1: GERAÇÃO ────────────────────────────────────────────────
      // Monta contexto+prompts por item (guardados p/ o retry síncrono).
      const preparados: Array<{ customId: string; item: (typeof items)[number]; ctx: any; system: string; user: string } | { customId: string; item: (typeof items)[number]; erro: string }> = [];
      for (const [i, item] of items.entries()) {
        const customId = `i${i}`;
        const mc = await montarContextoIA3(sb, empresaId, item.cargo, item.competencia_id, item.ppp_escola_id ?? null);
        if (!('ctx' in mc)) { preparados.push({ customId, item, erro: mc.error }); continue; }
        const system = buildIA3SystemPrompt();
        const user = buildIA3UserPrompt(mc.ctx.empresa, item.cargo, mc.ctx.cargoDetalhe, mc.ctx.comp, mc.ctx.descritores, mc.ctx.valores, mc.ctx.contextoPPP, mc.ctx.gabCIS);
        preparados.push({ customId, item, ctx: mc.ctx, system, user });
      }

      let respostasGen = new Map<string, string>();
      const batcaveis = preparados.filter((p): p is Extract<typeof preparados[number], { ctx: any }> => 'ctx' in p);
      if (batcaveis.length && genModel.startsWith('claude')) {
        try {
          const reqs: BatchReq[] = batcaveis.map((p) => ({ customId: p.customId, system: p.system, user: p.user, model: genModel, maxTokens: 6144 }));
          respostasGen = await submitClaudeBatch(reqs, { budgetMs: 35 * 60_000, ledger: { feature: 'ia3_cenarios', empresaId } });
        } catch (e: any) {
          console.warn(`[gerar-ia3-batch] batch geração falhou (${e?.message}) — fallback síncrono por item`);
        }
      }

      const { extractJSON } = await import('@/actions/utils');
      const { callAI } = await import('@/actions/ai-client');
      const gerados: Array<{ item: (typeof items)[number]; cenarioId: string | null }> = [];

      for (const p of preparados) {
        if (!('ctx' in p)) {
          resultados.push({ cargo: `${p.item.nome} (${p.item.cargo})`, ok: false, error: p.erro });
          done++; await pushProgress(`${p.item.nome}: contexto indisponível`);
          continue;
        }
        const rotulo = `${p.item.nome} (${p.item.cargo})`;
        let cenarioId: string | null = null;
        const texto = respostasGen.get(p.customId);
        if (texto && texto.trim()) {
          // Resposta do batch: valida; erros críticos → retry SÍNCRONO (core).
          const resultado = await extractJSON(texto);
          const norm = resultado ? validarRespostaIA3(resultado, p.ctx.descritores.length) : null;
          if (norm && norm.errors.length === 0) {
            const alternativas = montarAlternativasIA3(resultado, norm.cen, norm.perguntas);
            const persist = await persistirCenarioIA3(p.ctx.tdb, {
              compId: p.ctx.comp.id, cargoNome: p.item.cargo, pppEscolaId: p.item.ppp_escola_id ?? null,
              titulo: norm.cen.titulo || norm.titulo, contexto: norm.cen.contexto || norm.contexto, alternativas,
            });
            if ('cenarioId' in persist) {
              cenarioId = persist.cenarioId;
              resultados.push({ cargo: rotulo, ok: true, message: 'cenário gerado (batch)' });
            } else {
              resultados.push({ cargo: rotulo, ok: false, error: persist.error });
            }
          } else {
            // Batch respondeu mas inválido/incompleto → core síncrono (com retry).
            const r = await gerarCenarioIA3Core(sb, { empresaId, cargoNome: p.item.cargo, competenciaId: p.item.competencia_id, pppEscolaId: p.item.ppp_escola_id ?? null, aiConfig });
            cenarioId = r.cenarioId ?? null;
            resultados.push({ cargo: rotulo, ok: !!r.success, error: r.error, message: r.success ? 'cenário gerado (retry síncrono)' : undefined });
          }
        } else {
          // Sem resposta no batch (falha total, modelo não-Claude, request perdido).
          const r = await gerarCenarioIA3Core(sb, { empresaId, cargoNome: p.item.cargo, competenciaId: p.item.competencia_id, pppEscolaId: p.item.ppp_escola_id ?? null, aiConfig });
          cenarioId = r.cenarioId ?? null;
          resultados.push({ cargo: rotulo, ok: !!r.success, error: r.error, message: r.success ? 'cenário gerado (síncrono)' : undefined });
        }
        if (cenarioId) gerados.push({ item: p.item, cenarioId });
        done++; await pushProgress(`gerado ${rotulo}`);
      }

      // ── Onda 2: CHECK dual ─────────────────────────────────────────────
      if (checkModel && gerados.length) {
        // Busca as rows recém-persistidas e monta os prompts do check.
        const checks: Array<{ customId: string; cen: any; rotulo: string; system: string; user: string }> = [];
        for (const [i, g] of gerados.entries()) {
          const { data: cen } = await sb.from('banco_cenarios').select('*').eq('id', g.cenarioId).maybeSingle();
          if (!cen) continue;
          const { system, user } = await montarCheckIA3Prompt(sb, cen);
          checks.push({ customId: `k${i}`, cen, rotulo: `${g.item.nome} (${g.item.cargo})`, system, user });
        }

        let respostasChk = new Map<string, string>();
        try {
          const reqs: BatchReq[] = checks.map((c) => ({ customId: c.customId, system: c.system, user: c.user, model: checkModel, maxTokens: 4096 }));
          if (checkModel.startsWith('gpt')) {
            respostasChk = await submitOpenAIBatch(reqs, { budgetMs: 20 * 60_000, ledger: { feature: 'ia3_check', empresaId } });
          } else if (checkModel.startsWith('claude')) {
            respostasChk = await submitClaudeBatch(reqs, { budgetMs: 20 * 60_000, ledger: { feature: 'ia3_check', empresaId } });
          }
          // Outros provedores (gemini/kimi): sem Batch API aqui → mapa vazio = síncrono.
        } catch (e: any) {
          console.warn(`[gerar-ia3-batch] batch check falhou (${e?.message}) — fallback síncrono por item`);
        }

        for (const c of checks) {
          const texto = respostasChk.get(c.customId);
          if (texto && texto.trim()) {
            const resultado = await extractJSON(texto);
            const normed = normalizarResultadoCheckIA3(resultado);
            if (normed) {
              const persist = await persistirCheckIA3(sb, c.cen, normed.resultado, normed.statusCheck);
              if ('error' in persist) resultados.push({ cargo: c.rotulo, ok: false, error: `check: ${persist.error}` });
              else resultados.push({ cargo: c.rotulo, ok: true, message: `check ${normed.resultado.nota}pts (${normed.statusCheck})` });
            } else {
              const r = await checkCenarioIA3Core(sb, { cenarioId: c.cen.id, modelo: checkModel });
              resultados.push({ cargo: c.rotulo, ok: !!r.success, error: r.error, message: r.success ? `check ${r.nota}pts (síncrono)` : undefined });
            }
          } else {
            const r = await checkCenarioIA3Core(sb, { cenarioId: c.cen.id, modelo: checkModel });
            resultados.push({ cargo: c.rotulo, ok: !!r.success, error: r.error, message: r.success ? `check ${r.nota}pts (síncrono)` : undefined });
          }
          done++; await pushProgress(`check ${c.rotulo}`);
        }
        // Itens sem cenário persistido não têm check — completa a contagem.
        done += (items.length - gerados.length);
      }

      const okCount = resultados.filter((r) => r.ok).length;
      const errCount = resultados.length - okCount;
      await patch({
        status: 'done',
        error: null,
        result_ids: gerados.map((g) => g.cenarioId).filter(Boolean),
        progress: { done: total, total, current: `concluído: ${okCount} ok, ${errCount} erro(s)`, resultados },
      });
      return { ok: true, jobId: payload.jobId, okCount, errCount };
    } catch (e: any) {
      await patch({ status: 'error', error: String(e?.message || e).slice(0, 500) });
      throw e;
    }
  },
});
