// Respostas ESCRITAS para testar o encadeamento. Não são saídas medidas de IA.
import { cenario } from '../../lib/recepcao/cenario.mjs';
import { abrirSessao, responder, encerrar } from '../../lib/recepcao/core.mjs';

export const falasSecretaria = [
  'Sinto muito pelo transtorno das duas mudanças. Qual horário funciona para você? Prefere manter a Dra. Helena?',
  'Temos 17/09/2026 às 18h com a Dra. Helena. Esse horário funciona para você?',
  'Confirmado: 17/09/2026 às 18h com a Dra. Helena. A confirmação fica neste chat. Obrigada por nos dar a oportunidade de resolver.'
];
export const falasPaciente = [
  'Só consigo chegar depois das 17h30 e prefiro manter a Dra. Helena.',
  'Sim, esse horário funciona. Pode confirmar com a Dra. Helena.',
  'Está certo, obrigada pela confirmação.'
];
const ref = (mensagemId, trecho) => ({ mensagemId, trecho });

export function insumosExemplo() {
  const e = {
    acolhimento: ref('m1', 'Sinto muito pelo transtorno das duas mudanças.'),
    compreensao: ref('m1', 'Qual horário funciona para você? Prefere manter a Dra. Helena?'),
    clareza: ref('m3', 'Temos 17/09/2026 às 18h com a Dra. Helena.'),
    resolucao: ref('m5', 'Confirmado: 17/09/2026 às 18h com a Dra. Helena. A confirmação fica neste chat.'),
    procedimentos: ref('m3', 'Esse horário funciona para você?')
  };
  const oportunidades = {
    acolhimento: ref('m0', 'É a segunda vez que vocês mudam minha consulta.'),
    compreensao: ref('m0', 'Já pedi para sair mais cedo do trabalho.'),
    clareza: ref('m2', falasPaciente[0]),
    resolucao: ref('m4', falasPaciente[1]),
    procedimentos: ref('m2', falasPaciente[0])
  };
  return {
    dimensoes: cenario.rubrica.map(d => ({ id: d.id, classificacao: 'adequado',
      justificativa: d.adequado, evidencias: [e[d.id]], oportunidades: [oportunidades[d.id]] })),
    ocorrencias: [],
    desfecho: { tipo: 'remarcado', justificativa: 'Alternativa disponível aceita e confirmada.',
      evidencias: [e.resolucao, ref('m4', falasPaciente[1])] },
    feedback: {
      acerto: 'Você reconheceu as duas mudanças, perguntou a disponibilidade e confirmou uma alternativa aceita.',
      melhoria: 'Neste roteiro não há falha demonstrada; o próximo desafio é resolver quando a agenda não atende.',
      novaTentativa: 'Refaça uma variação em que nenhum horário sirva e combine o retorno da coordenação.'
    }
  };
}

export async function executarExemplo() {
  let s = abrirSessao(cenario);
  let i = 0;
  const provedorRoteirizado = async ({ etapa }) => etapa === 'paciente'
    ? JSON.stringify({ fala: falasPaciente[i++] }) : JSON.stringify(insumosExemplo());
  for (const [n, mensagem] of falasSecretaria.entries()) {
    s = (await responder(s, { requestId: `exemplo-${n}`, mensagem }, provedorRoteirizado)).estado;
  }
  return encerrar(s, provedorRoteirizado);
}
