/**
 * Gera o ROTEIRO ESTRUTURADO de um vídeo a partir de um Módulo-Base (5 cenas do
 * spike). Usa o prompt puro de `roteiro-prompt.ts` + a IA do app (callAI).
 */
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { buildRoteiroPrompt, parseRoteiro, normalizarRoteiro, type ModuloParaRoteiro, type VideoRoteiro } from '@/lib/video/roteiro-prompt';

export type { RoteiroScene, VideoRoteiro, ModuloParaRoteiro } from '@/lib/video/roteiro-prompt';

const ANTHROPIC_VERSION = '2023-06-01';
const BATCH_POLL_MS = Number(process.env.VIDEO_ROTEIRO_BATCH_POLL_MS) || 15_000;
const BATCH_MAX_POLLS = Number(process.env.VIDEO_ROTEIRO_BATCH_MAX_POLLS) || 120;
// Budget de raciocínio (extended thinking) do roteiro. max_tokens da chamada
// precisa ser > budget + tamanho do JSON de saída (~8k) — ver ROTEIRO_MAX_TOKENS.
const ROTEIRO_THINKING_BUDGET = Number(process.env.VIDEO_ROTEIRO_THINKING_BUDGET) || 8_000;
const ROTEIRO_MAX_TOKENS = ROTEIRO_THINKING_BUDGET + 8_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function extractClaudeText(content: any[]): string {
  return content?.find((block) => block?.type === 'text')?.text || '';
}

async function callClaudeBatch(system: string, user: string, model: string, maxTokens: number): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');

  const headers = {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': ANTHROPIC_VERSION,
    'content-type': 'application/json',
  };

  const create = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: [{
        custom_id: 'roteiro-video',
        params: {
          model,
          max_tokens: maxTokens,
          // Extended thinking: roteiro tem muitas regras (estrutura, contagem de
          // palavras por cena, templates, DISC) — o raciocínio melhora aderência.
          // max_tokens precisa acomodar thinking + texto; extractClaudeText pega
          // só o bloco type==='text', então o thinking não polui o parse.
          thinking: { type: 'enabled', budget_tokens: ROTEIRO_THINKING_BUDGET },
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: user }],
        },
      }],
    }),
  });
  const batch = await create.json();
  if (!create.ok) throw new Error(`Anthropic batch create failed: ${JSON.stringify(batch).slice(0, 500)}`);

  let current = batch;
  for (let i = 0; i < BATCH_MAX_POLLS; i++) {
    if (current.processing_status === 'ended') break;
    await sleep(BATCH_POLL_MS);
    const poll = await fetch(`https://api.anthropic.com/v1/messages/batches/${batch.id}`, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
    });
    current = await poll.json();
    if (!poll.ok) throw new Error(`Anthropic batch poll failed: ${JSON.stringify(current).slice(0, 500)}`);
  }

  if (current.processing_status !== 'ended' || !current.results_url) {
    throw new Error(`Anthropic batch não terminou a tempo: ${current.processing_status || 'unknown'}`);
  }

  const results = await fetch(current.results_url, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
  });
  const text = await results.text();
  if (!results.ok) throw new Error(`Anthropic batch results failed: ${text.slice(0, 500)}`);

  const row = text.trim().split('\n').map((line) => JSON.parse(line)).find((r) => r.custom_id === 'roteiro-video');
  if (row?.result?.type !== 'succeeded') {
    throw new Error(`Anthropic batch roteiro falhou: ${JSON.stringify(row?.result || row).slice(0, 500)}`);
  }
  return extractClaudeText(row.result.message.content);
}

export async function gerarRoteiroDeModulo(m: ModuloParaRoteiro): Promise<{ roteiro?: VideoRoteiro; error?: string }> {
  const { system, user } = buildRoteiroPrompt(m);
  const model = await getModelForTask(null as any, 'conteudo_video').catch(() => 'claude-sonnet-4-6');
  let roteiro: VideoRoteiro | null = null;

  if (model.startsWith('claude') && process.env.VIDEO_ROTEIRO_MODE !== 'sync') {
    try {
      const raw = await callClaudeBatch(system, user, model, ROTEIRO_MAX_TOKENS);
      roteiro = parseRoteiro(raw);
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
