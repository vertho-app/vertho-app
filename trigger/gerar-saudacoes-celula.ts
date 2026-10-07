import { task } from '@trigger.dev/sdk';
import { garantirSaudacoesDaCelula, resumirSaudacoes } from '../lib/video/saudacao-vertex';

/**
 * Áudio da saudação nominal ("Olá, {nome}") das pessoas de UMA célula de vídeo, sintetizado no Vertex na voz do elenco.
 * Disparado pelo `gerar-video-modulo` logo depois de enfileirar o render; o render leva ~20 min na box e o áudio sai em
 * segundos por pessoa, então já está no Storage quando a caixa monta os nominais. Por que task própria e não um passo do
 * `gerar-video-modulo`: o retorno dele é esperado (a mãe de um grupo de avatar devolve o avatar às irmãs ali) e uma síntese
 * pendurada não deve segurar uma máquina `large-1x`. Racional e calibração: `lib/video/saudacao-vertex.ts`.
 */
export const gerarSaudacoesCelulaTask = task({
  id: 'gerar-saudacoes-celula',
  machine: 'small-1x',
  maxDuration: 1200,
  // Sem retry de task: o laço de dentro já tenta 3× por pessoa, e o que ficar de fora a reconciliação refaz (a falta tem
  // rastro em `degradacao_log`). Repetir a task inteira só repetiria o que já existe, que é barato, mas não cura nada novo.
  retry: { maxAttempts: 1 },
  // No máximo duas células por vez (3 sínteses cada): o Vertex divide TPM com a narração dos vídeos e o podcast (F-V4).
  queue: { concurrencyLimit: 2 },
  run: async (p: { celulaId: string }) => {
    // 15 min de prazo para começar pessoa nova: bem abaixo dos 20 min do render, para o áudio não sair depois da montagem.
    const r = await garantirSaudacoesDaCelula(p.celulaId, { prazoAteMs: Date.now() + 15 * 60_000 });
    const resumo = resumirSaudacoes(r);
    console.log(`${p.celulaId}: saudações em Vertex →`, JSON.stringify(resumo));
    return { celulaId: p.celulaId, ...resumo };
  },
});
