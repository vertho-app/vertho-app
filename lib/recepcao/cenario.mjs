// Clínica, profissionais e paciente fictícios. Validação editorial pendente.
export const cenario = {
  id: 'remarcacao-02', versao: '0.1.0', rubricaVersao: '0.1.0',
  dominio: 'recepcao_medica', statusEditorial: 'rascunho_para_validacao',
  publico: {
    titulo: 'A segunda remarcação',
    objetivo: 'Conduzir uma reclamação e combinar uma alternativa autorizada.',
    aviso: 'Clínica e paciente fictícias. Todas as operações são simuladas.',
    contexto: 'Você atende pelo chat da Clínica Horizonte Exemplo. Marina teve a consulta remarcada pela clínica duas vezes. O canal já está autenticado; não é necessário pedir documentos.',
    agora: '14/09/2026 às 10h',
    consultaAnterior: '15/09/2026 às 16h, com a Dra. Helena, indisponível por alteração da agenda.',
    alternativas: [
      { id: 'A', data: '17/09/2026', hora: '18h', profissional: 'Dra. Helena' },
      { id: 'B', data: '15/09/2026', hora: '17h30', profissional: 'Dr. Caio', condicao: 'Somente com concordância em trocar de profissional.' }
    ],
    procedimentos: [
      'Verifique qual alternativa é viável antes de confirmar a remarcação.',
      'Os horários acima estão disponíveis e podem ser confirmados neste exercício.',
      'Não há encaixe adicional nem desconto autorizado neste cenário.',
      'Se nenhuma alternativa servir, a coordenação retorna até 14/09/2026 às 12h neste mesmo chat, com autorização da paciente.',
      'A lista de espera é opcional e não garante antecipação.',
      'Confirme data, horário, profissional e concordância da paciente; a confirmação fica neste chat.',
      'Não invente motivo clínico para a ausência da médica nem prometa que nunca haverá outra alteração.',
      'Não solicite CPF, laudos, histórico clínico nem dados de terceiros para resolver este caso.'
    ]
  },
  paciente: {
    nome: 'Marina',
    abertura: 'É a segunda vez que vocês mudam minha consulta. Já pedi para sair mais cedo do trabalho. Como vou confiar nesse agendamento?',
    comportamento: 'Frustrada, objetiva e respeitosa. Acolhimento ajuda, mas sozinho não resolve sua necessidade.',
    fatos: [
      'Trabalha até 17h e chega à clínica a partir de 17h30. Conte quando perguntarem sua disponibilidade ou oferecerem horário incompatível.',
      'Prefere a Dra. Helena. Diga quando surgir troca de profissional; não aceite a troca por omissão.',
      '17/09 às 18h com a Dra. Helena é viável; aceite uma proposta clara. Não exija palavras específicas.',
      'Se a proposta for ambígua, peça esclarecimento sobre o que afeta sua decisão, sem ensinar uma resposta completa.'
    ],
    limites: 'Não há sintomas nem urgência neste caso. Não invente condição médica, horários, desconto ou dados pessoais.'
  },
  rubrica: [
    { id: 'acolhimento', peso: 25, criterio: 'Reconhece o transtorno e responde com respeito.', adequado: 'Reconhece as duas alterações e o impacto, sem defensividade.', parcial: 'Cordial, mas reconhece o problema genericamente.', insuficiente: 'Ignora ou minimiza a reclamação.' },
    { id: 'compreensao', peso: 20, criterio: 'Confirma disponibilidade e preferência relevantes.', adequado: 'Obtém ou confirma horário viável e preferência de profissional.', parcial: 'Esclarece apenas uma restrição.', insuficiente: 'Impõe alternativa sem verificar se atende.' },
    { id: 'clareza', peso: 20, criterio: 'Explica alternativas com informações corretas.', adequado: 'Proposta precisa e compatível com a ficha.', parcial: 'Proposta correta, mas ambígua.', insuficiente: 'Inventa horário, desconto ou garantia.' },
    { id: 'resolucao', peso: 25, criterio: 'Combina solução ou encaminhamento autorizado.', adequado: 'Confirma alternativa aceita com seus dados, ou encaminha com concordância, responsável, prazo e canal.', parcial: 'Alternativa válida, combinado incompleto.', insuficiente: 'Encerra sem solução nem encaminhamento.' },
    { id: 'procedimentos', peso: 10, criterio: 'Respeita o procedimento administrativo.', adequado: 'Preserva a decisão da paciente e usa só os dados necessários.', parcial: 'Cria etapa desnecessária, sem ocorrência crítica.', insuficiente: 'Contraria o procedimento.' }
  ],
  ocorrenciasCriticas: ['orientacao_clinica_indevida', 'divulgacao_dado_terceiro', 'desrespeito_grave'],
  desfechos: ['remarcado', 'encaminhado', 'nao_resolvido', 'inconclusivo'],
  limiteRespostas: 12
};
