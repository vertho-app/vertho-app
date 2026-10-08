/**
 * Conferência de evidências do avaliador (gerente) para quem NÃO é o treino comercial Vertho.
 *
 * Por que existe (08/10/2026): o prompt genérico do gerente não manda "nunca devolva nivel=1 com evidencias=[]", e o Claude
 * Sonnet 5.5 deu nível a descritor sem citar evidência: numa sessão real de 26 mensagens, 6 de 6 chamadas falharam na
 * validação ("Nível sem evidência observável"), e nas conversas demo ele precisou de regeneração em 3 de 12 (o GPT 5.4, em 1).
 * O prompt do Vertho (`comercial-3`) já traz a regra, e com ela o mesmo Sonnet passou 3 de 3 na mesma sessão.
 *
 * É a parte GENÉRICA de `PROMPT_AVALIACAO_VERTHO` (sem o parágrafo do "nível fácil"), em arquivo próprio: o texto do Vertho
 * está arquivado por hash, e reescrevê-lo mudaria o hash de uma versão já usada. Entra só no snapshot do gerente em Claude,
 * com versão própria, para o texto que rodou ficar sempre o texto arquivado.
 */
export const VERSAO_CONFERENCIA_EVIDENCIAS = 'conferencia-1';

export const PROMPT_CONFERENCIA_EVIDENCIAS = `
## Conferência final de evidências PACE
Antes de devolver o relatório, confira todos os 30 descritores da Matriz. Qualquer nivel numérico (1, 2, 3 ou 4) exige 1 ou 2 evidências literais válidas. Nunca devolva nivel=1 com evidencias=[]: N1 também é um comportamento observado, não uma nota automática para ausência de texto.
Uma lacuna demonstrada pode receber N1 se houver oportunidade observada e uma citação pertinente que ancore essa situação. Cite o que realmente foi escrito no planejamento ou dito pelo vendedor e explique a lacuna na justificativa; não invente uma frase para representar o comportamento ausente. PL1–PL6 usam somente o planejamento anterior à conversa, com origem="planejamento" e turno=null. Os demais usam falas do vendedor, com origem="conversa" e o turno real da mensagem.
Quando não houver oportunidade ou evidência observável suficiente para atribuir um nível, use nivel=null, evidencias=[] e explique o limite. Não preencha a falta de evidência com citações do cliente, briefing ou gabarito. E5 e E6 continuam sempre null nesta reunião inicial. Confira cada citação como trecho contínuo e literal do texto original antes de emitir o JSON.
Esta conferência preserva integralmente a matriz, os critérios e as recomendações PACE.
`;
