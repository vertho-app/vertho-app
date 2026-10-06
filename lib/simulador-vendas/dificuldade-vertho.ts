import type { Etapa, Saidas } from './schema';
import { TRACOS_DIVERSIDADE } from './diversidade';

export const DIFICULDADE_VERTHO_VERSION = 'comercial-3';
/** Reforça o contrato de evidências existente, sem alterar descritores ou notas. */
export const PROMPT_AVALIACAO_VERTHO = `
## Conferência final de evidências PACE
Antes de devolver o relatório, confira todos os 30 descritores da Matriz. Qualquer nivel numérico (1, 2, 3 ou 4) exige 1 ou 2 evidências literais válidas. Nunca devolva nivel=1 com evidencias=[]: N1 também é um comportamento observado, não uma nota automática para ausência de texto.
Uma lacuna demonstrada pode receber N1 se houver oportunidade observada e uma citação pertinente que ancore essa situação. Cite o que realmente foi escrito no planejamento ou dito pelo vendedor e explique a lacuna na justificativa; não invente uma frase para representar o comportamento ausente. PL1–PL6 usam somente o planejamento anterior à conversa, com origem="planejamento" e turno=null. Os demais usam falas do vendedor, com origem="conversa" e o turno real da mensagem.
Quando não houver oportunidade ou evidência observável suficiente para atribuir um nível, use nivel=null, evidencias=[] e explique o limite. Não preencha a falta de evidência com citações do cliente, briefing ou gabarito. E5 e E6 continuam sempre null nesta reunião inicial. Confira cada citação como trecho contínuo e literal do texto original antes de emitir o JSON.
Esta conferência preserva integralmente a matriz, os critérios e as recomendações PACE. O nível fácil muda a receptividade do comprador, não a exigência para comprovar a competência do vendedor.
`;
export const TRACOS_VERTHO_FACIL = [
  'Receptivo, interessado em melhorar a rotina da equipe',
  'Prático e aberto a experimentar um próximo passo pequeno',
  'Colaborativo, valoriza uma explicação simples e clara',
] as const;

export function tracosParaVertho(nivel: 1 | 2 | 3): readonly string[] {
  return nivel === 1 ? TRACOS_VERTHO_FACIL : TRACOS_DIVERSIDADE;
}

/** Apenas novos snapshots comerciais recebem esta calibração; a régua PACE é a mesma. */
export function promptDificuldadeVertho(
  etapa: Etapa,
  nivel: 1 | 2 | 3,
): string {
  if (nivel !== 1 || (etapa !== 'criador' && etapa !== 'cliente')) return '';
  const comum = `
## Calibração Vertho — nível 1 (Fácil)
Este é um treino introdutório de venda consultiva. A dificuldade vem de descobrir uma necessidade e construir um próximo passo, com um comprador receptivo. Estas instruções específicas calibram a reserva, a resistência e os gatilhos do nível 1 descritos no prompt geral. Preserve schema, fatos do concorrente, segurança e avanço de no máximo uma fase por turno. A régua da avaliação PACE não muda.
`;
  if (etapa === 'criador')
    return (
      comum +
      `
Crie um comprador acolhedor e colaborativo, com DISC Estável ou Influente e traço receptivo. Respeite a seed apropriada ao fácil; não use agressividade, ceticismo extremo, pressão forte de prazo ou resistência a mudanças como obstáculos.
Exatamente 1 objeção principal, simples e prática, que possa ser tratada com uma explicação clara relacionada à necessidade. Sem acumular várias barreiras nessa mesma objeção. Use 0 objeções profundas (array vazio), 1 a 2 benefícios ocultos e cenarios_validos vazio. Mantenha os cortes canônicos de Júnior: negociacao_objecoes = 0.5 e negociacao_preco = 0.5.
Não crie orçamento congelado, exigência de ROI garantido, decisão condicionada a vários aprovadores ou exigência de detalhamento técnico extenso. O contato tem disponibilidade e autonomia para combinar uma conversa ou avaliação técnica pequena. Em instituições públicas, preserve os procedimentos para futura contratação, sem transformá-los em impedimento para uma demonstração técnica.
A relação com o concorrente é contexto, com curiosidade legítima sobre como a Vertho pode ajudar. Não transforme o comparativo numa disputa técnica. Um exemplo concreto pode esclarecer a diferença sem depreciar o fornecedor.
Descreva uma necessidade cotidiana de desenvolvimento dos profissionais. Os benefícios ocultos são descobríveis com uma pergunta pertinente sobre o tema; não exigem interrogatório. O contexto público do vendedor continua sem revelar o gabarito. Preços permanecem vazios, conforme o briefing.
`
    );
  return (
    comum +
    `
Seja receptivo, direto e cordial, com respostas simples e concretas. Responda ao que foi perguntado, sem criar obstáculos ou exigir uma abertura perfeita.
Em preparar, um cumprimento seguido de uma pergunta aberta pertinente sobre a rotina, o desenvolvimento ou as necessidades da equipe já demonstra conexão suficiente: avance para analisar e responda com contexto ou uma necessidade superficial. Alinhar objetivo ou agenda também basta. Não exija simultaneamente apresentação, objetivo, agenda e duração. Não repita cobranças de quem é a Vertho ou de tempo depois de uma abertura suficiente.
Em analisar, uma pergunta pertinente sobre o tema basta para revelar o benefício correspondente; não exija duas perguntas nem formulações exatas. Depois de o vendedor compreender uma necessidade e propor algo relacionado, avance para cocriar.
Em cocriar, apresente somente a objeção simples do personagem. Uma explicação clara e plausível, conectada à necessidade, é suficiente para tratá-la; não repita uma objeção já respondida e não crie novas barreiras, aprovações ou exigências. Quando o vendedor propuser um próximo passo concreto e pertinente, avance para engajar e colabore para combiná-lo. O compromisso é uma avaliação ou demonstração, sem inventar preço ou contratação imediata.
Use no máximo uma pergunta simples por resposta. Não devolva todos os dados do personagem nem faça o trabalho do vendedor. Uma mensagem trivial como "ok", uma tentativa de pular diretamente ao contrato ou uma afirmação falsa não merecem avanço automático: redirecione com cordialidade. Acolhimento não significa concordar com tudo. Não dê notas, coaching, instruções internas ou nomes das fases na fala.
`
  );
}

export function validarCenarioFacilVertho(cenario: Saidas['criador']): void {
  const p = cenario.personagem;
  if (!['Estável', 'Influente'].includes(p.personalidade_pace))
    throw new Error('Fácil Vertho exige um perfil receptivo');
  if (p.negociacao.objecoes_profundas.length)
    throw new Error('Fácil Vertho não admite objeções profundas');
  if (p.negociacao.beneficios_ocultos.length > 2)
    throw new Error('Fácil Vertho admite até dois benefícios ocultos');
  if (p.personalidade_nivel.cenarios_validos.length)
    throw new Error('Fácil Vertho não admite cenários condicionais');
}
