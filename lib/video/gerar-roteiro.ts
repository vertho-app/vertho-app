/**
 * Gera o ROTEIRO ESTRUTURADO de um vídeo a partir de um Módulo-Base (5 cenas do
 * spike). Usa o prompt puro de `roteiro-prompt.ts` + a IA do app (callAI no
 * síncrono, `lib/ai-batch` no lote).
 *
 * ⚠️ Este arquivo JÁ MONTOU request cru para `/v1/messages/batches` e isso custou
 * 5 dias de pipeline parado (05→10/08/2026, 0 vídeos gerados). O corpo levava
 * `thinking:{type:'enabled',budget_tokens}`, formato REMOVIDO na geração 5 do
 * Claude — e `conteudo_video` virou `claude-opus-5` em 05/08. O wrapper aprendeu
 * o formato novo (`adaptive`) em 08/08, mas o fix não alcançava quem montava
 * request à mão. Por isso o lote agora passa por `submitClaudeBatch`: SDK oficial,
 * sem parâmetro de raciocínio no corpo, e o custo cai no ledger.
 * Guarda: `tests/unit/integrations/ia-request-cru-guard.test.ts`.
 */
import { callAI } from '@/actions/ai-client';
import { submitClaudeBatch } from '@/lib/ai-batch';
import { getModelForTask } from '@/lib/ai-tasks';
import { buildRoteiroPrompt, parseRoteiro, normalizarRoteiro, type ModuloParaRoteiro, type VideoRoteiro } from '@/lib/video/roteiro-prompt';

export type { RoteiroScene, VideoRoteiro, ModuloParaRoteiro } from '@/lib/video/roteiro-prompt';

const BATCH_POLL_MS = Number(process.env.VIDEO_ROTEIRO_BATCH_POLL_MS) || 15_000;
const BATCH_MAX_POLLS = Number(process.env.VIDEO_ROTEIRO_BATCH_MAX_POLLS) || 120;
const BATCH_CUSTOM_ID = 'roteiro-video';
// O JSON do roteiro fica em ~8k. A folga em cima existe porque na geração 5 o
// raciocínio é LIGADO POR PADRÃO e divide `max_tokens` com o texto — dimensionar
// justo trunca o roteiro no meio. Não pedimos `thinking` no corpo (ver topo).
const ROTEIRO_MAX_TOKENS = 16_000;

export async function gerarRoteiroDeModulo(m: ModuloParaRoteiro, opts: { forceSync?: boolean } = {}): Promise<{ roteiro?: VideoRoteiro; error?: string }> {
  const { system, user } = buildRoteiroPrompt(m);
  const model = await getModelForTask(null as any, 'conteudo_video').catch(() => 'claude-sonnet-4-6');
  let roteiro: VideoRoteiro | null = null;

  // forceSync (Kit): pula o batch (lento, ~minutos) e gera na hora — o kit já é
  // um job em background e não pode esperar 30 min de polling do batch por DISC.
  if (model.startsWith('claude') && process.env.VIDEO_ROTEIRO_MODE !== 'sync' && !opts.forceSync) {
    try {
      const resultados = await submitClaudeBatch(
        [{ customId: BATCH_CUSTOM_ID, system, user, model, maxTokens: ROTEIRO_MAX_TOKENS }],
        {
          pollMs: BATCH_POLL_MS,
          budgetMs: BATCH_POLL_MS * BATCH_MAX_POLLS,
          ledger: { feature: 'conteudo_video' },
        },
      );
      // `fetchClaudeBatchResults` só devolve os itens `succeeded` — item que deu
      // 400 (contrato do modelo!) some do Map em silêncio. Distinguir "não veio
      // resultado" de "veio e não parseou" é o que faltava em 05-10/08: a mensagem
      // genérica não dizia que o problema era a CHAMADA, e ninguém foi olhar.
      const bruto = resultados.get(BATCH_CUSTOM_ID);
      if (!bruto) {
        return {
          error: 'A Batch API não devolveu resultado para o roteiro (item errored/expired). '
            + `Conferir o contrato do modelo "${model}" (task conteudo_video em lib/ai-tasks.ts) — `
            + 'parâmetro removido entre gerações devolve 400 e o item some do lote.',
        };
      }
      roteiro = parseRoteiro(bruto);
    } catch (e) {
      return { error: String((e as any)?.message || e) };
    }
    if (!roteiro) return { error: 'A IA não retornou um roteiro válido.' };
    return { roteiro: normalizarRoteiro(roteiro) };
  }

  for (let tentativa = 1; tentativa <= 2 && !roteiro; tentativa++) {
    const raw = await callAI(system, user, { model }, 8000).catch(() => '');
    roteiro = parseRoteiro(raw);
  }
  if (!roteiro) return { error: 'A IA não retornou um roteiro válido.' };
  return { roteiro: normalizarRoteiro(roteiro) };
}
