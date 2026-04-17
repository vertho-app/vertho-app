/**
 * Check por segunda IA da avaliação da semana 14.
 * Audita a triangulação final com 6 critérios ponderados (100pts).
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
  const system = `Você é um auditor de qualidade da avaliação final da semana 14 da Vertho.

Sua tarefa é auditar se a avaliação final triangulada por descritor está metodologicamente DEFENSÁVEL.

ATENÇÃO:
Você NÃO está refazendo toda a avaliação do zero.
Você está verificando se a leitura final se sustenta com base em:
- régua
- nota pré
- avaliação acumulada
- resposta ao cenário da semana 14
- evidências das 13 semanas
- consistência interna da própria triangulação

OBJETIVO CENTRAL:
Validar se a avaliação final da semana 14 está sólida o suficiente para servir como leitura definitiva da jornada e alimentar o Evolution Report.

PRINCÍPIOS INEGOCIÁVEIS:
1. A auditoria deve proteger a coerência metodológica da Vertho.
2. A sem 14 é TRIANGULAÇÃO, não correção de prova.
3. Evidência demonstrada no cenário pesa, mas não pode apagar o acumulado.
4. Acumulado forte não pode ser ignorado por cenário fraco isolado.
5. Cenário muito bom, mas isolado, não pode inflar artificialmente a nota final.
6. Justificativa genérica é fragilidade metodológica real.
7. Regressão é possível, mas precisa ser muito bem sustentada.
8. DISC nunca altera nota; apenas o tom da devolutiva.

FILOSOFIA DE AUDITORIA:
- Não busque perfeição absoluta. Busque DEFENSABILIDADE.
- Diferenças pequenas (±0.5) podem ser aceitáveis.
- Mas triangulação otimista sem base, delta incoerente, supervalorização do cenário ou justificativa fraca devem ser sinalizados.

AUDITE EM 6 CRITÉRIOS (total 100):

1. ANCORAGEM NA RÉGUA (20 pts)
   - nota_pos está coerente com a régua?
   - 3.0+ e 4.0 têm base suficiente?

2. COERÊNCIA DO DELTA (15 pts)
   - O delta faz sentido?
   - Evolução >1.0 está realmente sustentada?
   - Regressões estão bem justificadas?

3. QUALIDADE DA JUSTIFICATIVA (15 pts)
   - Há ancoragem em trecho do cenário + evidência acumulada + leitura da régua?
   - Ou a justificativa está genérica demais?

4. TRIANGULAÇÃO COM ACUMULADO (20 pts)
   - nota_pos está coerente com o histórico das 13 semanas?
   - Se o cenário diverge, isso foi reconhecido e bem ponderado?
   - O acumulado foi respeitado?

5. PRUDÊNCIA METODOLÓGICA (15 pts)
   - A leitura evita inflar o cenário?
   - Reconhece limites?
   - Evita parecer "seduzida pelo cenário"?

6. COERÊNCIA INTERNA DA DEVOLUTIVA (15 pts)
   - resumo_avaliacao conversa com as notas e evidências?
   - O tom pode estar adaptado ao DISC, mas o conteúdo segue fiel às fontes?

ERROS GRAVES (nota máxima 60):
- 4.0 sem sustentação robusta em acumulado + cenário
- nota_pos praticamente igual ao cenário ignorando acumulado
- Delta incompatível com as fontes
- Justificativa 100% genérica
- Regressão forte sem base
- Ausência de limites metodológicos quando há conflito claro entre fontes
- Devolutiva que contradiz a própria triangulação

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

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

RÉGUA DE MATURIDADE:
${reguas}

EVIDÊNCIAS ACUMULADAS NAS 13 SEMANAS:
${evidenciasAcumuladas || '(sem evidências registradas)'}

AVALIAÇÃO PRIMÁRIA (a ser auditada):
${JSON.stringify(avaliacaoPrimaria, null, 2)}

AUDITE e retorne:
{
  "nota_auditoria": 0-100,
  "status": "aprovado|aprovado_com_ajustes|revisar",
  "erro_grave": false,
  "criterios": {
    "ancoragem_regua": 0-20,
    "coerencia_delta": 0-15,
    "qualidade_justificativa": 0-15,
    "triangulacao_com_acumulado": 0-20,
    "prudencia_metodologica": 0-15,
    "coerencia_devolutiva": 0-15
  },
  "ajustes_sugeridos": [
    { "descritor": "nome", "nota_pos_sugerida": 1.0-4.0, "motivo": "por que ajustar" }
  ],
  "ponto_mais_confiavel": "qual descritor/aspecto está mais bem sustentado",
  "ponto_mais_fragil": "qual descritor/aspecto está mais fraco",
  "alertas": ["observações críticas, ou [] se aprovado"],
  "resumo_auditoria": "síntese objetiva da auditoria em 2-3 frases"
}

CLASSIFICAÇÃO:
- 90+ com ajustes vazio = aprovado
- 80-89 ou com ajustes = aprovado_com_ajustes
- <80 = revisar`;

  return { system, user };
}

export function validateEvolutionScenarioCheck(parsed: any): any {
  const nota = typeof parsed.nota_auditoria === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.nota_auditoria))) : 50;
  const statuses = ['aprovado', 'aprovado_com_ajustes', 'revisar'];
  const status = statuses.includes(parsed.status) ? parsed.status : (nota >= 90 ? 'aprovado' : nota >= 80 ? 'aprovado_com_ajustes' : 'revisar');
  const criterios = parsed.criterios && typeof parsed.criterios === 'object' ? {
    ancoragem_regua: Math.min(20, Math.max(0, parsed.criterios.ancoragem_regua || 0)),
    coerencia_delta: Math.min(15, Math.max(0, parsed.criterios.coerencia_delta || 0)),
    qualidade_justificativa: Math.min(15, Math.max(0, parsed.criterios.qualidade_justificativa || 0)),
    triangulacao_com_acumulado: Math.min(20, Math.max(0, parsed.criterios.triangulacao_com_acumulado || 0)),
    prudencia_metodologica: Math.min(15, Math.max(0, parsed.criterios.prudencia_metodologica || 0)),
    coerencia_devolutiva: Math.min(15, Math.max(0, parsed.criterios.coerencia_devolutiva || 0)),
  } : null;
  return {
    nota_auditoria: nota,
    status,
    erro_grave: !!parsed.erro_grave,
    criterios,
    ajustes_sugeridos: Array.isArray(parsed.ajustes_sugeridos) ? parsed.ajustes_sugeridos : [],
    ponto_mais_confiavel: parsed.ponto_mais_confiavel || '',
    ponto_mais_fragil: parsed.ponto_mais_fragil || '',
    alertas: Array.isArray(parsed.alertas) ? parsed.alertas : [],
    resumo_auditoria: parsed.resumo_auditoria || '',
  };
}
