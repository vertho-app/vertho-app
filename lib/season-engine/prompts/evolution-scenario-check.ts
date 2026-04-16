/**
 * Check por segunda IA da avaliação da semana 14.
 * Igual ao check-ia4 do mapeamento: audita a avaliação primária e dá
 * nota 0-100 (≥90 = aprovado, <90 = revisar). Detecta erros graves:
 * nota sem evidência, delta inexplicado, justificativa genérica.
 */
interface DescritorRubrica {
  descritor: string;
  n1_gap?: string;
  n2_desenvolvimento?: string;
  n3_meta?: string;
  n4_referencia?: string;
}

interface PromptEvolutionScenarioCheckParams {
  competencia: string;
  descritores: DescritorRubrica[];
  cenario: string;
  resposta: string;
  avaliacaoPrimaria: unknown;
  evidenciasAcumuladas?: string;
}

export function promptEvolutionScenarioCheck({ competencia, descritores, cenario, resposta, avaliacaoPrimaria, evidenciasAcumuladas }: PromptEvolutionScenarioCheckParams) {
  const system = `Você é um auditor de qualidade de avaliação de competências. Sua tarefa é verificar se a avaliação gerada pela IA primária é RAZOÁVEL — não perfeita.

FILOSOFIA DA AUDITORIA:
- Você NÃO está refazendo a avaliação. Está verificando se ela é DEFENSÁVEL.
- Diferenças de ±0.5 em descritores individuais são ACEITÁVEIS (margens de interpretação).
- Foco em ERROS GRAVES: nota sem evidência na resposta, justificativa genérica, delta pré/pós injustificado, nota contradiz a régua.
- Avaliações imperfeitas mas razoáveis devem receber 85-95. Nota <70 só pra erros objetivos.

Avalie em 4 dimensões (25pts cada = 100pts):

1. ANCORAGEM NA RÉGUA (25pts)
   - Cada nota_pos cita comportamento da régua correto pro nível?
   - Se deu 3.0+, tem evidência no texto da resposta? Ou inventou?

2. COERÊNCIA DO DELTA (25pts)
   - Delta pré→pós faz sentido com a qualidade da resposta?
   - Regressões (nota_pos < nota_pre) estão justificadas?
   - Evoluções grandes (>1.0) têm evidência robusta?

3. JUSTIFICATIVA (25pts)
   - Cita TRECHO específico da resposta? (não precisa literal — parafrase vale)
   - Tom construtivo, não genérico?
   - ERRO GRAVE (→ max 60 total): justificativa que serviria pra qualquer pessoa.

4. TRIANGULAÇÃO COM EVIDÊNCIA ACUMULADA (25pts)
   - A nota_pos é coerente com as evidências das 13 semanas anteriores?
   - Se a resposta ao cenário está muito acima ou abaixo do padrão acumulado, a avaliação reconhece isso?
   - Se não, flagga como "divergente não reconhecido".

Retorne APENAS JSON, sem markdown.`;

  const reguas = descritores.map(d => {
    const linhas = [`### ${d.descritor}`];
    if (d.n1_gap) linhas.push(`  1.0: ${d.n1_gap}`);
    if (d.n2_desenvolvimento) linhas.push(`  2.0: ${d.n2_desenvolvimento}`);
    if (d.n3_meta) linhas.push(`  3.0: ${d.n3_meta}`);
    if (d.n4_referencia) linhas.push(`  4.0: ${d.n4_referencia}`);
    return linhas.join('\n');
  }).join('\n\n');

  const user = `COMPETÊNCIA: ${competencia}

CENÁRIO APRESENTADO:
${cenario}

RESPOSTA DO COLABORADOR:
"${resposta}"

RÉGUA DE MATURIDADE (referência):
${reguas}

EVIDÊNCIAS ACUMULADAS NAS 13 SEMANAS:
${evidenciasAcumuladas || '(sem evidências registradas)'}

AVALIAÇÃO PRIMÁRIA (a ser auditada):
${JSON.stringify(avaliacaoPrimaria, null, 2)}

Retorne:
{
  "nota_auditoria": 0-100,
  "status": "aprovado | revisar",
  "ajustes_sugeridos": [
    { "descritor": "nome", "nota_pos_sugerida": 1.0-4.0, "motivo": "por que ajustar" }
  ],
  "alertas": ["lista de observações críticas, ou [] se aprovado"],
  "resumo_auditoria": "1-2 frases sobre qualidade geral da avaliação"
}

"status" = "aprovado" se nota_auditoria >= 90 E ajustes_sugeridos está vazio.
"ajustes_sugeridos" só pra casos onde o ajuste é defensável (diff >= 0.5).`;

  return { system, user };
}
