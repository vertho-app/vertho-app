/**
 * Gera o ROTEIRO ESTRUTURADO de um vídeo a partir de um Módulo-Base (5 cenas do
 * spike). Usa o prompt puro de `roteiro-prompt.ts` + a IA do app (callAI).
 */
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { buildRoteiroPrompt, parseRoteiro, normalizarRoteiro, type ModuloParaRoteiro, type VideoRoteiro } from '@/lib/video/roteiro-prompt';

export type { RoteiroScene, VideoRoteiro, ModuloParaRoteiro } from '@/lib/video/roteiro-prompt';

export async function gerarRoteiroDeModulo(m: ModuloParaRoteiro): Promise<{ roteiro?: VideoRoteiro; error?: string }> {
  const { system, user } = buildRoteiroPrompt(m);
  const model = await getModelForTask(null as any, 'conteudo_video').catch(() => 'claude-sonnet-4-6');
  let roteiro: VideoRoteiro | null = null;
  for (let tentativa = 1; tentativa <= 2 && !roteiro; tentativa++) {
    const raw = await callAI(system, user, { model }, 4000).catch(() => '');
    roteiro = parseRoteiro(raw);
  }
  if (!roteiro) return { error: 'A IA não retornou um roteiro válido.' };
  return { roteiro: normalizarRoteiro(roteiro) };
}
