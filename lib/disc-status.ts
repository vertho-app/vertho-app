/**
 * Critério único de "mapeamento comportamental (DISC) concluído".
 *
 * Usado como PRÉ-REQUISITO das etapas seguintes do diagnóstico (geração e
 * despacho de cenários, indicadores de progresso, Fit, Relatório). Quem ainda
 * não fez o DISC é desconsiderado dessas etapas.
 *
 * Mesmo critério aplicado no Fit e no Relatório Comportamental: precisa de
 * `perfil_dominante` definido + ao menos um eixo D/I/S/C preenchido.
 */
export function hasDiscMapeado(c: any): boolean {
  return !!(c?.perfil_dominante && (c.d_natural || c.i_natural || c.s_natural || c.c_natural));
}
