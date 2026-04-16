// =====================================================================
// VERTHO - ValidationService.gs  (Fase 3 - IA Conversacional)
//
// Validacao dupla: apos o Claude avaliar, o Gemini audita.
// Detecta: evidencias inventadas, divergencia de nivel, vieses.
//
// Dependencias: Config.gs, AIRouter.gs
// =====================================================================

const ValidationService = {

  /**
   * Valida uma avaliacao do Claude usando o Gemini como auditor.
   *
   * @param {Array}  conversationHistory  [{role, content, timestamp}]
   * @param {Object} claudeEvaluation     Resultado [EVAL] do Claude
   * @param {Object} competencyData       Dados da competencia (niveis, indicadores)
   * @returns {Object} { validacao, nivel_sugerido, evidencias_invalidas, comentario }
   */
  validate(conversationHistory, claudeEvaluation, competencyData) {
    // Montar texto da conversa
    var historyText = (conversationHistory || []).map(function(h) {
      var speaker = h.role === 'user' ? 'Colaborador' : 'Mentor IA';
      return speaker + ': ' + h.content;
    }).join('\n\n');

    // Montar prompt de auditoria
    var prompt = [
      'Voce e um auditor de qualidade de avaliacoes comportamentais.',
      'Sua tarefa e verificar se a avaliacao feita por outro modelo de IA e valida.',
      '',
      'Verifique:',
      '1. Cada evidencia listada foi REALMENTE mencionada pelo colaborador na conversa?',
      '2. O nivel atribuido e coerente com os indicadores da competencia?',
      '3. A confianca esta justificada pelas evidencias?',
      '4. Ha alguma evidencia INVENTADA (mencionada na avaliacao mas NAO na conversa)?',
      '5. Ha vies de ancoragem (nota influenciada pelo baseline do diagnostico)?',
      '',
      '== CONVERSA COMPLETA ==',
      historyText,
      '',
      '== AVALIACAO A AUDITAR ==',
      JSON.stringify(claudeEvaluation, null, 2),
      '',
      '== MATRIZ DA COMPETENCIA ==',
      JSON.stringify(competencyData, null, 2),
      '',
      'Responda APENAS em JSON (sem markdown, sem explicacao):',
      '{"validacao":"aprovada|divergente|evidencia_inventada","nivel_sugerido":null,"evidencias_invalidas":[],"comentario":""}'
    ].join('\n');

    try {
      var response = AIRouter.callGemini({ fullText: prompt });
      var cleaned = response.replace(/```json|```/g, '').trim();
      var result = JSON.parse(cleaned);

      // Validar estrutura minima
      if (!result.validacao) {
        result.validacao = 'pendente';
        result.comentario = 'Resposta do validador sem campo validacao';
      }

      // Log para auditoria
      Logger.log('ValidationService: ' + result.validacao
        + ' | nivel_sugerido: ' + (result.nivel_sugerido || 'N/A')
        + ' | invalidas: ' + (result.evidencias_invalidas || []).length);

      return result;

    } catch (e) {
      Logger.log('ValidationService erro: ' + e.message);
      return {
        validacao: 'pendente',
        nivel_sugerido: null,
        evidencias_invalidas: [],
        comentario: 'Erro na validacao automatica: ' + e.message
      };
    }
  }
};