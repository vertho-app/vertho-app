// Validação e persistência compartilhadas pelos modos imediato e lote.
export const VERSAO_AUDITOR_B = 2;

export function validarCenarioB(cenarioData: any, cenA: any): string[] {
  if (!cenarioData?.titulo || !cenarioData?.descricao) return ['Cenário sem título ou descrição'];
  const errors: string[] = [];
  if (!cenarioData.p1 || !cenarioData.p2 || !cenarioData.p3 || !cenarioData.p4) errors.push('Faltam perguntas p1-p4');
  if (typeof cenarioData.confianca_cenario === 'number' && (cenarioData.confianca_cenario < 0 || cenarioData.confianca_cenario > 1)) errors.push('confianca fora de 0-1');
  if (Array.isArray(cenarioData.stakeholders_centrais) && cenarioData.stakeholders_centrais.length > 2) errors.push('Max 2 stakeholders');

  // Heurística de semelhança: overlap de palavras substantivas entre A e B
  const stopwords = new Set(['de','da','do','das','dos','em','na','no','nas','nos','um','uma','o','a','os','as','que','e','para','com','por','se','ao','ou','mais','não','como','mas','sua','seu','seus','suas','este','esta','esse','essa']);
  const extractWords = (t: string) => (t || '').toLowerCase().replace(/[^a-záàâãéèêíóòôõúç\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
  const wordsA = new Set(extractWords(cenA.descricao));
  const wordsB = extractWords(cenarioData.descricao || '');
  const overlap = wordsB.filter(w => wordsA.has(w)).length;
  const overlapPct = wordsB.length > 0 ? overlap / wordsB.length : 0;
  if (overlapPct > 0.6) errors.push(`Semelhança excessiva com Cenário A (${Math.round(overlapPct * 100)}% overlap)`);

  return errors;
}

export function montarDadosCenarioB(cenA: any, cenarioData: any) {
  return {
    competencia_id: cenA.competencia_id,
    cargo: cenA.cargo,
    titulo: cenarioData.titulo,
    descricao: cenarioData.descricao,
    p1: cenarioData.p1,
    p2: cenarioData.p2,
    p3: cenarioData.p3,
    p4: cenarioData.p4,
    alternativas: {
      p1: cenarioData.p1,
      p2: cenarioData.p2,
      p3: cenarioData.p3,
      p4: cenarioData.p4,
      faceta_avaliada: cenarioData.faceta_avaliada || null,
      facetas_secundarias: cenarioData.facetas_secundarias || [],
      diferenca_estrutural_vs_cenario_a: cenarioData.diferenca_estrutural_vs_cenario_a || null,
      por_que_essa_variacao_importa: cenarioData.por_que_essa_variacao_importa || null,
      tradeoff_testado: cenarioData.tradeoff_testado || null,
      armadilha_de_resposta_generica: cenarioData.armadilha_de_resposta_generica || null,
      objetivo_diagnostico: cenarioData.objetivo_diagnostico || null,
      referencia_avaliacao: cenarioData.referencia_avaliacao || null,
      dilema_etico: cenarioData.dilema_etico_embutido || null,
      confianca_cenario: typeof cenarioData.confianca_cenario === 'number' ? Math.max(0, Math.min(1, cenarioData.confianca_cenario)) : null,
      riscos_do_cenario: cenarioData.riscos_do_cenario || [],
    },
    tipo_cenario: 'cenario_b',
  };
}

export function normalizarCheckCenB(resultado: any) {
  if (!resultado || typeof resultado.nota !== 'number' || !Number.isFinite(resultado.nota) || resultado.nota < 0 || resultado.nota > 100) return null;
  const normalizado = { ...resultado, nota: resultado.erro_grave ? Math.min(60, resultado.nota) : resultado.nota };
  const statusCheck = normalizado.nota >= 90 ? 'aprovado' : normalizado.nota >= 80 ? 'aprovado_com_ressalvas' : 'revisar';
  return { resultado: normalizado, statusCheck };
}
