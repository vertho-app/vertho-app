/**
 * CONARH 52 — textos das mensagens da captura e da régua (T+0 → T+5).
 *
 * Regra do sprint (F8): nenhum "passando pra saber se viu meu e-mail" — todo
 * toque entrega evidência, ferramenta ou decisão. As mensagens citam a ETAPA
 * e a COMPETÊNCIA com as palavras do visitante, porque é isso que separa o
 * follow-up humano da automação genérica.
 *
 * Duas regras de TOM, aprendidas relendo o T+0 já enviado (04/08/2026):
 * 1. "porta" é vocabulário do código — para quem visitou o estande é ETAPA.
 * 2. Nada que rebaixe quem recebe. "Dá para encaminhar direto para quem
 *    decide" trata o destinatário como quem NÃO decide; o convite a compartilhar
 *    se faz pelo formato ("feito para ler em dois minutos e circular"), nunca
 *    por um palpite sobre o cargo dele.
 *
 * Envs: nenhuma direta.
 */
import { formatarDataHoraBRT, mapaEvolucaoUrl, perguntasRevisao, primeiroNome, rotuloPorta } from './conteudo';

export type LeadConarhMsg = {
  id: string;
  nome: string | null;
  organizacao: string | null;
  porta_escolhida: number | null;
  competencia_critica: string | null;
  reuniao_em?: string | null;
};

/** T+0 — entrega do artefato (Mapa da Evolução), citando porta e competência. */
export function mensagemT0(lead: LeadConarhMsg): string {
  const nome = primeiroNome(lead.nome);
  const porta = rotuloPorta(lead.porta_escolhida);
  const linhas = [
    `Oi${nome ? `, ${nome}` : ''}! Aqui é da Vertho — a gente se falou no estande do CONARH.`,
    '',
  ];
  if (porta && lead.competencia_critica) {
    linhas.push(
      // "da empresa", nunca o NOME da empresa: o template fixava o artigo
      // ("aí na {org}"), e nome de empresa não tem gênero previsível — "na
      // Grupo Marista", "na Sesc". Some o artigo, some a classe inteira de
      // erro; a empresa continua nomeada no cabeçalho do Mapa da Evolução.
      `Você apontou a ${porta} e citou "${lead.competencia_critica}" como a competência crítica da empresa.`,
      '',
    );
  }
  linhas.push(
    'Separamos o seu Mapa da Evolução: 1 página com o problema que você descreveu, o ciclo completo das 5 etapas e 3 perguntas para revisar o processo atual. Feito para ler em dois minutos e circular com o time:',
    mapaEvolucaoUrl(lead.id),
  );
  if (lead.reuniao_em) {
    linhas.push(
      '',
      `E está confirmado: nossa conversa de 20 minutos ficou para ${formatarDataHoraBRT(lead.reuniao_em)}.`,
    );
  }
  linhas.push('', 'Qualquer coisa, é só responder por aqui.');
  return linhas.join('\n');
}

/**
 * T+1 — recorte aplicado à competência crítica, ZERO pedido (F8).
 * Entrega uma ferramenta (as 3 perguntas de revisão), não uma cobrança.
 */
export function mensagemT1(lead: LeadConarhMsg): string {
  const nome = primeiroNome(lead.nome);
  const perguntas = perguntasRevisao();
  const linhas = [
    `Oi${nome ? `, ${nome}` : ''}! Vertho aqui, do estande no CONARH.`,
    '',
    lead.competencia_critica
      ? `Ficamos pensando no que você disse sobre "${lead.competencia_critica}". As 3 perguntas do Mapa da Evolução foram feitas exatamente para destravar isso no dia a dia:`
      : 'As 3 perguntas do Mapa da Evolução foram feitas para revisar o processo de desenvolvimento no dia a dia:',
  ];
  for (const p of perguntas.slice(0, 3)) linhas.push(`• ${p}`);
  linhas.push('', `Seu mapa continua aqui: ${mapaEvolucaoUrl(lead.id)}`);
  return linhas.join('\n');
}
