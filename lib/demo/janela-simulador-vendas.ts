/**
 * Janela de acesso do Simulador de vendas no ambiente de DEMONSTRAÇÃO.
 *
 * O vendas só libera participante dentro de `periodo_inicio`/`periodo_fim`
 * (decisão comercial de 13/09/2026: sem datas explícitas, ninguém treina). Num
 * cliente isso é contrato; na demo, a janela configurada à mão venceu em
 * 14/09/2026 às 18h e ninguém percebeu: o participante do ACME perdeu o
 * simulador, e o admin continuava treinando (o teste administrativo ignora a
 * janela). O reset noturno passa a empurrar o fim para a frente.
 *
 * Só renova o que está LIGADO: desligar o simulador na demo continua valendo.
 */
export const DIAS_MINIMOS_RESTANTES = 30;
export const DIAS_DA_RENOVACAO = 90;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface JanelaVendas {
  habilitado: boolean | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
}

/** Devolve a janela nova, ou `null` quando não há o que renovar. */
export function janelaRenovada(atual: JanelaVendas | null, agora: Date): { periodo_inicio: string; periodo_fim: string } | null {
  if (!atual?.habilitado) return null;
  const fim = atual.periodo_fim ? Date.parse(atual.periodo_fim) : NaN;
  if (Number.isFinite(fim) && fim - agora.getTime() >= DIAS_MINIMOS_RESTANTES * DIA_MS) return null;
  const inicio = atual.periodo_inicio ? Date.parse(atual.periodo_inicio) : NaN;
  return {
    // O início nunca vai para o futuro: isso fecharia o acesso até lá.
    periodo_inicio: new Date(Number.isFinite(inicio) && inicio <= agora.getTime() ? inicio : agora.getTime()).toISOString(),
    periodo_fim: new Date(agora.getTime() + DIAS_DA_RENOVACAO * DIA_MS).toISOString(),
  };
}
