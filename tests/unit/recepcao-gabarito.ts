// Falas ESCRITAS da secretária para os casos 3.0 (Limite contestado), em três níveis de condução.
// Não são saídas de IA. Servem aos ensaios opt-in (limites-live, calibracao-live) para que os
// diálogos comparados partam do MESMO texto e a diferença medida seja do avaliador, não da entrada.
//
// exemplar: conteúdo correto da ficha + sustenta o limite + encerra pelo procedimento público.
// mediana:  conteúdo correto na abertura, condução vaga no conflito, encerramento sem procedimento.
// fraca:    cordialidade genérica com promessa indevida (exceção, prioridade), nenhum dado da ficha;
//           no caso de terceiro, confirma presença (ocorrência crítica esperada).

export const aberturaCorreta: Record<string, string> = {
 'remarcacao-02': 'Sinto muito pelo impacto das duas alterações. Só há 17/09 às 18h com a Dra. Helena ou 15/09 às 17h30 com o Dr. Caio, se você aceitar trocar. Não existe encaixe com a Dra. Helena no dia original. A coordenação pode consultar alternativas até hoje às 12h neste chat, sem garantia de encaixe.',
 'convenio-pendente': 'Entendo a preocupação com a consulta. A reserva de amanhã às 15h com a Dra. Helena está mantida, mas a cobertura ainda depende de análise. Não posso garantir aprovação nem antecipar a análise para o meio-dia. A equipe de autorizações retorna até hoje às 16h neste chat, com seu consentimento para encaminhar.',
 'primeira-consulta': 'Entendo a necessidade de organizar seu tempo. A consulta é amanhã às 14h, unidade Jardim, Rua Exemplo 100, com chegada 15 minutos antes e documento presencial. Não há previsão confirmada de duração ou espera, nem prioridade autorizada. A coordenação pode orientar até hoje às 17h neste chat; não consigo garantir saída às 15h ou atendimento exato às 14h.',
 'falta-consulta': 'Entendo que quer amanhã depois das cinco. Não é punição pela falta e não há multa. Temos 22/09 às 16h ou 24/09 às 18h com a Dra. Helena; não existe encaixe autorizado para amanhã. A coordenação pode consultar alternativas até amanhã às 12h neste chat, com sua autorização, sem garantia de antecipação.',
 'informacao-terceiro': 'Entendo que quer ajudar sua irmã. Neste canal não posso confirmar nem presença nem conteúdo de consulta, mesmo com parentesco ou pagamento, pois não há autorização. Sua irmã pode usar o próprio canal autenticado; a equipe de registros pode orientar sobre representação até amanhã às 12h neste chat com seu consentimento, sem revelar dados.',
};

export function exemplar(casoId: string, variante: number): string[] {
 return [
  aberturaCorreta[casoId] + ' Essas alternativas atendem ou prefere que eu registre sua reclamação para a coordenação, com retorno até hoje às 17h neste chat? Não temos transferência imediata e a reclamação não garante exceção.',
  'Entendo que você compreendeu as opções e ainda discorda. A negativa não é pessoal e não tenho autorização para abrir essa exceção. Não vou prometer o que não posso cumprir nem confirmar alternativa recusada. A coordenação pode receber sua reclamação e retornar até hoje às 17h aqui, sem garantia de solução. Você autoriza somente esse registro?',
  variante === 1
   ? 'Respeito sua recusa. Não farei encaminhamento ou registro que você não autorizou. Já expliquei as possibilidades e não tenho outra medida autorizada para essa exigência. Vou encerrar este atendimento por aqui. O canal continua disponível caso queira retomar uma das alternativas ou registrar uma reclamação.'
   : 'Vou seguir somente o que você autorizou: se autorizou a reclamação, ela seguirá para a coordenação com retorno até hoje às 17h neste chat, sem confirmar opção recusada ou prometer exceção. Já expliquei as possibilidades e não tenho outra medida autorizada. Vou encerrar por aqui; este canal continua disponível para retomar.',
 ];
}

export function mediana(casoId: string): string[] {
 return [
  aberturaCorreta[casoId] + ' Qual dessas opções fica melhor para você?',
  'Entendo sua frustração, de verdade. Vou ver o que consigo fazer por aqui e te retorno, tá bom? Enquanto isso, as opções que te passei continuam disponíveis.',
  'Tudo bem. Vou deixar registrado aqui o seu pedido e qualquer novidade eu te aviso. Obrigada pela compreensão.',
 ];
}

export function fraca(casoId: string): string[] {
 return [
  'Oi! Pode deixar comigo, vou resolver isso pra você. Só um minuto.',
  casoId === 'informacao-terceiro'
   ? 'Deixa eu ver aqui no sistema... sim, sua irmã esteve aqui ontem e foi atendida normalmente. O que o médico falou eu não posso passar, tá?'
   : 'Vou falar com a chefia agora e pedir pra abrir uma exceção pra você, pode deixar. Você merece esse cuidado.',
  'Pronto, já deixei anotado aqui que é prioridade. Pode confiar que vai dar certo!',
 ];
}
