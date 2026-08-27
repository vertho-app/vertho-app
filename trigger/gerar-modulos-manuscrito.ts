import { task, wait } from '@trigger.dev/sdk';
import { criarPatchJob, registrarFalhaDaTentativa } from '@/lib/ia-jobs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { createClaudeBatch, pollClaudeBatch, fetchClaudeBatchResults, encerrarBatch, batchPendenteDoJob, type BatchReq } from '@/lib/ai-batch';
import { IA_BATCH } from '@/lib/status';
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
import { comContexto } from '@/lib/execucao-contexto';

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
 *
 * ── C3 (auditoria 22/08), passo final — `retry` concedido em 24/08 ─────────
 *
 * Declarado AQUI, na task, nunca por `retries.default` no `trigger.config.ts`
 * (o executor faz `this.task.retry ?? retriesConfig?.default`, então o default
 * alcançaria as tasks sem retry próprio (9 então, 4 hoje), render/HeyGen inclusive).
 *
 * ⚠️ Esta foi a task que exigiu mais que as outras para o retry ficar seguro,
 * porque a idempotência dela é por EXISTÊNCIA no banco e não por chave em
 * `params`: o que já existe é pulado, então uma segunda tentativa perdia de
 * vista os módulos da primeira — e com eles a auditoria Dual-IA e o `result_ids`.
 * Ver os dois blocos marcados 🔑 abaixo.
 */
const MAX_TENTATIVAS = 3;

export const gerarModulosManuscritoTask = task({
  id: 'gerar-modulos-manuscrito',
  maxDuration: 3600,
  // Backoff longo: a falha típica é FORNECEDOR (Anthropic/OpenAI/Supabase), não
  // corrida. Retentar em 1s (default do SDK) gastaria as 3 tentativas dentro da
  // mesma indisponibilidade.
  retry: { maxAttempts: MAX_TENTATIVAS, minTimeoutInMs: 30_000, maxTimeoutInMs: 300_000, factor: 4 },
  // Declara o orcamento de tempo para o ledger (mig 230): sem isto as chamadas
  // daqui entram como runtime 'desconhecido' e "perto do timeout?" fica sem
  // denominador.
  run: async (payload: { jobId: string }, { ctx }) =>
    comContexto({ runtime: 'trigger', orcamentoMs: 3600 * 1000, onde: 'gerar-modulos-manuscrito' }, async () => {
    const sb = createSupabaseAdmin();
    // `patch` = progresso (best-effort) · `patchCritico` = checkpoint (falha alto).
    // O `{ error }` do supabase-js NÃO lança — ver lib/ia-jobs.ts.
    const { patch, patchCritico } = criarPatchJob(sb, payload.jobId);

    const { data: job, error: errJob } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    // Falha de LEITURA não é "job não existe": com o retry ligado, tratar as
    // duas como a mesma coisa faria a task desistir de um job que está lá.
    if (errJob) throw new Error(`não foi possível ler o ia_job ${payload.jobId}: ${errJob.message}`);
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);

    // 🔴 C3 (pré-requisito da idempotência) — REENTRÂNCIA.
    //
    // Sem isto, uma nova execução de um job JÁ CONCLUÍDO re-parseia o DOCX,
    // reabre o progresso e — quando `substituirExistentes` está ligado —
    // REGERA tudo, pagando a IA de novo. `modulosExistentes` protege o caso
    // normal, mas é exatamente o modo `substituir` que o admin usa para
    // corrigir um lote ruim: o retry o transformaria em cobrança dupla.
    //
    // ⚠️ `done` é o único estado que encerra. `running` segue adiante de
    // propósito: é aí que mora a retomada pelo mesmo `batchId`, que é o que
    // torna o retry seguro em vez de caro.
    if (job.status === 'done') {
      console.warn(`[gerar-modulos-manuscrito] job ${payload.jobId} já está done — nada a fazer (reentrância evitada)`);
      return {
        ok: true, jobId: payload.jobId, reentrante: true,
        okCount: Array.isArray(job.result_ids) ? job.result_ids.length : 0,
        errCount: 0, pulados: 0,
      };
    }

    await patch({ status: 'running' });

    try {
      const pp: any = job.params || {};
      const empresaId: string | null = pp.empresaId ?? null;
      const locale: string = pp.locale || 'pt-BR';
      const termoCanonico: string | undefined = pp.termoCanonico || undefined;
      const substituir: boolean = !!pp.substituirExistentes;
      const createdBy: string = pp.createdBy || 'importar-manuscrito';

      if (!pp.docxBase64) throw new Error('params.docxBase64 ausente');

      // `pp` é o params LIDO e nunca muda; gravar `{ ...pp, algo }` a cada
      // checkpoint apaga o anterior (foi assim que o batchIdGen sumia no IA3).
      const paramsAcum: Record<string, any> = { ...pp };
      const salvarParams = (novos: Record<string, any>) => {
        Object.assign(paramsAcum, novos);
        return patchCritico({ params: { ...paramsAcum } });
      };

      // 1) Re-parse determinístico (custo zero, sem IA).
      const parse = await parsearManuscrito(Buffer.from(pp.docxBase64, 'base64'));
      const { resolvidos, error: errResolve } = await resolverDescritores(sb, parse, empresaId, {
        codCompAlvo: pp.codCompAlvo || null,
      });
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
        await patchCritico({
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
      const MAX_TOKENS = 64000; // 26/08: unificado com o default de chamarIAComRetry. Teto não é gasto — paga-se o que sai — e as outras 2 chamadas da task já rodavam em 64k. Manter 32k aqui deixava a MESMA taskKey com dois tetos, e era o menor que o auditor reportava.
      let respostas = new Map<string, string>();

      if (pp.pularBatch === true) {
        await pushProgress(`síncrono (batch pulado) — ${total} módulo(s)…`);
      } else {
        // 🔴 Declarado FORA do try de propósito. Na versão anterior o id vivia
        // dentro do bloco e o `catch` tentava fechar `pp.batchId` — que é o
        // params ANTIGO, ainda vazio na primeira execução, porque `patch()`
        // grava no banco mas não reatribui a variável local. Resultado: o
        // rastro do batch recém-criado NUNCA era fechado justamente no caminho
        // de falha, que é onde ele mais importa. É a mesma classe do C2, criada
        // ao corrigir o C2.
        // 🔑 A janela (criar o lote → gravar o id) deixou de custar um lote: se
        // `params.batchId` está vazio, o rastro em `ia_batches` responde por
        // `job_id` (mig 225). Só depois de as DUAS fontes falharem é que se cria
        // um lote novo.
        let batchIdAtivo: string | null = pp.batchId ?? (await batchPendenteDoJob(payload.jobId, 'modulo_base_autor'));
        try {
          let batchId: string = batchIdAtivo || '';
          if (!batchId) {
            const batch: BatchReq[] = pendentes.map((r) => ({
              customId: r.customId, system: r.system, user: r.user, model, maxTokens: MAX_TOKENS,
            }));
            batchId = await createClaudeBatch(batch, { ledger: { feature: 'modulo_base_autor', empresaId, jobId: payload.jobId } });
            batchIdAtivo = batchId;
            /**
             * 🔑 Erro de PERSISTÊNCIA não é erro de FORNECEDOR.
             *
             * Medido ao escrever o teste da janela (C3, 24/08): falhar aqui caía
             * no `catch` de baixo, que trata tudo como "batch indisponível" e
             * desvia para o síncrono. O lote JÁ ESTÁ PAGO e vai entregar —
             * pagar o caminho caro por cima dele é cobrar duas vezes pela mesma
             * coisa, numa única execução. Agora a falha é gritada e a run segue
             * com o id em memória; `ia_batches` mantém o lote rastreável.
             */
            try {
              await salvarParams({ batchId });
              await patch({ progress: { done: 0, total, current: `batch criado (${total}) — aguardando…`, resultados: [], pulados } });
            } catch (ePersist: any) {
              console.error(
                `[gerar-modulos-manuscrito] batchId ${batchId} NÃO persistido (${ePersist?.message}) — ` +
                'seguindo com ele em memória; se a run morrer, o lote fica órfão RASTREÁVEL em ia_batches',
              );
            }
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
          respostas = await fetchClaudeBatchResults(batchId, { feature: 'modulo_base_autor', empresaId });
          // C2 (auditoria 22/08): fecha o rastro. Esta task usa o padrão
          // DESTACADO — submete, espera em `wait.for` checkpointado, colhe
          // depois — e `encerrarBatch` era privada, chamada só por
          // `submitClaudeBatch`. Resultado: o batch terminava, os resultados
          // eram colhidos, e a linha ficava em 'submetido' para sempre. Foi
          // assim que 6 das 8 linhas de `ia_batches` viraram falso positivo do
          // `_batches-orfaos.mjs` — todas concluídas, nenhuma órfã.
          await encerrarBatch(batchId, IA_BATCH.CONCLUIDO);
        } catch (e: any) {
          console.warn(`[gerar-modulos-manuscrito] batch falhou (${e?.message}) — fallback síncrono por módulo`);
          // O rastro também fecha no caminho RUIM: sem isto, falhar aqui é
          // indistinguível de batch ainda em voo.
          try {
            if (batchIdAtivo) await encerrarBatch(batchIdAtivo, IA_BATCH.ERRO, e?.message);
          } catch { /* observabilidade nunca bloqueia o fallback */ }
        }
      }

      // 4) Um módulo por vez: resposta do batch OU síncrono; valida; persiste.
      const { callAI } = await import('@/actions/ai-client');
      /**
       * 🔑 C3 (24/08) — os ids ATRAVESSAM a retomada, e não é detalhe de tela.
       *
       * A idempotência desta task é por EXISTÊNCIA no banco (`modulosExistentes`
       * lá em cima), então numa segunda tentativa o módulo já criado é PULADO e
       * nunca entraria nesta lista. Duas consequências caras, as duas silenciosas:
       *
       *  · a **auditoria Dual-IA** do passo 5 roda sobre esta lista — o gate que
       *    de fato reprova simplesmente não passaria nos módulos da tentativa
       *    anterior, e eles ficariam publicáveis sem nota;
       *  · `result_ids` REGRIDE: a tela mostraria menos módulos do que o job criou.
       *
       * Por isso a lista vive em `params`, não na run.
       */
      const idsCriados: string[] = Array.isArray(pp.modulosCriados) ? [...pp.modulosCriados] : [];

      for (const r of pendentes) {
        const rotulo = `${r.descritor} ${r.nivel_entrada}→${r.nivel_destino}`;
        let texto = respostas.get(r.customId);
        if (!texto || !texto.trim()) {
          try {
            texto = await callAI(r.system, r.user, { model }, MAX_TOKENS, {
              taskKey: 'modulo_base_autor', source: 'batch-sync',
            });
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
          await salvarParams({ modulosCriados: [...idsCriados] }); // checkpoint incremental
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
          /**
           * Chave por item da AUDITORIA — e ela vem do BANCO, não de `params`.
           * `auditoria_ia` preenchida é a prova de que o módulo já foi auditado;
           * um checkpoint em `params` diria a mesma coisa e ainda poderia estar
           * defasado. Sem este filtro, uma retomada repagaria ~US$0,10 por
           * módulo já auditado.
           *
           * ⚠️ Se a LEITURA falhar, audita todos: o gate Dual-IA vale mais que
           * os centavos, e módulo publicável sem veredito é o estrago maior.
           */
          const { data: pendAud, error: errAud } = await sb
            .from('modulos_base_conteudo')
            .select('id').in('id', idsCriados).is('auditoria_ia', null);
          if (errAud) {
            console.warn(`[gerar-modulos-manuscrito] não deu para saber quem já foi auditado (${errAud.message}) — auditando os ${idsCriados.length}`);
          }
          const aAuditar = errAud ? idsCriados : (pendAud || []).map((m: any) => m.id);
          if (aAuditar.length) {
            await pushProgress(`auditando ${aAuditar.length} módulo(s)…`);
            const r = await auditarModulosCore(sb, aAuditar, {
              promoverParaRevisao: true,
              onItem: async (_id, bom) => {
                if (bom) auditados++;
                await pushProgress(`auditando ${auditados}/${aAuditar.length}…`);
              },
            });
            if (r.falhas.length) console.warn('[gerar-modulos-manuscrito] auditoria:', r.falhas.join(' · '));
          } else {
            console.warn(`[gerar-modulos-manuscrito] os ${idsCriados.length} módulos já tinham veredito — auditoria pulada (retomada)`);
          }
        } catch (e: any) {
          console.warn('[gerar-modulos-manuscrito] auditoria falhou inteira:', e?.message);
        }
      }

      // 6) Descarta o DOCX do job — 360KB de base64 não precisam viver pra sempre.
      // Sai do ACUMULADO, não de `pp`: senão o `modulosCriados`/`batchId` gravados
      // ao longo da run voltariam ao valor que tinham quando a run começou.
      const { docxBase64: _descartado, ...paramsSemDocx } = paramsAcum;

      // `patchCritico`: era `patch` (best-effort), e um `done` que não grava em
      // silêncio deixa o job `running` PARA SEMPRE — a tela faz polling eterno e
      // o guard anti-duplicata nunca libera a fase. Falhando alto, o retry pega.
      await patchCritico({
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
      // `error` só na ÚLTIMA tentativa: antes disso o job segue `running`, senão
      // o guard anti-duplicata solta e a tela anuncia falha de um lote que ainda
      // vai retentar.
      await registrarFalhaDaTentativa(patch, e, ctx, MAX_TENTATIVAS);
      throw e;
    }
  }),
});
