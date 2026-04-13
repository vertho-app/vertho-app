/**
 * Prompt builder dos 3 "Actionable Insights" do resumo executivo do
 * perfil comportamental.
 *
 * Saída esperada do LLM: JSON `{ "insights": ["...", "...", "..."] }`
 * com 3 frases curtas (1 a 2 linhas cada), em português brasileiro,
 * tom direto e acionável.
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

  return `Você é um consultor sênior de desenvolvimento humano. Gere 3 insights executivos
acionáveis para o perfil comportamental abaixo. Cada insight tem que ser curto
(1-2 linhas), direto, em português brasileiro, focado em ação prática que o
colaborador pode tomar HOJE.

PERFIL:
- Nome: ${nome}
- Arquétipo: ${arquetipo?.nome || 'Profissional'} (${arquetipo?.desc || ''})
- Perfil dominante: ${c.perfil_dominante || '—'}
- Tags: ${(tags || []).join(' · ')}

DISC NATURAL: D=${disc.D} · I=${disc.I} · S=${disc.S} · C=${disc.C}

LIDERANÇA: Executivo=${lid.Executivo}% · Motivador=${lid.Motivador}% · Metódico=${lid.Metódico}% · Sistemático=${lid.Sistemático}%

REGRAS:
1. Cada insight: 1-2 linhas (máx ~25 palavras).
2. Tom acionável: comece com verbo no imperativo ou indique uma prática concreta.
3. Use ${firstName} ou tratamento direto ("Você", "Sua") apenas se necessário — prefira frase impessoal acionável.
4. Combine pontos fortes do perfil com áreas de atenção.
5. Evite jargão técnico de DISC ("sua dimensão D...") — fale em comportamento real.
6. Os 3 insights devem cobrir ângulos diferentes (ex: força, equilíbrio, desenvolvimento).
7. Marque palavras-chave importantes do insight com **negrito** (formato Markdown). Use 2-3 negritos por insight no máximo.

EXEMPLOS DE BOM ESTILO:
- "Use sua **estabilidade** pra ser referência de confiança em momentos de incerteza da equipe."
- "Combine **precisão analítica** com prazos curtos pra evitar a tendência de over-engineering."
- "Pratique **feedback direto** quando perceber resistência ao seu ritmo cuidadoso."

RESPOSTA: APENAS JSON válido no formato:
{ "insights": ["frase 1", "frase 2", "frase 3"] }`;
}
