/**
 * Prompts do Cenário B (gerador e auditor), montados com o MESMO contexto do A.
 *
 * Até 18/09/2026 o gerador do B recebia só o NOME do cargo, e o bloco rotulado
 * "CONTEXTO PPP / DOSSIÊ" levava apenas a lista de valores; não havia regra de
 * anonimização, e o auditor via um PPP que o gerador não via. O B é o segundo
 * instrumento da mesma competência, comparado com o A no fechamento: escrito com
 * menos contexto do que o A, ele media outra coisa.
 *
 * Agora os dois prompts usam os blocos extraídos do A (`lib/ia3-cenarios.ts`):
 * empresa, cargo com o contexto organizacional, competência, régua N1 a N4,
 * valores, perfil ideal e PPP de rede. Módulo puro (fora do `'use server'`) para
 * ser testável; a action só carrega o contexto e chama a IA.
 */
import {
  REGRA_ANONIMIZACAO_INSTITUICOES,
  blocoEmpresaIA3,
  blocoCargoIA3,
  blocoContextoOrganizacionalIA3,
  blocoCompetenciaIA3,
  blocoDescritoresIA3,
  blocoValoresIA3,
  blocoPerfilIdealIA3,
  blocoPppIA3,
} from '@/lib/ia3-cenarios';
import {
  type VersaoCenarios, blocoFichaCenarioV2, CONFERENCIA_FATOS_E_PAPEL_V2, LIMITES_V2,
} from '@/lib/ia3-cenarios-v2';

/** O contexto de uma célula (competência × cargo), no formato de `montarContextoIA3`. */
export interface ContextoCenarioB {
  empresa: { nome: string; segmento?: string | null };
  cargoNome: string;
  cargoDetalhe: any;
  comp: any;
  descritores: any[];
  valores: string[];
  contextoPPP: string;
  gabCIS: any;
  /**
   * Regras do Cenário B (`lib/ia3-cenarios-v2.ts`). Ausente = v1, byte a byte o de sempre.
   * Na GERAÇÃO vale a da empresa; no CHECK, a da linha auditada (`versaoDoCenario`).
   */
  versao?: VersaoCenarios;
  /** Linhas da ficha INTEIRA do cargo (v2). */
  fichaLinhas?: string[];
}

export const SYSTEM_CENARIO_B = `Você é um especialista em avaliação de competências comportamentais e design de instrumentos diagnósticos da Vertho.

═══ TAREFA ═══
Criar um CENÁRIO B complementar ao Cenário A já existente.
O Cenário B NÃO é "outro cenário". É um SEGUNDO INSTRUMENTO DE MEDIÇÃO
da mesma competência, útil para triangulação no fechamento da jornada.

═══ REGRAS INEGOCIÁVEIS ═══

1. MESMA COMPETÊNCIA, OUTRA SITUAÇÃO-GATILHO
   A diferença deve ser ESTRUTURAL, não cosmética (trocar nomes não conta).

2. COMPLEMENTARIDADE
   Observar uma FACETA COMPLEMENTAR da competência.
   Se o Cenário A testava faceta X, privilegiar faceta Y.
   Não repetir o mesmo núcleo de dilema com roupas novas.

3. UTILIDADE PARA TRIANGULAÇÃO
   Reduzir risco de resposta ensaiada. Gerar leitura comparável mas não redundante.

4. REALISMO CONTEXTUAL
   Plausível pro cargo. Linguagem real. Máx 2 stakeholders nomeados.
   Nomes brasileiros. Sem teatralidade.
   Situe o caso nas entregas, decisões e tensões do CONTEXTO ORGANIZACIONAL do cargo,
   quando houver. Não invente atribuições nem autoridade além delas.

5. DILEMA / TRADE-OFF
   Se pode responder bem sem escolher nada → cenário FALHOU.

6. PODER DISCRIMINANTE
   N1 visivelmente diferente de N3. Resposta genérica deve FALHAR.

7. ESTRUTURA DAS 4 PERGUNTAS
   P1 = situação / leitura do caso
   P2 = ação / decisão prática
   P3 = raciocínio / critério de escolha
   P4 = autossensibilidade / consciência de limite ou risco

8. DILEMA ÉTICO EMBUTIDO
   Tensão ética sutil e natural, não didática, ligada a um dos VALORES ORGANIZACIONAIS.

9. ${REGRA_ANONIMIZACAO_INSTITUICOES}

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "titulo": "título curto",
  "descricao": "texto do cenário (80-150 palavras)",
  "faceta_avaliada": "faceta principal observada",
  "facetas_secundarias": ["faceta 2", "faceta 3"],
  "diferenca_estrutural_vs_cenario_a": "o que muda de verdade vs Cenário A (1 frase)",
  "por_que_essa_variacao_importa": "por que útil para triangulação (1 frase)",
  "tradeoff_testado": "qual escolha difícil está no centro",
  "armadilha_de_resposta_generica": "por que resposta vaga não resolve",
  "stakeholders_centrais": ["Nome1", "Nome2"],
  "p1": "pergunta de situação",
  "p2": "pergunta de ação",
  "p3": "pergunta de raciocínio",
  "p4": "pergunta de autossensibilidade",
  "objetivo_diagnostico": {
    "p1": "o que P1 quer revelar",
    "p2": "o que P2 quer revelar",
    "p3": "o que P3 quer revelar",
    "p4": "o que P4 quer revelar"
  },
  "referencia_avaliacao": {
    "nivel_1": "como responderia N1",
    "nivel_2": "como responderia N2",
    "nivel_3": "como responderia N3",
    "nivel_4": "como responderia N4"
  },
  "dilema_etico_embutido": {
    "valor_testado": "valor em tensão",
    "caminho_facil": "solução mais fácil",
    "caminho_etico": "solução alinhada ao valor"
  },
  "confianca_cenario": 0.85,
  "riscos_do_cenario": ["risco 1", "risco 2"]
}`;

/**
 * Gerador do Cenário B, regras v2 (`lib/ia3-cenarios-v2.ts`): fato técnico só com fonte
 * na ficha, papel do cargo, cliente interno, uma situação e um pedido por pergunta. Em
 * Ibipeba, o `p2` do B juntava 5 ou 6 exigências numa pergunta só (17/09/2026).
 */
export const SYSTEM_CENARIO_B_V2 = `Você é um especialista em avaliação de competências comportamentais e design de instrumentos diagnósticos da Vertho.

═══ TAREFA ═══
Criar um CENÁRIO B complementar ao Cenário A já existente.
O Cenário B NÃO é "outro cenário". É um SEGUNDO INSTRUMENTO DE MEDIÇÃO
da mesma competência, útil para triangulação no fechamento da jornada.
E a pessoa que responde precisa RECONHECER a situação como parte do trabalho dela.

═══ REGRAS INEGOCIÁVEIS ═══

1. MESMA COMPETÊNCIA, OUTRA SITUAÇÃO-GATILHO
   A diferença deve ser ESTRUTURAL, não cosmética (trocar nomes não conta).

2. COMPLEMENTARIDADE
   Observar uma FACETA COMPLEMENTAR da competência.
   Se o Cenário A testava faceta X, privilegiar faceta Y.
   Não repetir o mesmo núcleo de dilema com roupas novas.

3. UTILIDADE PARA TRIANGULAÇÃO
   Reduzir risco de resposta ensaiada. Gerar leitura comparável mas não redundante.

4. REALISMO ANCORADO NA FICHA
   - UMA situação do dia a dia deste cargo, pela FICHA DO CARGO. Parta do CASO REAL DE
     PARTIDA, quando houver: troque nomes de pessoas e não acrescente fatos.
   - Fato TÉCNICO (equipamento, peça, sistema, procedimento, regra de fornecedor, número de
     unidades ou de equipamentos, especificação) só entra se estiver na ficha, nas fronteiras,
     no caso real ou no contexto da empresa. Sem fonte, use um termo genérico ("a peça",
     "o equipamento", "o sistema").
   - Detalhe da situação (horário, prazo, número de pessoas) pode ser criado, desde que
     plausível e secundário.
   - Máx 2 stakeholders nomeados. Nomes brasileiros. Sem teatralidade.

5. PAPEL DO CARGO
   - Não invente atribuições nem autoridade além das que a ficha descreve.
   - Quem não está em Stakeholders não fala diretamente com o avaliado.
   - O que o cargo pede a terceiros aparece como acionar ou coordenar, nunca como executar.
   - Se a competência fala de cliente e o cargo não atende cliente externo, trabalhe o
     cliente interno (quem recebe o trabalho do avaliado) ou o impacto que chega por quem
     atende o cliente.

6. DILEMA / TRADE-OFF
   Se pode responder bem sem escolher nada, o cenário FALHOU. O trade-off nasce da
   própria situação, sem cadeia de coincidências (várias falhas e eventos ao mesmo tempo).

7. PODER DISCRIMINANTE
   N1 visivelmente diferente de N3. Resposta genérica deve FALHAR.

8. ESTRUTURA DAS 4 PERGUNTAS
   P1 = situação / leitura do caso
   P2 = ação / decisão prática
   P3 = raciocínio / critério de escolha
   P4 = autossensibilidade / consciência de limite ou risco
   Cada pergunta faz UM pedido só (uma pergunta, não uma lista de exigências) e tem no
   máximo ${LIMITES_V2.maxPergunta} caracteres.

9. DILEMA ÉTICO EMBUTIDO
   Tensão ética sutil e natural, não didática, ligada a um dos VALORES ORGANIZACIONAIS.

10. LUGAR
   Fale com a pessoa em segunda pessoa, no local de trabalho dela ("na sua unidade",
   "na escola"). Não nomeie a empresa, as unidades, a escola, a rede ou a cidade, e não
   invente nome de instituição. Personagens (pessoas) seguem com nomes próprios fictícios
   brasileiros.

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "titulo": "título curto",
  "descricao": "texto do cenário (uma situação só, máx ${LIMITES_V2.maxContexto} caracteres)",
  "faceta_avaliada": "faceta principal observada",
  "facetas_secundarias": ["faceta 2", "faceta 3"],
  "diferenca_estrutural_vs_cenario_a": "o que muda de verdade vs Cenário A (1 frase)",
  "por_que_essa_variacao_importa": "por que útil para triangulação (1 frase)",
  "tradeoff_testado": "qual escolha difícil está no centro",
  "armadilha_de_resposta_generica": "por que resposta vaga não resolve",
  "stakeholders_centrais": ["Nome1", "Nome2"],
  "p1": "pergunta de situação (um pedido)",
  "p2": "pergunta de ação (um pedido)",
  "p3": "pergunta de raciocínio (um pedido)",
  "p4": "pergunta de autossensibilidade (um pedido)",
  "objetivo_diagnostico": {
    "p1": "o que P1 quer revelar",
    "p2": "o que P2 quer revelar",
    "p3": "o que P3 quer revelar",
    "p4": "o que P4 quer revelar"
  },
  "referencia_avaliacao": {
    "nivel_1": "como responderia N1",
    "nivel_2": "como responderia N2",
    "nivel_3": "como responderia N3",
    "nivel_4": "como responderia N4"
  },
  "dilema_etico_embutido": {
    "valor_testado": "valor em tensão",
    "caminho_facil": "solução mais fácil",
    "caminho_etico": "solução alinhada ao valor"
  },
  "confianca_cenario": 0.85,
  "riscos_do_cenario": ["risco 1", "risco 2"]
}`;

export const SYSTEM_CHECK_CENARIO_B = `Você é o auditor de qualidade do Cenário B da Vertho.

═══ TAREFA ═══
Auditar se o Cenário B funciona como INSTRUMENTO COMPLEMENTAR real ao Cenário A,
útil para triangulação no fechamento da jornada.

Um bom Cenário B não é apenas "plausível". Ele precisa ser metodologicamente
útil como SEGUNDO instrumento de medição da mesma competência.

═══ 8 DIMENSÕES (total 100 pontos) ═══

1. ADERÊNCIA À COMPETÊNCIA (15pts)
   O cenário avalia a competência indicada? A faceta faz sentido?

2. DIFERENÇA ESTRUTURAL VS CENÁRIO A (15pts)
   A diferença é REAL e metodológica? Ou apenas cosmética (nomes/contexto trocados)?

3. COMPLEMENTARIDADE (10pts)
   Observa faceta complementar relevante? Evita repetir núcleo de dilema do A?

4. REALISMO CONTEXTUAL (10pts)
   Plausível pro cargo, conferido contra o CONTEXTO ORGANIZACIONAL informado?
   Sem caricatura? Máx 2 stakeholders? Instituição anonimizada?

5. CLAREZA DO TRADE-OFF (15pts)
   Existe escolha difícil real? Se pode responder bem sem escolher → penalize forte.

6. PODER DISCRIMINANTE (15pts)
   Diferencia N1-N4? Resposta vaga/genérica FALHA?

7. ADEQUAÇÃO DAS PERGUNTAS AO FECHAMENTO (10pts)
   P1=situação? P2=ação? P3=raciocínio? P4=autossensibilidade?

8. UTILIDADE PARA TRIANGULAÇÃO (10pts)
   Leitura útil quando combinado com a acumulada e as evidências das semanas de conteúdo?
   Reduz risco de resposta ensaiada?

═══ ERROS GRAVES (nota máxima 60) ═══
- Cenário B repete estruturalmente o A
- Faceta principal é a mesma do A sem justificativa
- Trade-off inexistente ou muito fraco
- Resposta genérica suficiente pra "ir bem"
- Perguntas fora da lógica situação/ação/raciocínio/autossensibilidade
- Cenário pouco utilizável pra triangulação
- Competência avaliada não é a indicada
- Cenário teatral / sofisticado demais
- Nome real de escola, rede, secretaria ou cidade no texto do cenário

═══ CLASSIFICAÇÃO ═══
90-100 = aprovado | 80-89 = aprovado_com_ressalvas | 0-79 = revisar

═══ FORMATO JSON ═══

{
  "nota": 85,
  "status": "aprovado_com_ressalvas",
  "erro_grave": false,
  "dimensoes": {
    "aderencia_competencia": 13,
    "diferenca_estrutural_vs_a": 12,
    "complementaridade": 8,
    "realismo_contextual": 9,
    "clareza_tradeoff": 13,
    "poder_discriminante": 13,
    "adequacao_sem14": 8,
    "utilidade_triangulacao": 9
  },
  "ponto_mais_forte": "...",
  "ponto_mais_fraco": "...",
  "problema_principal_vs_cenario_a": "em que o B falha como complemento do A",
  "riscos_de_triangulacao": ["risco 1"],
  "perguntas_com_risco": [{"numero": 2, "problema": "...", "correcao_recomendada": "..."}],
  "justificativa": "síntese objetiva (2-3 frases)",
  "sugestao": "principal ajuste recomendado",
  "alertas": []
}

REGRA: Se cenário for bem escrito mas metodologicamente fraco como
COMPLEMENTO do A, PENALIZE. Prefira rigor a elegância.`;

/** Auditor do Cenário B, régua v2: a de sempre mais a conferência de fatos e de papel. */
export const SYSTEM_CHECK_CENARIO_B_V2 = SYSTEM_CHECK_CENARIO_B + CONFERENCIA_FATOS_E_PAPEL_V2;

/** O system do auditor na régua da versão. No check, a versão é a DA LINHA auditada. */
export function systemCheckCenarioB(versao: VersaoCenarios | undefined): string {
  return versao === 'v2' ? SYSTEM_CHECK_CENARIO_B_V2 : SYSTEM_CHECK_CENARIO_B;
}

/** Os blocos de contexto do A, na mesma ordem do prompt do A (v2: a ficha inteira no lugar do contexto organizacional). */
export function blocosDeContextoB(ctx: ContextoCenarioB): string[] {
  const blocos: string[] = [blocoEmpresaIA3(ctx.empresa), blocoCargoIA3(ctx.cargoNome)];
  if (ctx.versao === 'v2') {
    blocos.push(blocoFichaCenarioV2(ctx.fichaLinhas || []));
  } else {
    const organizacional = blocoContextoOrganizacionalIA3(ctx.cargoDetalhe || {});
    if (organizacional) blocos.push(organizacional);
  }
  blocos.push(blocoCompetenciaIA3(ctx.comp));
  const regua = blocoDescritoresIA3(ctx.descritores || []);
  if (regua) blocos.push(regua);
  blocos.push(blocoValoresIA3(ctx.valores || []));
  const perfil = blocoPerfilIdealIA3(ctx.gabCIS);
  if (perfil) blocos.push(perfil);
  const ppp = blocoPppIA3(ctx.contextoPPP || '');
  if (ppp) blocos.push(ppp);
  return blocos;
}

function alternativasDe(cen: any): any {
  const alt = typeof cen?.alternativas === 'string' ? JSON.parse(cen.alternativas) : cen?.alternativas;
  return alt && typeof alt === 'object' && !Array.isArray(alt) ? alt : {};
}

/** Bloco do Cenário A de referência, com a faceta e o trade-off quando o A os registrou. */
export function blocoCenarioA(cenA: any, rotulo: string): string {
  const altA = alternativasDe(cenA);
  let bloco = `═══ ${rotulo} ═══\nTítulo: ${cenA?.titulo || ''}\nDescrição: ${cenA?.descricao || ''}`;
  const faceta = altA.faceta_testada_principal || altA.faceta_avaliada;
  if (faceta) bloco += `\nFaceta avaliada: ${faceta}`;
  if (altA.tradeoff_testado) bloco += `\nTrade-off: ${altA.tradeoff_testado}`;
  return bloco;
}

export function buildCenarioBPrompts(ctx: ContextoCenarioB, cenA: any, feedbackExtra = ''): { system: string; user: string } {
  const blocos = blocosDeContextoB(ctx);
  blocos.push(blocoCenarioA(cenA, 'CENÁRIO A ORIGINAL (NÃO repetir: crie algo ESTRUTURALMENTE DIFERENTE)'));
  if (ctx.versao === 'v2') {
    blocos.push(`═══ INSTRUÇÃO ═══
Crie um Cenário B da mesma competência, mas com situação-gatilho ESTRUTURALMENTE diferente.
Não repita o mesmo núcleo do Cenário A com roupas novas.
O Cenário B deve ser útil para triangulação no fechamento da jornada.
Confira: todo fato técnico tem fonte na ficha? O cargo só faz o que a ficha diz? Cada pergunta faz um pedido só?
LUGAR: fale com a pessoa em segunda pessoa, no local de trabalho dela. Não nomeie a empresa, as unidades ou a cidade, e não invente nome de instituição.`);
  } else {
    blocos.push(`═══ INSTRUÇÃO ═══
Crie um Cenário B da mesma competência, mas com situação-gatilho ESTRUTURALMENTE diferente.
Não repita o mesmo núcleo do Cenário A com roupas novas.
O Cenário B deve ser útil para triangulação no fechamento da jornada.
ANONIMIZE: o nome da empresa, escola, rede ou cidade acima é só para CONTEXTO. No texto do cenário use nomes FICTÍCIOS de instituições, nunca os reais.`);
  }
  if (feedbackExtra) {
    blocos.push(`═══ FEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS) ═══\n${feedbackExtra}`);
  }
  return { system: ctx.versao === 'v2' ? SYSTEM_CENARIO_B_V2 : SYSTEM_CENARIO_B, user: blocos.join('\n\n') };
}

/** Prompt de usuário do auditor: a mesma lente do gerador + o A + o B + as perguntas. */
export function buildCheckCenarioBUser(ctx: ContextoCenarioB, cen: any, cenA?: any): string {
  const alt = alternativasDe(cen);
  const perguntas = [alt.p1 || cen?.p1, alt.p2 || cen?.p2, alt.p3 || cen?.p3, alt.p4 || cen?.p4].filter(Boolean);
  const perguntasTexto = perguntas.map((p: any, i: number) => {
    const texto = typeof p === 'string' ? p : p.texto || JSON.stringify(p);
    const obj = alt.objetivo_diagnostico?.[`p${i + 1}`] || '';
    return `P${i + 1}: ${texto}${obj ? `\n  Objetivo: ${obj}` : ''}`;
  }).join('\n\n');

  const blocos = blocosDeContextoB(ctx);
  if (cenA) blocos.push(blocoCenarioA(cenA, 'CENÁRIO A ORIGINAL (pra comparação)'));

  let cenB = `═══ CENÁRIO B GERADO ═══\nTítulo: ${cen?.titulo || ''}\nContexto: ${cen?.descricao || ''}`;
  if (alt.faceta_avaliada) cenB += `\nFaceta: ${alt.faceta_avaliada}`;
  if (Array.isArray(alt.facetas_secundarias) && alt.facetas_secundarias.length) cenB += `\nFacetas secundárias: ${alt.facetas_secundarias.join(', ')}`;
  if (alt.diferenca_estrutural_vs_cenario_a) cenB += `\nDiferença vs A: ${alt.diferenca_estrutural_vs_cenario_a}`;
  if (alt.por_que_essa_variacao_importa) cenB += `\nPor que importa: ${alt.por_que_essa_variacao_importa}`;
  if (alt.tradeoff_testado) cenB += `\nTrade-off: ${alt.tradeoff_testado}`;
  if (alt.armadilha_de_resposta_generica) cenB += `\nArmadilha anti-genérico: ${alt.armadilha_de_resposta_generica}`;
  if (typeof alt.confianca_cenario === 'number') cenB += `\nConfiança: ${alt.confianca_cenario}`;
  if (Array.isArray(alt.riscos_do_cenario) && alt.riscos_do_cenario.length) cenB += `\nRiscos: ${alt.riscos_do_cenario.join('; ')}`;
  blocos.push(cenB);

  blocos.push(`═══ PERGUNTAS ═══\n${perguntasTexto}`);
  blocos.push(`═══ INSTRUÇÃO ═══\nAudite se o Cenário B funciona como instrumento COMPLEMENTAR real ao Cenário A.\nSe bem escrito mas metodologicamente fraco como complemento, PENALIZE.`);
  return blocos.join('\n\n');
}
