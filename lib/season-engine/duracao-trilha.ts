/**
 * "Quantas semanas tem esta trilha?": UMA função, para todas as peças.
 *
 * R-29 (revisão de 02/10/2026): cada peça respondia por uma fonte. O certificado
 * lia a config, o WhatsApp de trilha lia o tamanho do plano, a tela de conclusão
 * caía num `|| 14`, e a conversa qualitativa dizia "12 semanas" escrito à mão,
 * inclusive no texto que a IA é instruída a enviar. O resultado é o mesmo
 * programa contado de quatro jeitos: a Ibipeba (formato de 14 semanas, encerrada
 * em 9 pelo snapshot) lia 14 no painel do gestor e 9 no WhatsApp.
 *
 * A resposta é da CONFIG do programa (`ProgramaConfig.semanas`), pela ordem de
 * `getProgramaConfigDaTrilha`: o snapshot congelado na geração
 * (`trilhas.programa_config`), senão o carimbo (`trilhas.programa_modo`), senão
 * o programa legado de quem não tem carimbo. É a regra que o certificado já
 * seguia (23/09/2026) e que `lib/season-engine/programa-config.ts` descreve: a
 * duração de cada formato mora lá, não no tamanho de um `temporada_plano`.
 *
 * O PLANO só responde onde a config não consegue: o chamador não trouxe o
 * carimbo nem o snapshot (consultas que selecionam só o plano), ou o
 * Personalizado sem snapshot, que o rótulo sozinho não descreve. Por isso quem
 * chama traz `programa_modo` e `programa_config` no select (colunas pequenas, ao
 * contrário do `temporada_plano`, que é um jsonb inteiro por trilha).
 *
 * Quem não tem trilha ainda (o PDI, a prontidão) pergunta ao programa que uma
 * geração nova aplicaria: `getProgramaConfigDaGeracao(configEfetiva).semanas`.
 *
 * Não escreva `|| 14` nem `?? 14` num site de duração: quando a fonte não
 * responde, o certo é omitir o número, não inventar o de outro programa.
 */

import { getProgramaConfigDaTrilha } from './programa-config';
import { parseConfigSnapshot } from './programa-custom';
import { qualitativaDoPlano, totalSemanasDoPlano } from './trilha-runtime';

/** O que a conta lê de uma trilha. Ausente (`undefined`) = o chamador não selecionou a coluna. */
export interface TrilhaComDuracao {
  programa_modo?: string | null;
  programa_config?: unknown;
  temporada_plano?: unknown;
}

/**
 * Semanas do programa DESTA trilha. Nunca devolve 0: no pior caso lê o programa
 * legado, que é o DUO de 14 só para trilha SEM carimbo (a que nasceu antes da
 * mig 154 tem 14 entradas no plano).
 */
export function duracaoDaTrilha(
  trilha: TrilhaComDuracao | null | undefined,
  sysConfig?: { programa_modo?: string; programa_custom?: unknown } | null,
): number {
  const carimbo = trilha?.programa_modo;
  const configConhecida = !!parseConfigSnapshot(trilha?.programa_config)
    || (carimbo !== undefined && carimbo !== 'custom');
  if (!configConhecida) {
    const doPlano = totalSemanasDoPlano(trilha?.temporada_plano, 0);
    if (doPlano > 0) return doPlano;
  }
  return getProgramaConfigDaTrilha(trilha, sysConfig).semanas;
}

/**
 * Quantas semanas de DESENVOLVIMENTO antecedem a conversa de fechamento
 * qualitativa deste plano (a "semana 13" do formato de 14, a 8 do encerramento
 * da Ibipeba), ou `null` quando o plano não tem essa conversa.
 *
 * É o número que a conversa diz à pessoa ("o que mudou em você nessas N
 * semanas") e que a IA repete na abertura: era 12, escrito à mão, para todos.
 */
export function semanasDeDesenvolvimentoDoPlano(plano: unknown): number | null {
  const qualitativa = qualitativaDoPlano(plano);
  return qualitativa && qualitativa.semana > 1 ? qualitativa.semana - 1 : null;
}

/**
 * Esta é a ÚLTIMA semana do programa da trilha? É o que decide o que a tela diz
 * ao fim da conversa da semana: "Próxima semana libera ..." ou "Temporada
 * finalizada". Era `semanaNum >= 14`, e numa Jornada de 7, ou num Personalizado
 * sem fechamento (1 a 6 semanas), a trilha acaba antes: a última conversa
 * anunciava uma próxima semana que não existe (R-30).
 */
export function ehUltimaSemanaDaTrilha(
  trilha: TrilhaComDuracao | null | undefined,
  semana: number,
  sysConfig?: { programa_modo?: string; programa_custom?: unknown } | null,
): boolean {
  return Number(semana) >= duracaoDaTrilha(trilha, sysConfig);
}
