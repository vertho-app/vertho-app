import 'server-only';

import { tenantDb } from '@/lib/tenant-db';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import {
  avaliarUmaRespostaCore,
  carregarContextoLoteIA4,
  IA4_COLAB_COLS,
} from '@/lib/ia4-avaliacao';

/**
 * Avaliação da degustação: o MESMO motor da IA4 de produção, disparado sozinho.
 *
 * POR QUE ISTO EXISTE. Fora daqui, quem manda avaliar é um humano no painel da
 * empresa ("IA4 — Avaliar + Check") — o que é correto para cliente real, onde a
 * nota vira PDI e trilha, e alguém decide quando rodar. Na degustação não há
 * esse alguém: o prospect responde sozinho, em minutos, e ia embora vendo
 * "Análise em processamento" para sempre (medido 01/09/2026: a única resposta
 * de convidado no ACME estava com `nivel_ia4` nulo).
 *
 * POR QUE EM SEGUNDO PLANO. `Medido:` a avaliação leva 107,5s de mediana e
 * 153,6s no p90 (60 dias de `ia_usage_log`). Segurar a tela por dois minutos
 * numa demonstração não é espera, é desistência — então quem espera é o
 * roteiro: o disparo acontece no envio da resposta e o resultado amadurece
 * enquanto a pessoa percorre as visões 02–04. Ela volta e a devolutiva está lá.
 *
 * SEM O CHECK DUAL. A segunda IA (`ia4_check`, +19,4s e +US$ 0,045) existe para
 * auditar nota que vira PDI e plano de desenvolvimento. Aqui a nota morre com o
 * passaporte. O que precisa estar certo é a leitura que a pessoa lê.
 *
 * Núcleo headless de propósito (`lib/`, sem `'use server'`): quem chama é o
 * `after()` de uma action já autenticada, e não existe gate a aplicar de novo —
 * o `empresaId` vem da sessão, nunca do cliente.
 */
/** Só vale tentar de novo se a 1ª tentativa falhou rápido: a segunda leva ~2 minutos e a função tem teto. */
export const RETENTATIVA_ATE_MS = 90_000;

/**
 * A análise da degustação com STATUS e RETENTATIVA (R-103, 04/10/2026).
 *
 * Quem a dispara é um `after()` sem ninguém olhando: se falhava, a página do
 * lead ficava em "em análise" indefinidamente e nada ficava registrado. Agora:
 *  - uma segunda tentativa, só se a primeira falhou rápido (ver `RETENTATIVA_ATE_MS`);
 *  - a falha final vira linha em `degradacao_log` (`degustacao-avaliacao-falhou`),
 *    que o health lê, e a página passa a dizer que está demorando.
 * Nunca lança.
 */
export async function avaliarRespostaDaDegustacaoComRetentativa(
  empresaId: string,
  alvo: { colaboradorId: string; competenciaId: string },
  deps: { avaliar?: typeof avaliarRespostaDaDegustacao; agora?: () => number } = {},
): Promise<{ success: boolean; message?: string; error?: string }> {
  const avaliar = deps.avaliar ?? avaliarRespostaDaDegustacao;
  const agora = deps.agora ?? Date.now;
  const inicio = agora();
  const tentar = async () => {
    try {
      return await avaliar(empresaId, alvo);
    } catch (e: any) {
      return { success: false, error: String(e?.message || e) };
    }
  };
  let r = await tentar();
  if (!r.success && agora() - inicio < RETENTATIVA_ATE_MS) r = await tentar();
  if (!r.success) {
    console.warn('[degustacao] avaliar resposta (sem sucesso):', r.error);
    await registrarDegradacao({
      fluxo: 'demo',
      tipo: DEGRADACAO.DEGUSTACAO_AVALIACAO_FALHOU,
      chave: `${alvo.colaboradorId}:${alvo.competenciaId}`,
      empresaId,
      colaboradorId: alvo.colaboradorId,
      detalhe: { erro: String(r.error || 'sem motivo').slice(0, 300), competenciaId: alvo.competenciaId },
    });
  }
  return r;
}

export async function avaliarRespostaDaDegustacao(
  empresaId: string,
  alvo: { colaboradorId: string; competenciaId: string },
): Promise<{ success: boolean; message?: string; error?: string }> {
  const { colaboradorId, competenciaId } = alvo || ({} as any);
  if (!empresaId || !colaboradorId || !competenciaId) {
    return { success: false, error: 'empresaId, colaboradorId e competenciaId obrigatórios' };
  }
  const tdb = tenantDb(empresaId);

  // A linha é achada pela CHAVE NATURAL (a mesma do índice único do upsert:
  // empresa_id + colaborador_id + competencia_id), não pelo id devolvido na
  // gravação: assim o disparo não depende de o upsert ter retornado a linha.
  // `tdb` escopa por empresa_id — resposta de outro tenant não é encontrada
  // aqui, em vez de ser encontrada e recusada.
  const { data: resp, error: respErr } = await tdb.from('respostas')
    .select('*')
    .eq('colaborador_id', colaboradorId)
    .eq('competencia_id', competenciaId)
    .maybeSingle();
  if (respErr) return { success: false, error: respErr.message };
  if (!resp) return { success: false, error: 'Resposta não encontrada' };
  if (resp.avaliacao_ia) return { success: true, message: 'Já avaliada' };

  const { data: colabs, error: colabErr } = await tdb.from('colaboradores')
    .select(IA4_COLAB_COLS)
    .eq('id', resp.colaborador_id);
  if (colabErr) return { success: false, error: colabErr.message };
  const colab = colabs?.[0];
  if (!colab) return { success: false, error: 'Colaborador da resposta não encontrado' };

  const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, tdb.raw, empresaId);
  return avaliarUmaRespostaCore(tdb, tdb.raw, resp, colab, empresa, contextoPPP, {});
}
