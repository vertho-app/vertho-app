import { task, wait } from '@trigger.dev/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';
import { createClaudeBatch, pollClaudeBatch, fetchClaudeBatchResults, type BatchReq } from '@/lib/ai-batch';
import { parsearManuscrito } from '@/lib/manuscrito-parser';
import {
  resolverDescritores,
  montarReqsManuscrito,
  persistirModuloDeManuscrito,
  modulosExistentes,
  chaveModulo,
} from '@/lib/manuscrito-modulos';
import { extractCorpo, validarCorpo } from '@/lib/modulo-base-autor';
import { auditarModulosCore } from '@/lib/modulo-base-auditor';

/**
 * Manuscrito autoral (DOCX) → N Módulos-Base, em BACKGROUND.
 *
 * A tela enfileira (`actions/manuscrito-batch::enqueueManuscritoBatch` cria o
 * `ia_jobs` com fase='manuscrito' e dispara esta task) e faz polling de
 * `ia_jobs.progress`. Roda service-role, SEM gate de request — o tenant já foi
 * validado no enqueue.
 *
 * Por que task e não server action: medido, **220s por chamada**. Um manuscrito de
 * 6 descritores rende 18 módulos = ~66 minutos. Não cabe no teto da Vercel.
 *
 * Resiliência (espelha `gerar-ia2-batch`):
 *  - Falha POR-ITEM → registra em progress.resultados[] e SEGUE.
 *  - Falha do BATCH inteiro → FALLBACK SÍNCRONO por módulo. Nunca perde conteúdo.
 *  - Persiste À MEDIDA que cada módulo fica pronto: um timeout perde só o resto.
 *  - Auditoria Dual-IA no fim (GPT-5.4, fora do batch — batch só aceita Claude).
 *    Falhar ali não invalida o conteúdo; o módulo só fica sem nota.
 *
 * O DOCX viaja em `params.docxBase64` (~360KB) e é RE-PARSEADO aqui. O parser é
 * determinístico, então re-parsear é mais barato e mais seguro que serializar as
 * 18 fatias de 65k chars no jsonb.
 */
export const gerarModulosManuscritoTask = task({
  id: 'gerar-modulos-manuscrito',
  maxDuration: 3600,
  run: async (payload: { jobId: string }) => {
    const sb = createSupabaseAdmin();
    const patch = (f: Record<string, unknown>) =>
      sb.from('ia_jobs').update({ ...f, updated_at: new Date().toISOString() }).eq('id', payload.jobId);

    const { data: job } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);
    await patch({ status: 'running' });

    try {
      const pp: any = job.params || {};
      const empresaId: string | null = pp.empresaId ?? null;
      const locale: string = pp.locale || 'pt-BR';
      const termoCanonico: string | undefined = pp.termoCanonico || undefined;
      const substituir: boolean = !!pp.substituirExistentes;
      const createdBy: string = pp.createdBy || 'importar-manuscrito';

      if (!pp.docxBase64) throw new Error('params.docxBase64 ausente');

      // 1) Re-parse determinístico (custo zero, sem IA).
      const parse = await parsearManuscrito(Buffer.from(pp.docxBase64, 'base64'));
      const { resolvidos, error: errResolve } = await resolverDescritores(sb, parse, empresaId);
      if (errResolve || !resolvidos) throw new Error(errResolve || 'falha ao resolver descritores');

      const reqs = montarReqsManuscrito({
        parse,
        resolvidos,
        termoCanonico,
        apenasDescritores: Array.isArray(pp.apenasDescritores) ? pp.apenasDescritores : undefined,
      });

      // 2) Idempotência: pula o que já existe, salvo se o admin pediu substituir.
      const jaExistem = substituir
        ? new Set<string>()
        : await modulosExistentes(sb, { compIds: resolvidos.map((r) => r.comp.id), empresaId, locale });
      const pendentes = reqs.filter((r) => !jaExistem.has(chaveModulo(r.comp.id, r.nivel_entrada, r.nivel_destino)));
      const pulados = reqs.length - pendentes.length;

      const total = pendentes.length;
      const resultados: Array<{ modulo: string; ok: boolean; id?: string; error?: string; avisos?: string[] }> = [];
      let done = 0;
      const pushProgress = (current: string) => patch({ progress: { done, total, current, resultados, pulados } });

      if (!total) {
        await patch({
          status: 'done',
          progress: { done: 0, total: 0, current: `nada a gerar (${pulados} módulo(s) já existem)`, resultados: [], pulados },
          result_ids: [],
        });
        return { ok: true, jobId: payload.jobId, okCount: 0, errCount: 0, pulados };
      }

      await patch({ progress: { done: 0, total, current: `lote (batch) — ${total} módulo(s)…`, resultados: [], pulados } });

      // 3) Batch DESTACADO (−50%, mantido SEMPRE — não há penalidade de custo por
      //    congestão). O padrão antigo segurava a run aberta fazendo polling, o que
      //    consumia o maxDuration: um batch >50 min matava a task e empurrava tudo
      //    pro síncrono (2× o custo). Agora: cria o batch, guarda o id, e faz
      //    `wait.for` entre as consultas — a espera é CHECKPOINTADA (não consome
      //    compute nem maxDuration), então um batch lento só termina mais tarde.
      //    Resumível: se a run reiniciar, retoma o batchId já criado (não recria).
      //    `pularBatch` = botão de emergência manual (vai direto ao síncrono).
      const model = String(pp.model || 'claude-sonnet-4-6');
      const MAX_TOKENS = 32000; // saída medida ~9,1k tokens; 32k dá folga sem desperdício
      let respostas = new Map<string, string>();

      if (pp.pularBatch === true) {
        await pushProgress(`síncrono (batch pulado) — ${total} módulo(s)…`);
      } else {
        try {
          let batchId: string = pp.batchId;
          if (!batchId) {
            const batch: BatchReq[] = pendentes.map((r) => ({
              customId: r.customId, system: r.system, user: r.user, model, maxTokens: MAX_TOKENS,
            }));
            batchId = await createClaudeBatch(batch);
            await patch({ params: { ...pp, batchId }, progress: { done: 0, total, current: `batch criado (${total}) — aguardando…`, resultados: [], pulados } });
          }
          // Espera destacada. Cada wait.for é checkpointado; horas de fila não
          // consomem maxDuration. Teto generoso de 24h (limite do próprio batch).
          const MAX_ESPERAS = 24 * 60; // 24h em passos de 60s
          for (let i = 0; i < MAX_ESPERAS; i++) {
            const st = await pollClaudeBatch(batchId);
            if (st.ended) break;
            await pushProgress(`batch: ${st.counts.succeeded}/${total} prontos, ${st.counts.processing} na fila…`);
            await wait.for({ seconds: 60 });
          }
          respostas = await fetchClaudeBatchResults(batchId);
        } catch (e: any) {
          console.warn(`[gerar-modulos-manuscrito] batch falhou (${e?.message}) — fallback síncrono por módulo`);
        }
      }

      // 4) Um módulo por vez: resposta do batch OU síncrono; valida; persiste.
      const { callAI } = await import('@/actions/ai-client');
      const idsCriados: string[] = [];

      for (const r of pendentes) {
        const rotulo = `${r.descritor} ${r.nivel_entrada}→${r.nivel_destino}`;
        let texto = respostas.get(r.customId);
        if (!texto || !texto.trim()) {
          try {
            texto = await callAI(r.system, r.user, { model }, MAX_TOKENS);
          } catch (e: any) {
            resultados.push({ modulo: rotulo, ok: false, error: 'IA falhou: ' + (e?.message || e) });
            done++; await pushProgress(`${rotulo}: erro de IA`);
            continue;
          }
        }

        const corpo = extractCorpo(texto);
        if (!corpo) {
          resultados.push({ modulo: rotulo, ok: false, error: 'JSON inválido' });
          done++; await pushProgress(`${rotulo}: JSON inválido`);
          continue;
        }

        const avisos = validarCorpo(corpo);
        const ins = await persistirModuloDeManuscrito(sb, {
          comp: r.comp,
          empresaId,
          nivel_entrada: r.nivel_entrada,
          nivel_destino: r.nivel_destino,
          locale,
          descritor: r.descritor,
          corpo,
          codManuscrito: parse.cod_comp,
          microblocos: r.microblocos,
          createdBy,
        });
        if (ins.error) {
          resultados.push({ modulo: rotulo, ok: false, error: ins.error });
        } else {
          idsCriados.push(ins.id!);
          resultados.push({ modulo: rotulo, ok: true, id: ins.id, avisos });
        }
        done++;
        await pushProgress(`${rotulo}: ${ins.error ? 'erro' : 'ok'}`);
      }

      const okCount = resultados.filter((r) => r.ok).length;
      const errCount = resultados.length - okCount;

      // 5) Auditoria Dual-IA (GPT-5.4) sobre TODOS os módulos recém-criados. Fica
      // FORA do batch de propósito: o batch da Anthropic só aceita Claude, e a
      // auditora é cross-provider por design. ~US$0,10/módulo — barato para um
      // gate que de fato reprova (o veredito é derivado em código dos problemas).
      // Best-effort: falhar aqui não invalida o conteúdo, o módulo só fica sem nota.
      let auditados = 0;
      if (idsCriados.length && pp.auditar !== false) {
        try {
          await pushProgress(`auditando ${idsCriados.length} módulo(s)…`);
          const r = await auditarModulosCore(sb, idsCriados, {
            promoverParaRevisao: true,
            onItem: async (_id, bom) => {
              if (bom) auditados++;
              await pushProgress(`auditando ${auditados}/${idsCriados.length}…`);
            },
          });
          if (r.falhas.length) console.warn('[gerar-modulos-manuscrito] auditoria:', r.falhas.join(' · '));
        } catch (e: any) {
          console.warn('[gerar-modulos-manuscrito] auditoria falhou inteira:', e?.message);
        }
      }

      // 6) Descarta o DOCX do job — 360KB de base64 não precisam viver pra sempre.
      const { docxBase64: _descartado, ...paramsSemDocx } = pp;

      await patch({
        status: 'done',
        error: null,
        params: paramsSemDocx,
        result_ids: idsCriados,
        progress: {
          done: total, total, pulados, resultados, auditados,
          current: `concluído: ${okCount} ok, ${errCount} erro(s)${pulados ? `, ${pulados} pulado(s)` : ''}`
            + (auditados ? ` · ${auditados}/${idsCriados.length} auditado(s)` : ''),
        },
      });
      return { ok: true, jobId: payload.jobId, okCount, errCount, pulados, auditados };
    } catch (e: any) {
      await patch({ status: 'error', error: String(e?.message || e).slice(0, 500) });
      throw e;
    }
  },
});
