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
  /** Semana do fechamento (regular=14, piloto=3). Default 14 (byte-idêntico). */
  semanaFinal?: number;
  /** Janela de evidências em semanas (regular=13, piloto=2). Default 13. */
  semanasEvidencia?: number;
  /** Nota de contexto do programa (ex.: aviso do piloto). Vazio no regular. */
  notaPrograma?: string;
  /**
   * Extração da arguição (já mascarada). Presente = a nota foi ajustada pelo
   * código depois do scorer, e o auditor precisa saber disso. Ausente = prompt
   * byte a byte o de antes (golden em tests/unit/fechamento).
   */
  arguicao?: {
    evidencias_por_descritor?: Array<{ descritor?: string; sustentou?: string; forca?: string; citacao?: string }>;
  } | null;
}

/**
 * 🔴 Por que o auditor precisa saber do ajuste (18/09/2026). A fusão soma até
 * ±0,5 à nota do scorer DEPOIS que ele escreveu a justificativa. Sem saber disso,
 * o auditor lia a diferença como contradição. `Medido:` Ibipeba, 11 de 11
 * fechamentos com erro grave; das 63 sugestões, 55 caíam em descritor ajustado
 * pela arguição e 33 pediam exatamente a nota de antes do ajuste.
 */
function blocoAjusteDaArguicao(arguicao: PromptEvolutionScenarioCheckParams['arguicao']): { system: string; user: string } {
  const evs = Array.isArray(arguicao?.evidencias_por_descritor) ? arguicao!.evidencias_por_descritor! : [];
  if (!evs.length) return { system: '', user: '' };
  const system = `AJUSTE DA DEFESA ORAL (regra de código, não da avaliação):
Depois da avaliação do cenário, a pessoa defendeu a resposta numa conversa (a arguição). O código ajustou a nota de cada descritor pelo que a defesa sustentou, com uma tabela fixa: "aprofundou" soma 0,2, 0,35 ou 0,5 (força fraca, moderada ou forte); "fragilizou" subtrai os mesmos valores; "confirmou" e "sem_sinal" não mudam a nota. O ajuste nunca passa de 0,5.
Em cada descritor da avaliação:
- nota_base_cenario é a nota ANTES do ajuste, e é ela que a justificativa sustenta;
- ajuste_arguicao, sustentacao_arguicao e forca_arguicao registram o ajuste e o motivo;
- nota_pos é a nota final (base mais o ajuste, entre 1 e 4).
Como auditar com o ajuste:
1. Compare a justificativa com a nota_base_cenario (o texto da justificativa pode chamá-la de "nota_pos": é a nota antes do ajuste). A diferença até a nota_pos é o ajuste: não é contradição nem erro grave.
2. O ajuste é regra fixa. Não sugira desfazê-lo. Se a classificação da defesa não se apoiar na citação, diga isso em alertas.
3. Em ajustes_sugeridos, nota_pos_sugerida é a nota ANTES do ajuste; o código reaplica o ajuste da defesa sobre ela.
4. A devolutiva (resumo_avaliacao) deve conversar com as notas FINAIS (nota_pos).

`;
  const linhas = evs.map((e) => `- ${e?.descritor || '(sem descritor)'}: ${e?.sustentou || 'sem_sinal'} (${e?.forca || 'sem força'})${e?.citacao ? `: "${e.citacao}"` : ''}`);
  const user = `DEFESA ORAL (o que a arguição sustentou, por descritor):
${linhas.join('\n')}

`;
  return { system, user };
}

export function promptEvolutionScenarioCheck({ competencia, descritores, cenario, resposta, avaliacaoPrimaria, evidenciasAcumuladas, semanaFinal = 14, semanasEvidencia = 13, notaPrograma = '', arguicao = null }: PromptEvolutionScenarioCheckParams) {
  const ajuste = blocoAjusteDaArguicao(arguicao);
  const system = `Você é um auditor de qualidade da avaliação final da semana ${semanaFinal} da Vertho.

Sua tarefa é auditar se a avaliação final triangulada por descritor está metodologicamente DEFENSÁVEL.
${notaPrograma ? `\nCONTEXTO DO PROGRAMA: ${notaPrograma}\nCRITÉRIO EXTRA: sinalize como fragilidade qualquer trecho da avaliação que trate a janela curta como evolução/regressão da pessoa ou mencione duração diferente de ${semanasEvidencia} semanas.\n` : ''}
ATENÇÃO:
Você NÃO está refazendo toda a avaliação do zero.
Você está verificando se a leitura final se sustenta com base em:
- régua
- nota pré
- avaliação acumulada
- resposta ao cenário da semana ${semanaFinal}
- evidências das ${semanasEvidencia} semanas
- consistência interna da própria triangulação

OBJETIVO CENTRAL:
Validar se a avaliação final da semana ${semanaFinal} está sólida o suficiente para servir como leitura definitiva da jornada e alimentar o Evolution Report.

PRINCÍPIOS INEGOCIÁVEIS:
1. A auditoria deve proteger a coerência metodológica da Vertho.
2. A sem ${semanaFinal} é TRIANGULAÇÃO, não correção de prova.
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

${ajuste.system}AUDITE EM 6 CRITÉRIOS (total 100):

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
   - nota_pos está coerente com o histórico das ${semanasEvidencia} semanas?
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

EVIDÊNCIAS ACUMULADAS NAS ${semanasEvidencia} SEMANAS:
${evidenciasAcumuladas || '(sem evidências registradas)'}

${ajuste.user}AVALIAÇÃO PRIMÁRIA (a ser auditada):
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
