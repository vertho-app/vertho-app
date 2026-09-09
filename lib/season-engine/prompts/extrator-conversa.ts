/**
 * O EXTRATOR de conversa — o instrumento que lê a transcrição de uma semana de
 * aplicação e devolve uma nota por descritor. É ele que produz o `nota_pos` do
 * fechamento, e portanto é dele que sai o delta que o painel de evolução mostra.
 *
 * POR QUE ISTO SAIU DA ROTA (09/09/2026): para medir o RUÍDO do instrumento é
 * preciso repontuar a mesma conversa várias vezes e comparar as notas. Copiar o
 * texto do prompt para dentro de um script de medição mediria uma CÓPIA: o
 * número sairia bonito e não descreveria o avaliador que roda em produção — e
 * na primeira edição da rota as duas pontas divergiriam em silêncio, com a
 * medição continuando a reportar a estabilidade da versão velha.
 *
 * O que vive aqui é o ramo `estiloAnalytic` (semanas de aplicação: `analytic`
 * sobre cenário escrito e `missao_feedback` sobre relato prático), que é o
 * único que emite NOTA. O ramo socratic segue na rota: ele não pontua, então
 * não entra na medição de ruído, e mover código sem consumidor é como um gêmeo
 * nasce.
 *
 * Consumidores: `app/api/temporada/reflection/route.ts` (produção) e
 * `scripts/_medir-ruido-extrator.ts` (medição). Guard: `tests/unit/extrator-conversa.test.ts`.
 */

/**
 * O RUÍDO DESTE INSTRUMENTO, medido — não estimado.
 *
 * Mora aqui, e não no relatório que o cita, porque é uma propriedade do
 * extrator: se o prompt mudar, este número deixa de valer e a medição tem que
 * ser refeita (`scripts/_medir-ruido-extrator.ts`). Um número desses copiado
 * para dentro de um PDF viraria uma afirmação órfã, que continua no papel depois
 * de deixar de ser verdade.
 *
 * Método: 11 conversas reais de semana de aplicação repontuadas 5 vezes cada com
 * este prompt, este validador e o `DEFAULT_MODEL` da rota. Detalhe em
 * `docs/CUSTO-QUALIDADE.md` §09/09/2026.
 */
export const RUIDO_MEDIDO = {
  medidoEm: '09/09/2026',
  conversas: 11,
  pares: 57,
  repeticoes: 5,
  /** Desvio-padrão da nota de UM descritor ao reler a mesma conversa. */
  dpPorDescritor: 0.09,
  /** Desvio-padrão da MÉDIA da conversa — é o que o relatório agrega. */
  dpPorConversa: 0.07,
  /** Maior diferença que a releitura produziu sozinha, na média por conversa. */
  amplitudeMaximaPorConversa: 0.33,
  /** Pares cujo NÍVEL (N1–N4) mudou entre as releituras. */
  paresComNivelInstavel: 18,
} as const;

/** Como a rota serializa o histórico antes de mandar para a IA. */
export function montarTranscript(historico: { role: string; content: string }[]): string {
  return historico.map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content}`).join('\n\n');
}

export const EXTRATOR_CORE_SYSTEM = `Você é um extrator de dados estruturados da Vertho.

ATENÇÃO:
Você NÃO está avaliando formalmente.
Você NÃO está aconselhando.
Você NÃO está completando lacunas.
Você NÃO está escrevendo feedback bonito.
Você está EXTRAINDO o que a conversa realmente sustenta.

PRINCÍPIOS INEGOCIÁVEIS:
1. Extraia somente o que foi efetivamente dito ou claramente sustentado.
2. Não invente comportamento, avanço, execução ou insight.
3. Diferencie fala articulada de evidência concreta — fala bonita não é prova.
4. Exemplo concreto com ação e consequência vale mais do que opinião ou intenção.
5. Se faltar base, reduza confiança ou força da evidência em vez de inventar.
6. Intenção declarada sem execução relatada = evidência fraca.
7. Autocrítica verbal sem mudança prática = sinal, não prova.
8. Toda leitura relevante deve ter trecho ou paráfrase de sustentação.
9. Se um descritor não tiver base suficiente na conversa, isso deve ser explicitado.
10. O output deve ser útil para a etapa seguinte (merge, avaliação, fusão, relatório).

FORÇA DA EVIDÊNCIA:
- fraca: abstrata, genérica, teórica, sem ação observável
- moderada: concreta mas incompleta, sem consequência clara ou sem repetição
- forte: concreta + coerente + com ação, critério e/ou consequência percebida

RETORNE APENAS JSON VÁLIDO, sem markdown, sem backticks, sem texto antes ou depois.`;

export function parseExtracaoResponse(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
}

export function validateExtracaoAnalytic(parsed: any, descritores: string[]): any {
  if (!Array.isArray(parsed.avaliacao_por_descritor)) parsed.avaliacao_por_descritor = [];
  parsed.avaliacao_por_descritor = parsed.avaliacao_por_descritor.map((d: any) => {
    const nota = typeof d.nota === 'number' ? Math.max(1, Math.min(4, Math.round(d.nota * 10) / 10)) : 2.0;
    const forcas = ['fraca', 'moderada', 'forte'];
    return {
      descritor: d.descritor || '',
      nota,
      forca_evidencia: forcas.includes(d.forca_evidencia) ? d.forca_evidencia : 'fraca',
      observacao: d.observacao || '',
      trecho_sustentador: d.trecho_sustentador || '',
      limite: d.limite || '',
    };
  });
  if (!parsed.sintese_bloco || typeof parsed.sintese_bloco !== 'string') parsed.sintese_bloco = '';
  if (!Array.isArray(parsed.alertas_metodologicos)) parsed.alertas_metodologicos = [];
  return parsed;
}

/**
 * O texto que vai como `user` para o extrator nas semanas de aplicação.
 * `descritores` é `semanaPlan.descritores_cobertos` — a lista que a semana
 * cobre, e o mesmo array que `validateExtracaoAnalytic` recebe depois.
 */
export function montarUserExtracaoAnalytic({ transcript, descritores, tipoConversa }: {
  transcript: string;
  descritores: string[];
  tipoConversa: 'analytic' | 'missao_feedback';
}): string {
  const modoLabel = tipoConversa === 'missao_feedback' ? 'missao_feedback (evidência prática real)' : 'analytic (resposta a cenário escrito)';
  const user = `MODO: ${modoLabel}
Foco: leitura analítica por descritor com nota prudente e força de evidência.

CONVERSA:
${transcript}

DESCRITORES A AVALIAR: ${descritores.join(', ')}

EXTRAIA o JSON abaixo, preenchendo com base EXCLUSIVA na conversa:
{
  "avaliacao_por_descritor": [
${descritores.map(d => `    {
      "descritor": "${d}",
      "nota": 1.0-4.0,
      "forca_evidencia": "fraca|moderada|forte",
      "observacao": "síntese curta e fiel",
      "trecho_sustentador": "trecho curto ou paráfrase fiel do que sustenta a nota",
      "limite": "o que faltou para sustentar melhor"
    }`).join(',\n')}
  ],
  "sintese_bloco": "síntese curta e útil do progresso geral",
  "alertas_metodologicos": ["alerta se houver"]
}

REGRAS:
- nota entre 1.0 e 4.0 — não infle sem sustentação
- forca_evidencia: "forte" = ação concreta + consequência percebida; "moderada" = relato com algum detalhe; "fraca" = menção vaga ou ausente
- trecho_sustentador: cite ou parafraseie trecho literal da conversa
- limite: explicite o que faltou — se não faltou nada, pode ficar vazio
- alertas_metodologicos: liste se houver risco de viés, falta de base ou inflação
- NÃO preencha todos os descritores como se todos tivessem aparecido bem
- NÃO transforme intenção em evidência de execução`;
  return user;
}
