import { task } from '@trigger.dev/sdk';

/**
 * Estruturação ASSÍNCRONA de um MATERIAL grande (PDF/DOCX/TXT) em Módulos-Base.
 *
 * O texto já foi extraído pela action (submeterMaterialAsync) e gravado em
 * extracoes_video.transcricao. ANTES esta task chamava a rota interna que
 * segmentava — limitada a 800s na Vercel (livros grandes eram cortados, e a
 * conexão cortada marcava 'erro' falso). AGORA a segmentação roda DENTRO da task
 * (igual a gerar-kit), com o orçamento de tempo DELA (maxDuration), sem o teto de
 * 800s e sem HTTP no meio. Cobertura passa a ser ditada pelo material + maxDuration,
 * não pelo relógio da rota. Ver docs/MODULOS-BASE-CONTEUDO.md.
 */
export const estruturarMaterialTask = task({
  id: 'estruturar-material',
  maxDuration: 3600, // 1h — segmentação + estruturação de N módulos roda in-task (sem 800s)
  retry: { maxAttempts: 2 },
  run: async (payload: { extracaoId: string }) => {
    const { segmentarEEstruturarExtracao } = await import('@/actions/modulos-base');
    const r = await segmentarEEstruturarExtracao(payload.extracaoId);
    // segmentarEEstruturarExtracao já gravou status 'done'/'error' no registro.
    // Idempotente: re-run após 'done' devolve o existente sem duplicar.
    if (r.error && !r.idempotente) throw new Error(r.error);
    return { ok: true, extracaoId: payload.extracaoId, n: r.n };
  },
});
