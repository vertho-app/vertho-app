/**
 * Os tipos de relatório do Pulso e a regra de quando eles saem de cena.
 *
 * O Pulso está OFF-LINE desde 31/08/2026 (`lib/blocos-offline.ts`), mas a central
 * de relatórios do RH e a rota de PDF nunca consultavam o registro: se houvesse
 * um relatório do Pulso gravado, o RH o via listado e o baixava, inclusive o
 * "Pulso Complementar NR-1", cuja capa fala em fatores psicossociais (R-31 da
 * revisão de 02/10/2026; decisão do dono em 03/10/2026: esconder).
 *
 * Medido em 03/10/2026: nenhum relatório do Pulso gravado em `relatorios`. O
 * caminho estava aberto, mas hoje não mostrava nada. Esta regra fecha antes que
 * alguém grave.
 *
 * Os dados e o componente de PDF ficam no repositório: religar o Pulso é
 * remover a entrada de `lib/blocos-offline.ts`, e esta função passa a deixar
 * tudo aparecer de novo.
 */
import { blocoEstaOffline } from '@/lib/blocos-offline';

export const TIPOS_RELATORIO_PULSO = ['pulso_executivo', 'pulso_complementar_nr1'] as const;

export function ehTipoRelatorioPulso(tipo: unknown): boolean {
  return typeof tipo === 'string' && (TIPOS_RELATORIO_PULSO as readonly string[]).includes(tipo);
}

/** Tipo de relatório que não pode ser listado nem servido enquanto o Pulso estiver off-line. */
export function tipoRelatorioForaDoAr(tipo: unknown): boolean {
  return ehTipoRelatorioPulso(tipo) && blocoEstaOffline('pulso');
}
