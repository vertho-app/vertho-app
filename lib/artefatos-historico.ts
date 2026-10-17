/**
 * Arquivar o blueprint ou o PDI ATUAL de uma pessoa antes de o escritor sobrescrevê-lo (mig 289, 17/10/2026).
 *
 * `development_blueprints` e `relatorios` (tipo individual) têm UMA linha por pessoa e a geração é upsert: regerar
 * apagava a versão anterior. Na Temporada 2 de Ibipeba isso apagaria o blueprint e o PDI da Temporada 1 de 25
 * pessoas, e a regra do dono é que o que a pessoa fez é evidência dela. O escritor chama isto ANTES do upsert e, se
 * voltar `error`, NÃO sobrescreve: arquivo que falha em silêncio é só intenção.
 *
 * O PDF não é copiado: o caminho no bucket tem carimbo de tempo (`caminhoDoPdf`), então o arquivo antigo continua lá
 * e basta guardar o `pdf_path`. Gravação idempotente por (tipo, origem_id, gerado_em): refazer uma geração que falhou
 * depois de arquivar não duplica a versão.
 */

export type TipoArtefato = 'blueprint' | 'pdi';

export const TABELA_HISTORICO = 'artefatos_jornada_historico';

/**
 * A linha viva vira a linha do histórico. Pura: o teste trava o que cada tipo leva (o PDI guarda o `pdf_path`; o
 * blueprint, a auditoria que morava fora do JSON).
 */
export function linhaDoHistorico(tipo: TipoArtefato, colaboradorId: string, atual: any): Record<string, unknown> {
  if (tipo === 'blueprint') {
    return {
      colaborador_id: colaboradorId, tipo, origem_id: atual.id, conteudo: atual.blueprint,
      spec_version: atual.spec_version ?? null, auditoria: atual.auditoria ?? null, auditado_em: atual.auditado_em ?? null,
      gerado_em: atual.gerado_em, motivo: 'sobrescrito',
    };
  }
  return {
    colaborador_id: colaboradorId, tipo, origem_id: atual.id, conteudo: atual.conteudo,
    pdf_path: atual.pdf_path ?? null, gerado_em: atual.gerado_em, motivo: 'sobrescrito',
  };
}

/**
 * Copia a versão atual (se houver) para o histórico. `tdb` = cliente da empresa (`tenantDb`): o filtro e o
 * `empresa_id` da linha nova vêm dele.
 */
export async function arquivarArtefatoAtual(
  tdb: any,
  tipo: TipoArtefato,
  colaboradorId: string,
): Promise<{ arquivado: boolean; error?: string }> {
  const leitura = tipo === 'blueprint'
    ? tdb.from('development_blueprints').select('id, blueprint, spec_version, auditoria, auditado_em, gerado_em')
      .eq('colaborador_id', colaboradorId)
    : tdb.from('relatorios').select('id, conteudo, pdf_path, gerado_em')
      .eq('colaborador_id', colaboradorId).eq('tipo', 'individual');
  const { data: atual, error: errLer } = await leitura.maybeSingle();
  if (errLer) return { arquivado: false, error: `não li o ${tipo} atual para arquivar: ${errLer.message}` };
  if (!atual) return { arquivado: false };
  if (!atual.gerado_em) return { arquivado: false, error: `o ${tipo} atual não tem gerado_em; sem ele a versão não tem jornada` };

  const { error: errGravar } = await tdb.from('artefatos_jornada_historico')
    .upsert(linhaDoHistorico(tipo, colaboradorId, atual), { onConflict: 'tipo,origem_id,gerado_em', ignoreDuplicates: true });
  if (errGravar) return { arquivado: false, error: `não arquivei o ${tipo} atual: ${errGravar.message}` };
  return { arquivado: true };
}
