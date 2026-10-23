// Metas do RC (contrato v6, cláusula 9ª e Anexo IV) e provisão da indenização
// (cláusula 19). Funções puras: as actions (actions/sales/metas.ts) leem o banco
// e chamam daqui.
//
//   · Meta vinculante: soma do Valor Total do Contrato das propostas aceitas pelo
//     cliente e aprovadas pela vertho.ai no período ANUAL (contado da assinatura),
//     com marcos trimestrais ACUMULADOS; o do 4º trimestre é a meta anual. Contam
//     clientes novos e novas contratações da carteira. Valor contratado, não o
//     recebido (o RC não responde pela inadimplência do cliente). Anexo IV, 2.
//   · Marcos de ativação: pipeline qualificado até o 90º dia e o 1º contrato em
//     até N meses. Anexo IV, 3.
//   · As metas não mudam proteção, comissão nem ajuda de custo (9.11) e não são
//     alteradas durante o período (9.10).
//   · Indenização (19.1 e 19.3): ao menos 1/12 da retribuição auferida (comissões
//     e ajuda de custo fixa), monetariamente atualizada; a provisão daqui é a
//     nominal, sem a atualização.
import { dataBRT, somarDias } from '@/lib/dre/semana';

export type Meta = {
  periodo_inicio: string;
  meta_anual: number;
  marco_t1: number | null;
  marco_t2: number | null;
  marco_t3: number | null;
  ativacao_pipeline: number | null;
  primeiro_contrato_meses: number | null;
};

export type PropostaAceita = { total_contract_value: number | null; accepted_recorded_at: string | null; carteira?: boolean | null };

/** "2026-11-03" + n meses, no mesmo dia (o fim de mês curto cai no último dia). */
export function somarMeses(dia: string, meses: number): string {
  const [a, m, d] = dia.slice(0, 10).split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export type ProgressoDaMeta = {
  inicio: string;
  /** Último dia do período anual (inclusive). */
  fim: string;
  trimestres: { numero: 1 | 2 | 3 | 4; ate: string; marco: number | null; realizado: number; atingido: boolean | null; encerrado: boolean }[];
  realizadoNoAno: number;
  contratos: number;
  contratosDaCarteira: number;
  ativacao: {
    /** `aberto`: ainda dentro dos 90 dias (dia de Brasília). */
    pipeline: { meta: number | null; ate: string; aberto: boolean };
    primeiroContrato: { prazoMeses: number | null; ate: string | null; fechadoEm: string | null; atingido: boolean | null };
  };
};

/** O progresso da meta em `hoje`, a partir das propostas aceitas do RC. */
export function progressoDaMeta(meta: Meta, aceitas: PropostaAceita[], hoje: Date = new Date()): ProgressoDaMeta {
  const inicio = meta.periodo_inicio.slice(0, 10);
  const fimExclusivo = somarMeses(inicio, 12);
  const hojeDia = dataBRT(hoje);
  const doPeriodo = aceitas
    .filter((p) => p.accepted_recorded_at)
    .map((p) => ({ ...p, dia: dataBRT(new Date(p.accepted_recorded_at as string)), valor: Number(p.total_contract_value) || 0 }))
    .filter((p) => p.dia >= inicio && p.dia < fimExclusivo);
  const ate = (diaExclusivo: string) => doPeriodo.filter((p) => p.dia < diaExclusivo).reduce((s, p) => s + p.valor, 0);

  const marcos = [meta.marco_t1, meta.marco_t2, meta.marco_t3, meta.meta_anual];
  const trimestres = ([1, 2, 3, 4] as const).map((numero) => {
    const limite = somarMeses(inicio, numero * 3);
    const realizado = Math.round(ate(limite) * 100) / 100;
    const marco = marcos[numero - 1] == null ? null : Number(marcos[numero - 1]);
    const encerrado = hojeDia >= limite;
    return {
      numero,
      ate: somarDias(limite, -1),
      marco,
      realizado,
      atingido: marco == null ? null : realizado >= marco ? true : encerrado ? false : null,
      encerrado,
    };
  });

  const primeiro = doPeriodo.map((p) => p.dia).sort()[0] ?? null;
  const prazo = meta.primeiro_contrato_meses ?? null;
  const prazoAte = prazo ? somarDias(somarMeses(inicio, prazo), -1) : null;
  return {
    inicio,
    fim: somarDias(fimExclusivo, -1),
    trimestres,
    realizadoNoAno: Math.round(doPeriodo.reduce((s, p) => s + p.valor, 0) * 100) / 100,
    contratos: doPeriodo.length,
    contratosDaCarteira: doPeriodo.filter((p) => p.carteira).length,
    ativacao: {
      pipeline: { meta: meta.ativacao_pipeline ?? null, ate: somarDias(inicio, 89), aberto: hojeDia <= somarDias(inicio, 89) },
      primeiroContrato: {
        prazoMeses: prazo,
        ate: prazoAte,
        fechadoEm: primeiro,
        atingido: !prazoAte ? null : primeiro && primeiro <= prazoAte ? true : hojeDia > prazoAte ? false : null,
      },
    },
  };
}

/** A meta só muda ANTES de o período começar (9.10). */
export function metaEditavel(periodoInicio: string, hoje: Date = new Date()): boolean {
  return dataBRT(hoje) < periodoInicio.slice(0, 10);
}

/** Meses completos de contrato entre o início e `ate` (para a ajuda de custo auferida). */
export function mesesCompletos(inicio: string, ate: Date = new Date()): number {
  const fim = dataBRT(ate);
  let meses = 0;
  while (somarMeses(inicio, meses + 1) <= fim) meses++;
  return meses;
}

export type Provisao = { comissoes: number; ajudaDeCusto: number; base: number; provisao: number };

/**
 * Provisão nominal da indenização (19.1 e 19.3): 1/12 da retribuição auferida,
 * comissões PAGAS (estornos descontados) mais a ajuda de custo dos meses
 * completos de contrato. Sem a atualização monetária, que se apura na rescisão.
 */
export function provisaoDeIndenizacao(comissoesPagas: number, ajudaMensal: number | null, mesesDeContrato: number): Provisao {
  const comissoes = Math.round((Number(comissoesPagas) || 0) * 100) / 100;
  const ajudaDeCusto = Math.round((Number(ajudaMensal) || 0) * Math.max(0, mesesDeContrato) * 100) / 100;
  const base = Math.round((comissoes + ajudaDeCusto) * 100) / 100;
  return { comissoes, ajudaDeCusto, base, provisao: Math.round((base / 12) * 100) / 100 };
}
