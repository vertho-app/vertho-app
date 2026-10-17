/**
 * O plano visual v7 dentro do `gerar-video-modulo` (E3 da migração do vídeo, 17/10/2026): lê a chave do cliente,
 * monta o contexto, chama o Opus e o gerador de imagem pelos caminhos com registro de custo e grava o resultado em
 * `videos_gerados.visual_v7`. A regra do módulo está em `etapa-plano.ts`.
 *
 * NUNCA lança e nunca muda o vídeo de hoje: sem a chave do cliente não faz nada; com ela, qualquer falha vira uma
 * linha em `degradacao_log` e o vídeo segue no formato atual. O render no formato novo é a E4.
 *
 * Custo por vídeo: o plano, o ajuste e as ilustrações gravam `ia_usage_log.correlation_id` = id do vídeo
 * (`sum(cost_usd) where correlation_id = <videoId>`). O acesso ao banco é o REST do service role que o
 * `gerar-video-modulo` já usa (`render-helpers`), para não abrir outro cliente.
 */
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { resolveAppLocale } from '@/lib/i18n';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { gerarImagemEditorial } from '@/lib/imagem-editorial';
import { SUPA, KEY, storagePut } from '../render-helpers';
import { cenasDoMiolo, configVideoV7, contextoDoVideo, gerarVisualV7, type PropsDoMiolo, type VisualV7 } from './etapa-plano';

const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}` });

async function lerUm<T>(caminho: string): Promise<T | null> {
  const r = await fetch(`${SUPA}/rest/v1/${caminho}`, { headers: H() });
  if (!r.ok) throw new Error(`leitura ${caminho.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 150)}`);
  const j = (await r.json()) as T[];
  return j?.[0] ?? null;
}

type DoVideo = { cargo: string | null; modulo_base_id: string | null };
type DaEmpresa = { nome: string | null; segmento: string | null; sys_config: Record<string, unknown> | null };

/**
 * Roda a etapa para um vídeo. `props` é o `render_inputprops` recém-montado (cenas e legendas com os tempos reais).
 * Devolve o que aconteceu, só para o log da task.
 */
export async function planoVisualV7(p: {
  videoId: string;
  empresaId: string | null;
  roteiro: { scenes: readonly { id: string }[] };
  props: PropsDoMiolo;
}): Promise<'desligado' | 'feito' | 'reaproveitado' | 'falhou'> {
  const { videoId, empresaId } = p;
  if (!empresaId) return 'desligado';
  let fase = 'chave';
  try {
    const empresa = await lerUm<DaEmpresa>(`empresas?id=eq.${empresaId}&select=nome,segmento,sys_config`);
    const cfg = configVideoV7(empresa?.sys_config);
    if (!cfg.ligado) return 'desligado';

    fase = 'leitura';
    const video = await lerUm<DoVideo>(`videos_gerados?id=eq.${videoId}&select=cargo,modulo_base_id`);
    const modulo = video?.modulo_base_id
      ? await lerUm<{ locale: string | null }>(`modulos_base_conteudo?id=eq.${video.modulo_base_id}&select=locale`)
      : null;
    // O plano anterior (retry do mesmo vídeo): sem a coluna (migration 290 não aplicada) segue sem ele.
    const anterior = await lerUm<{ visual_v7: VisualV7 | null }>(`videos_gerados?id=eq.${videoId}&select=visual_v7`)
      .then((r) => r?.visual_v7 ?? null).catch(() => null);

    const contexto = contextoDoVideo({ configurado: cfg.contexto, empresaNome: empresa?.nome ?? null, segmento: empresa?.segmento ?? null, cargo: video?.cargo ?? null });
    const locale = resolveAppLocale(modulo?.locale);
    const model = await getModelForTask(empresaId, 'video_plano_visual');
    const tag = Date.now().toString(36);

    fase = 'plano';
    const t0 = Date.now();
    const { visual, reaproveitado } = await gerarVisualV7({ cenas: cenasDoMiolo(p.roteiro, p.props), contexto, anterior }, {
      // `semRetentativa`: falhou, o vídeo segue no formato de hoje; não cai num plano de outro provedor que ninguém validou.
      chamarIA: (system, user, maxTokens) => callAI(system, user, { model }, maxTokens, {
        taskKey: 'video_plano_visual', empresaId, locale, reasoningEffort: 'low', correlationId: videoId,
        semRetentativa: true, maxRetries: 2, timeoutMs: 300_000,
      }),
      gerarImagem: async (prompt) => {
        const r = await gerarImagemEditorial(prompt, 'paisagem', { ledger: { feature: 'video_ilustracao', empresaId, correlationId: videoId } });
        return { buffer: r.buffer, mimeType: r.mimeType, modelo: r.modelo, provedor: r.provedor };
      },
      guardarImagem: (arquivo, buffer, mimeType) => storagePut('video-assets', `${videoId}/v7-${tag}-${arquivo}`, buffer, mimeType),
    });
    if (reaproveitado) {
      console.log(`[plano-v7] ${videoId}: plano reaproveitado (mesmas frases, assinatura ${visual.assinatura})`);
      return 'reaproveitado';
    }

    fase = 'gravacao';
    const r = await fetch(`${SUPA}/rest/v1/videos_gerados?id=eq.${videoId}`, {
      method: 'PATCH',
      headers: { ...H(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ visual_v7: visual }),
    });
    if (!r.ok) throw new Error(`gravar visual_v7: ${r.status} ${(await r.text()).slice(0, 150)}`);
    console.log(`[plano-v7] ${videoId}: ${visual.momentos.length} momentos em ${visual.cenas.length} cenas, ${visual.imagens.length} ilustração(ões), ${visual.ajustes.length} troca(s) de ajuste, ${visual.problemasRestantes} problema(s) restante(s), ${Math.round((Date.now() - t0) / 1000)} s`);
    return 'feito';
  } catch (e) {
    const erro = String((e as Error)?.message || e).slice(0, 400);
    console.warn(`[plano-v7] ${videoId} falhou na fase ${fase}, o vídeo segue no formato de hoje:`, erro);
    await registrarDegradacao({
      fluxo: 'video', tipo: DEGRADACAO.VIDEO_PLANO_V7_FALHOU, chave: `${videoId}:${fase}`, empresaId, severidade: 'aviso',
      detalhe: { videoId, fase, erro },
    });
    return 'falhou';
  }
}
