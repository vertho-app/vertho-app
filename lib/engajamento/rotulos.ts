/**
 * Rótulos do Engajamento no idioma de quem lê (R-67).
 *
 * O roll-up e a evolução devolvem DADO: códigos estáveis (`motivoCodigo`), e
 * valores de reserva que o banco não tinha ("Sem área", "Cargo não informado").
 * Texto em português que sai do servidor para a tela é o que fazia o RH de
 * língua espanhola ou inglesa ler a frase errada. Aqui a tradução acontece na
 * ponta que sabe o idioma, com o `t` do namespace `EngagementWorkspace`.
 *
 * Arquivo puro (sem `server-only` e sem hook): serve a tela (`useTranslations`),
 * o servidor (`getTranslations`) e o relatório (`createTranslator`).
 */
import { AREA_SEM_NOME, CARGO_SEM_NOME, type MotivoRisco } from '@/lib/engagement-evolution';

/** O `t` do next-intl, escopado em `EngagementWorkspace`. */
export type Traduzir = (chave: string, valores?: Record<string, any>) => string;

/** Cargo da pessoa, ou o rótulo traduzido quando não há (ausência não vira texto em português). */
export function rotuloCargo(t: Traduzir, cargo: string | null | undefined): string {
  const valor = (cargo || '').trim();
  return !valor || valor === CARGO_SEM_NOME ? t('fallbacks.noRole') : valor;
}

/** Área da pessoa, ou o rótulo traduzido quando não há. O valor cru segue estável para filtro e agrupamento. */
export function rotuloArea(t: Traduzir, area: string | null | undefined): string {
  const valor = (area || '').trim();
  return !valor || valor === AREA_SEM_NOME ? t('fallbacks.noArea') : valor;
}

const CODIGOS_DE_MOTIVO: readonly MotivoRisco[] = [
  'sem_atividade_duas_semanas', 'sem_atividade_primeira_semana', 'sem_atividade_nesta_semana',
  'queda_de_pontos', 'consumo_incompleto', 'sem_evidencia', 'sequencia_interrompida', 'ritmo_abaixo',
];

/**
 * O motivo da pessoa na lista de acompanhamento. Sem código (fixture antiga,
 * leitura gravada antes da mudança), cai no texto que veio, em vez de esconder.
 */
export function motivoDeRisco(
  t: Traduzir,
  pessoa: { motivo?: string; motivoCodigo?: string; motivoPontos?: number },
): string {
  const codigo = pessoa.motivoCodigo as MotivoRisco | undefined;
  if (codigo && CODIGOS_DE_MOTIVO.includes(codigo)) {
    return t(`reasons.${codigo}`, { points: pessoa.motivoPontos ?? 0 });
  }
  return pessoa.motivo || '';
}

/**
 * A data (15/07/2026) a partir da qual a abertura da página passou a ser
 * registrada, no formato do idioma. A tela dizia "15/07" escrito em português;
 * em UTC para o dia não andar com o fuso de quem lê.
 */
export function dataDoMarcoDeAbertura(locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 6, 15)));
}
