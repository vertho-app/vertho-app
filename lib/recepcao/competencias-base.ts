// Biblioteca inicial de competências do treino de recepção (Catálogo Vertho), com o comportamento
// esperado em quatro níveis. Fonte única para o seed de `recepcao_competencias` e para as rubricas
// dos catálogos em código (que acrescentam o CRITÉRIO por caso). Os descritores foram redigidos a
// partir dos textos adequado/parcial/insuficiente das versões x.1 e aguardam revisão editorial.
export type NiveisComportamento = { n1: string; n2: string; n3: string; n4: string };
export type CompetenciaBase = { codigo: string; nome: string; descricao: string; niveis: NiveisComportamento };

export const competenciasBase: CompetenciaBase[] = [
 { codigo: 'acolhimento', nome: 'Acolhimento', descricao: 'Reconhece o que a pessoa trouxe e responde com respeito, sem defensividade.', niveis: {
  n1: 'Ignora ou minimiza o que a pessoa trouxe, ou responde de forma fria, defensiva ou culpabilizante.',
  n2: 'Cordial, mas reconhece o problema de forma genérica ("entendo", "sinto muito"), sem nomear o que aconteceu com a pessoa nem o impacto relatado.',
  n3: 'Nomeia a situação e o impacto relatado e mantém o tom respeitoso ao longo da conversa, inclusive diante de irritação.',
  n4: 'Reconhece situação e impacto sem defensividade nem promessa, e sustenta o acolhimento mesmo sob contestação repetida, sem confundir acolher com concordar.',
 } },
 { codigo: 'compreensao', nome: 'Compreensão da demanda', descricao: 'Identifica o que a pessoa realmente precisa e as restrições que importam para decidir.', niveis: {
  n1: 'Impõe uma alternativa ou uma resposta sem verificar o que a pessoa precisa, ou responde a uma demanda diferente da apresentada.',
  n2: 'Esclarece apenas uma restrição ou parte do pedido; deixa passar uma informação necessária para a decisão.',
  n3: 'Confirma a demanda e as restrições relevantes (horário, profissional, prazo, o que é pedido de fato) antes de propor.',
  n4: 'Distingue o que a pessoa pede do que ela precisa, confirma as restrições que decidem o caso e usa isso na proposta, sem perguntas desnecessárias.',
 } },
 { codigo: 'clareza', nome: 'Clareza e precisão', descricao: 'Explica alternativas e limites com informações corretas e sem ambiguidade.', niveis: {
  n1: 'Inventa horário, cobertura, desconto ou garantia, ou dá informação incompatível com a ficha.',
  n2: 'Informação correta, mas ambígua ou incompleta: a pessoa sai sem saber exatamente o que foi proposto ou o que acontece a seguir.',
  n3: 'Proposta precisa e compatível com a ficha, com data, hora, profissional, prazo ou canal quando cabem.',
  n4: 'Além de precisa, antecipa a dúvida seguinte (o que não é possível e por quê, o que acontece se recusar) sem prometer o que a ficha não autoriza.',
 } },
 { codigo: 'resolucao', nome: 'Resolução', descricao: 'Conduz o atendimento a uma saída possível: combinado, encaminhamento autorizado ou encerramento conforme o procedimento.', niveis: {
  n1: 'Encerra sem tratar a demanda nem oferecer saída disponível, ou confirma algo recusado ou não autorizado.',
  n2: 'Oferece uma saída viável, mas deixa o combinado ou a decisão da pessoa ambíguos (sem confirmar dados, responsável, prazo ou canal).',
  n3: 'Apresenta as saídas autorizadas, verifica a decisão e confirma o combinado com seus dados; se há recusa, reconhece a decisão e explica como retomar.',
  n4: 'Faz tudo isso e, diante de insistência após recusa, comunica o limite final e encerra com respeito, deixando a via de retorno, sem exigir acordo nem prometer exceção.',
 } },
 { codigo: 'procedimentos', nome: 'Procedimentos', descricao: 'Respeita o procedimento administrativo da ficha e usa só os dados necessários.', niveis: {
  n1: 'Contraria o procedimento: promete o que não está autorizado, coleta dado ou documento indevido, ou cria etapa que a ficha proíbe.',
  n2: 'Segue o procedimento, mas cria etapa desnecessária ou pede informação além do necessário, sem ocorrência crítica.',
  n3: 'Preserva a decisão da pessoa, usa só os dados necessários e segue o procedimento previsto.',
  n4: 'Segue o procedimento com naturalidade e explica o porquê do limite quando ele aparece, sem transformar a regra em barreira nem em desculpa.',
 } },
 { codigo: 'conducao_conflito', nome: 'Condução sob pressão', descricao: 'Responde à objeção concreta e sustenta limites sem confronto, submissão ou promessas indevidas.', niveis: {
  n1: 'Ignora a pressão, confronta ou culpa a pessoa, cede a exigência não autorizada, ou repete tranquilizações sem tratar a objeção.',
  n2: 'Mantém o respeito, mas responde de modo genérico à objeção ou deixa o limite ambíguo.',
  n3: 'Reconhece a objeção expressa, explica o limite pertinente e oferece saída viável, mantendo firmeza e respeito.',
  n4: 'Sustenta o limite diante da contestação repetida sem personalizar, sem reiniciar explicações já compreendidas e sem ceder, e usa o escalonamento ou o encerramento quando cabe.',
 } },
];

export function competenciaBase(codigo: string): CompetenciaBase {
 const c = competenciasBase.find(x => x.codigo === codigo);
 if (!c) throw new Error(`Competência fora da biblioteca base: ${codigo}`);
 return structuredClone(c);
}
