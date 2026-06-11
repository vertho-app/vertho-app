/**
 * Roteiro da DEVOLUTIVA EM VOZ do mapeamento comportamental.
 *
 * Gera uma narração curta (~3-4 min) em 1ª pessoa do mentor (BETO) falando
 * diretamente com o colaborador sobre seu perfil — acolhedora, prudente e
 * NÃO-determinista. Ancora no mesmo material do Relatório Comportamental
 * (report_texts) para falar a mesma língua do PDF.
 *
 * Saída no formato esperado por extractNarration (bloco NARRAÇÃO TEXTO LIMPO).
 */

interface CargoInfo {
  nome?: string | null;
  area_depto?: string | null;
  descricao?: string | null;
  principais_entregas?: string | null;
  stakeholders?: string | null;
  decisoes_recorrentes?: string | null;
  tensoes_comuns?: string | null;
  contexto_cultural?: string | null;
  eh_lideranca?: boolean | null;
}

interface DevolutivaParams {
  primeiroNome: string;
  arquetipo: { nome: string; desc: string };
  raw: any;    // mapSupabaseToCISRawData
  texts: any;  // report_texts (cache do relatório)
  cargo?: CargoInfo | null;
  empresaNome?: string | null;
}

function topNomes(arr: any[], n = 3): string {
  if (!Array.isArray(arr)) return '';
  return arr.map((x) => x?.competencia).filter(Boolean).slice(0, n).join(', ');
}

function blocoCargo(cargo?: CargoInfo | null, empresaNome?: string | null): string {
  if (!cargo && !empresaNome) return '';
  const linhas = [
    empresaNome ? `Instituição: ${empresaNome}` : '',
    cargo?.nome ? `Cargo: ${cargo.nome}${cargo.area_depto ? ` (${cargo.area_depto})` : ''}${cargo.eh_lideranca ? ' — posição de liderança' : ''}` : '',
    cargo?.descricao ? `Descrição do cargo: ${cargo.descricao}` : '',
    cargo?.principais_entregas ? `Principais entregas: ${cargo.principais_entregas}` : '',
    cargo?.stakeholders ? `Stakeholders: ${cargo.stakeholders}` : '',
    cargo?.decisoes_recorrentes ? `Decisões recorrentes: ${cargo.decisoes_recorrentes}` : '',
    cargo?.tensoes_comuns ? `Tensões comuns do cargo: ${cargo.tensoes_comuns}` : '',
    cargo?.contexto_cultural ? `Contexto cultural: ${cargo.contexto_cultural}` : '',
  ].filter(Boolean);
  if (!linhas.length) return '';
  return `\nCONTEXTO DA FUNÇÃO (use como CENÁRIO dos exemplos — não invente atribuições além destas):\n${linhas.join('\n')}`;
}

export function promptDevolutivaComportamental({ primeiroNome, arquetipo, raw, texts, cargo, empresaNome }: DevolutivaParams) {
  const d = raw?.disc_natural || {};
  const a = raw?.disc_adaptado || {};
  const tp = raw?.tipo_psicologico || {};
  const forcas = topNomes(texts?.top5_forcas, 3);
  const desenvolver = topNomes(texts?.top5_desenvolver, 2);

  const system = `Você é o BETO, mentor de desenvolvimento da Vertho. Sua tarefa é escrever o ROTEIRO de uma DEVOLUTIVA EM VOZ (áudio) do mapeamento comportamental, como se você estivesse falando diretamente com ${primeiroNome}.

PRINCÍPIOS INEGOCIÁVEIS:
- DISC e tipo psicológico são TENDÊNCIA, não sentença. Use "você tende a", "costuma", nunca "você é" ou "sempre".
- Tom acolhedor, humano, próximo — uma conversa, não um laudo. Fale na 1ª pessoa, dirigindo-se a ${primeiroNome} pelo nome (com moderação).
- Forças primeiro; pontos a desenvolver como OPORTUNIDADE, nunca defeito.
- ANCORE no CONTEXTO DA FUNÇÃO de ${primeiroNome} (cargo, entregas, stakeholders, decisões, tensões) e na instituição: dê exemplos concretos do dia a dia daquele cargo. Use o cargo como CENÁRIO de aplicação do perfil — NÃO invente atribuições além das informadas, e NÃO confunda perfil comportamental com competência ou desempenho (o cargo é só contexto, não um julgamento de quão bem ela faz o trabalho).
- Linguagem simples, sem jargão técnico nem números/scores. Não cite "DISC", "D/I/S/C" nem percentuais — traduza em comportamento.
- ~500-600 palavras (3-4 min de áudio). Prosa corrida, frases curtas, ritmo de fala.
- Feche convidando a pessoa a continuar a conversa com você (o Beto) quando quiser.

FORMATO DE SAÍDA (EXATO):
TÍTULO: Sua devolutiva comportamental

=== NARRAÇÃO (TEXTO LIMPO) ===
<a narração corrida, pronta para ser lida em voz alta, sem marcadores, sem títulos de seção, sem listas>`;

  const user = `Dados do mapeamento de ${primeiroNome} (use como base; NÃO leia números nem rótulos técnicos — traduza em comportamento):

- Arquétipo: ${arquetipo.nome} — ${arquetipo.desc}
- Perfil dominante: ${raw?.perfil_dominante || '—'}
- Tendência natural (como é à vontade): D=${Math.round(d.D || 0)}, I=${Math.round(d.I || 0)}, S=${Math.round(d.S || 0)}, C=${Math.round(d.C || 0)}
- Tendência adaptada (como se molda no trabalho): D=${Math.round(a.D || 0)}, I=${Math.round(a.I || 0)}, S=${Math.round(a.S || 0)}, C=${Math.round(a.C || 0)}
- Tipo psicológico: ${tp.tipo || '—'}
${texts?.sintese_perfil ? `\nSíntese do relatório: ${texts.sintese_perfil}` : ''}
${forcas ? `\nForças naturais: ${forcas}` : ''}
${desenvolver ? `\nA desenvolver: ${desenvolver}` : ''}
${texts?.lideranca_sintese ? `\nEstilo de liderança: ${texts.lideranca_sintese}` : ''}
${blocoCargo(cargo, empresaNome)}

Escreva o roteiro da devolutiva em voz seguindo o formato e os princípios.`;

  return { system, user };
}
