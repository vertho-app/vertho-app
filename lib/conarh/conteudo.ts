/**
 * CONARH 52 — acesso ao pacote de conteúdo estático da feira e helpers de
 * apresentação compartilhados entre captura, worker, mapa e régua.
 *
 * A fonte única do conteúdo é `app/conarh/_data/conteudo.json` (trocar o caso
 * = trocar o JSON, sem deploy). Este módulo só LÊ esse JSON — quem edita é a
 * frente de conteúdo da sprint.
 *
 * Envs: nenhuma direta (o link do mapa usa APP_WEBHOOK_URL, de lib/domain).
 */
import { APP_WEBHOOK_URL } from '@/lib/domain';
import conteudo from '@/app/conarh/_data/conteudo.json';

export type PortaInfo = { numero: number; nome: string; sub: string };

export function portaInfo(numero: number | null | undefined): PortaInfo | null {
  if (!numero) return null;
  const p = (conteudo.portas as PortaInfo[]).find((x) => x.numero === numero);
  return p || null;
}

/** Rótulo curto "porta 2 (Avaliar com consistência)" para mensagens. */
export function rotuloPorta(numero: number | null | undefined): string | null {
  const p = portaInfo(numero);
  return p ? `porta ${p.numero} (${p.nome})` : null;
}

/** As 3 perguntas de revisão do Mapa da Evolução. */
export function perguntasRevisao(): string[] {
  return (conteudo.mapa_evolucao?.perguntas_revisao as string[]) || [];
}

/** O ciclo das 5 portas em 5 linhas (uma por porta). */
export function cicloResumo(): string[] {
  return (conteudo.mapa_evolucao?.ciclo_resumo as string[]) || [];
}

/** Link público do Mapa da Evolução do lead (página sem auth, sobrevive a print). */
export function mapaEvolucaoUrl(leadId: string): string {
  return `${APP_WEBHOOK_URL}/conarh/mapa/${leadId}`;
}

/**
 * Início do dia de HOJE em America/Sao_Paulo, em ISO UTC.
 * BRT é UTC-3 fixo (sem horário de verão desde 2019) — a feira rola em SP e o
 * "dia do painel" é o dia do estande, não o dia UTC (um lead das 21h local
 * entraria no dia seguinte em UTC).
 */
export function inicioHojeBRT(): string {
  const tresHoras = 3 * 60 * 60 * 1000;
  const agoraEmBrt = new Date(Date.now() - tresHoras);
  const meiaNoiteBrtComoUtc = Date.UTC(
    agoraEmBrt.getUTCFullYear(),
    agoraEmBrt.getUTCMonth(),
    agoraEmBrt.getUTCDate(),
  );
  return new Date(meiaNoiteBrtComoUtc + tresHoras).toISOString();
}

/** "quarta-feira, 19/08 às 14:00" — para confirmação de reunião e mensagens. */
export function formatarDataHoraBRT(iso: string): string {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return fmt.format(new Date(iso));
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome || '').trim().split(/\s+/)[0] || '';
}
