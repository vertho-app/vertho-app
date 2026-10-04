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
import { submitClaudeBatch, type AIRun } from '@/lib/ai-batch';
import { getModelForTask } from '@/lib/ai-tasks';
import { resolveAppLocale } from '@/lib/i18n';
import { buildRoteiroPrompt, parseRoteiro, normalizarRoteiro, type ModuloParaRoteiro, type VideoRoteiro } from '@/lib/video/roteiro-prompt';

export type { RoteiroScene, VideoRoteiro, ModuloParaRoteiro } from '@/lib/video/roteiro-prompt';

const BATCH_POLL_MS = Number(process.env.VIDEO_ROTEIRO_BATCH_POLL_MS) || 15_000;
const BATCH_MAX_POLLS = Number(process.env.VIDEO_ROTEIRO_BATCH_MAX_POLLS) || 120;
const BATCH_CUSTOM_ID = 'roteiro-video';
// O JSON do roteiro fica em ~8k. A folga em cima existe porque na geração 5 o
// raciocínio é LIGADO POR PADRÃO e divide `max_tokens` com o texto — dimensionar
// justo trunca o roteiro no meio. Não pedimos `thinking` no corpo (ver topo).
const ROTEIRO_MAX_TOKENS = 16_000;

export async function gerarRoteiroDeModulo(
  m: ModuloParaRoteiro,
  // `empresaId` etiqueta o custo no ledger — os DOIS ramos (batch e síncrono)
  // precisam dele, e nenhum tinha: 42 de 42 chamadas de `conteudo_video` sem
  // dono em 30 dias, US$ 7,10 (medido 07/09/2026). O chamador já conhece a
  // empresa; ela só não descia até aqui.
  opts: {
    forceSync?: boolean;
    empresaId?: string | null;
    /**
     * Coletor de lote compartilhado (`coletorDeRoteiros`, `lib/video/roteiro-lote.ts`):
     * quem dispara VÁRIAS células passa o mesmo coletor a todas, e os roteiros saem
     * num lote só, a −50%, sem somar espera por célula. Vence o `forceSync`.
     */
    aiRunRoteiro?: AIRun | null;
  } = {},
): Promise<{ roteiro?: VideoRoteiro; error?: string }> {
  const { system, user } = buildRoteiroPrompt(m);
  // O idioma do roteiro é EXPLÍCITO (Onda F, 04/10/2026): o do módulo-base (o mesmo que `buildRoteiroPrompt` já põe
  // no texto do prompt), senão pt-BR (`resolveAppLocale`). A voz é pt-BR. Sem isto o `callAI` síncrono lia o cookie de
  // quem clicou em "gerar vídeo", e o lote e a task caíam em pt-BR: o mesmo módulo saía em idiomas diferentes.
  const locale = resolveAppLocale(m.locale);
  const model = await getModelForTask(null as any, 'conteudo_video').catch(() => 'claude-sonnet-4-6');
  let roteiro: VideoRoteiro | null = null;
  // Chave de desligar: `VIDEO_ROTEIRO_MODE=sync` manda TUDO pelo síncrono, inclusive o coletor.
  const modoSync = process.env.VIDEO_ROTEIRO_MODE === 'sync';

  // Coletor (Kit e scripts de lote, desde 30/09/2026). A 2ª tentativa, se o texto do
  // lote não parsear, vai pelo síncrono: repetir pelo coletor abriria OUTRA rodada
  // de lote em série, e é justamente a espera somada que o coletor evita.
  if (opts.aiRunRoteiro && !modoSync) {
    const bruto = await opts.aiRunRoteiro(system, user, { model }, ROTEIRO_MAX_TOKENS, { taskKey: 'conteudo_video', empresaId: opts.empresaId ?? null, locale }).catch(() => '');
    roteiro = parseRoteiro(bruto);
    if (!roteiro) {
      const raw = await callAI(system, user, { model }, ROTEIRO_MAX_TOKENS, { taskKey: 'conteudo_video', source: 'batch-sync', empresaId: opts.empresaId ?? null, locale }).catch(() => '');
      roteiro = parseRoteiro(raw);
    }
    if (!roteiro) return { error: 'A IA não retornou um roteiro válido.' };
    return { roteiro: normalizarRoteiro(roteiro) };
  }

  // Lote avulso (disparo admin e resolução lazy): um item, polling aqui mesmo.
  // `forceSync` pula para o síncrono: quem chama uma célula por vez não pode esperar
  // o lote dela antes da próxima (para várias células, use o coletor acima).
  if (model.startsWith('claude') && !modoSync && !opts.forceSync) {
    try {
      const resultados = await submitClaudeBatch(
        [{ customId: BATCH_CUSTOM_ID, system, user, model, maxTokens: ROTEIRO_MAX_TOKENS, locale }],
        {
          pollMs: BATCH_POLL_MS,
          budgetMs: BATCH_POLL_MS * BATCH_MAX_POLLS,
          ledger: { feature: 'conteudo_video', empresaId: opts.empresaId ?? null },
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

  // Mesmo teto do ramo batch, e pelo mesmo motivo: 8.000 aqui contrariava o
  // ROTEIRO_MAX_TOKENS logo acima, que existe porque na geração 5 o raciocínio
  // divide `max_tokens` com o texto. Este ramo roda em Opus 5 (task conteudo_video).
  // `taskKey` porque sem ele o custo caía em `untagged`: 5 chamadas / $0,71 em 3
  // dias eram exatamente esta linha.
  // Sem `source`: este ramo é síncrono POR ESCOLHA (`forceSync`, `VIDEO_ROTEIRO_MODE`),
  // e o ledger o grava como `wrapper`. Até 30/09/2026 ele se rotulava `batch-sync`,
  // que em `lib/ai-batch.ts` significa lote DEGRADADO: o síncrono do Kit parecia falha.
  for (let tentativa = 1; tentativa <= 2 && !roteiro; tentativa++) {
    const raw = await callAI(system, user, { model }, ROTEIRO_MAX_TOKENS, {
      taskKey: 'conteudo_video', empresaId: opts.empresaId ?? null, locale,
    }).catch(() => '');
    roteiro = parseRoteiro(raw);
  }
  if (!roteiro) return { error: 'A IA não retornou um roteiro válido.' };
  return { roteiro: normalizarRoteiro(roteiro) };
}
