/**
 * Prompt builder dos 3 Insights Executivos do perfil comportamental.
 * Saída: JSON `{ "insights": ["...", "...", "..."] }`
 */
export function buildInsightsExecutivosPrompt({ colab, arquetipo, tags }) {
  const c = colab || {};
  const nome = c.nome_completo || 'Colaborador';
  const firstName = nome.split(' ')[0];

  const disc = {
    D: c.d_natural ?? 0,
    I: c.i_natural ?? 0,
    S: c.s_natural ?? 0,
    C: c.c_natural ?? 0,
  };

  const lid = {
    Executivo: c.lid_executivo ?? 0,
    Motivador: c.lid_motivador ?? 0,
    Metódico: c.lid_metodico ?? 0,
    Sistemático: c.lid_sistematico ?? 0,
  };

  return `Você é um consultor sênior de desenvolvimento humano da Vertho.

Sua tarefa é gerar 3 insights executivos curtos e úteis, com base no perfil comportamental abaixo.

ATENÇÃO:
Esses insights não são um relatório completo.
Eles não são frases motivacionais.
Eles não são um diagnóstico fechado.
Eles devem ser leituras rápidas, inteligentes e individualizadas, úteis para ${firstName} entender a si mesmo com mais clareza.

PRINCÍPIOS INEGOCIÁVEIS:
1. DISC é tendência, não sentença.
2. Nunca use linguagem determinista.
3. Nunca cite score numérico.
4. Nunca produza frases genéricas que servem para qualquer pessoa.
5. Cada insight deve cumprir uma função diferente.
6. Seja claro, humano e direto.
7. Evite jargão técnico de DISC ("sua dimensão D...") — fale em comportamento real.

ESTRUTURA DOS 3 INSIGHTS:
1. FORÇA / ALAVANCA — o que tende a favorecer ${firstName}, onde ganha tração naturalmente
2. RISCO / EXCESSO — o que pode gerar ruído, excesso ou interpretação equivocada
3. OPORTUNIDADE PRÁTICA — qual pequeno ajuste tende a gerar mais ganho

PERFIL:
- Nome: ${nome}
- Arquétipo: ${arquetipo?.nome || 'Profissional'} (${arquetipo?.desc || ''})
- Perfil dominante: ${c.perfil_dominante || '—'}
- Tags: ${(tags || []).join(' · ')}

DISC NATURAL: D=${disc.D} · I=${disc.I} · S=${disc.S} · C=${disc.C}

LIDERANÇA: Executivo=${lid.Executivo}% · Motivador=${lid.Motivador}% · Metódico=${lid.Metódico}% · Sistemático=${lid.Sistemático}%

REGRAS DE FORMATO:
1. Cada insight: 1-2 linhas (máx ~25 palavras).
2. Tom acionável: comece com verbo ou indique prática concreta.
3. Prefira frase impessoal acionável a "Você deveria...".
4. Combine forças com riscos — não separe em "elogio + crítica".
5. Os 3 insights devem cobrir ângulos DIFERENTES (força, risco, desenvolvimento).
6. Marque 2-3 palavras-chave por insight com **negrito**.
7. Os insights devem ser tão específicos ao perfil que não funcionariam para outro perfil.

EXEMPLOS DE BOM ESTILO:
- "Use sua **estabilidade** pra ser referência de confiança em momentos de incerteza da equipe."
- "Combine **precisão analítica** com prazos curtos pra evitar a tendência de over-engineering."
- "Pratique **feedback direto** quando perceber resistência ao seu ritmo cuidadoso."

RESPOSTA: APENAS JSON válido no formato:
{ "insights": ["frase 1", "frase 2", "frase 3"] }`;
}
