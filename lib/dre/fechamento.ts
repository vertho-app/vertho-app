/**
 * Fechamento semanal do custo de IA por tenant (`dre_custo_ia_semana`).
 *
 * Por que existe uma tabela e não só a RPC ao vivo:
 *  (a) `ia_usage_log.empresa_id` é CASCADE: excluir um tenant apaga o custo
 *      histórico dele. O fechamento sobrevive (SET NULL + `chave_empresa`);
 *  (b) o câmbio da semana fica CONGELADO na linha: reabrir a DRE em dezembro
 *      mostra o BRL de setembro, não o de hoje;
 *  (c) a tela lê 12 semanas em uma query em vez de uma RPC por semana.
 *
 * A fonte é a MESMA do e-mail semanal (`coletarJanela`, RPC `custo_ia_agregado`)
 * e a régua de natureza também (`naturezaDaLinha`): operação = cliente pagante,
 * `pd` = o resto. Não há RPC nova, de propósito: duas rotas para o mesmo número
 * divergiriam. Há um teste que prova que os dois somam igual.
 *
 * Idempotente: refazer uma semana regrava as mesmas linhas (upsert) e remove as
 * que deixaram de existir. A exceção está em `staleRemovivel`: linha de tenant
 * JÁ excluído nunca é removida, porque a RPC não a enxerga mais e apagá-la
 * destruiria justamente o que o fechamento existe para guardar.
 */

import { coletarJanela, type Janela, type LinhaAgregada } from '@/lib/custo-ia/relatorio-semanal';
import { naturezaDaLinha } from '@/lib/custo-ia/classificacao';
import { garantirCambio, type OpcoesCambio } from './cambio';
import { arredondar2 } from './dinheiro';
import { janelaDaSemana, somarDias, ultimaSemanaFechadaBRT, type DataISO } from './semana';
import { CHAVE_SEM_TENANT, type FonteCambio, type NaturezaCusto } from './tipos';

type Sb = any;

export interface GrupoCustoIA {
  natureza: NaturezaCusto;
  chaveEmpresa: string;
  empresaId: string | null;
  empresaNome: string | null;
  custoUsd: number;
  chamadas: number;
  linhasSemCusto: number;
}

/** Dobra as linhas do ledger em grupos (natureza, tenant). PURA. */
export function agruparCustoIA(linhas: readonly LinhaAgregada[]): GrupoCustoIA[] {
  const grupos = new Map<string, GrupoCustoIA>();
  for (const l of linhas) {
    const natureza = naturezaDaLinha(l);
    const chave = l.empresaId ?? CHAVE_SEM_TENANT;
    const k = `${natureza}|${chave}`;
    let g = grupos.get(k);
    if (!g) {
      g = { natureza, chaveEmpresa: chave, empresaId: l.empresaId, empresaNome: l.empresaNome, custoUsd: 0, chamadas: 0, linhasSemCusto: 0 };
      grupos.set(k, g);
    }
    g.custoUsd += l.custoUsd;
    g.chamadas += l.chamadas;
    g.linhasSemCusto += l.linhasSemCusto;
    if (!g.empresaNome && l.empresaNome) g.empresaNome = l.empresaNome;
  }
  // 6 casas é a precisão da coluna: a soma de floats não vai além disso.
  return [...grupos.values()].map((g) => ({ ...g, custoUsd: Math.round(g.custoUsd * 1_000_000) / 1_000_000 }));
}

/**
 * Linha antiga que o recálculo pode apagar: a que o ledger não produziu mais E
 * cujo tenant ainda existe (ou é o grupo sem tenant). Linha com `empresa_id`
 * nulo e chave de tenant é de empresa EXCLUÍDA: fica.
 */
export function staleRemovivel(
  existente: { natureza: string; chave_empresa: string; empresa_id: string | null },
  novas: ReadonlySet<string>,
): boolean {
  if (novas.has(`${existente.natureza}|${existente.chave_empresa}`)) return false;
  return existente.empresa_id !== null || existente.chave_empresa === CHAVE_SEM_TENANT;
}

export interface ResultadoFechamento {
  semana: DataISO;
  cambio: { usdBrl: number; fonte: FonteCambio };
  grupos: number;
  totalUsd: number;
  linhasSemCusto: number;
  removidos: number;
}

export interface OpcoesFechamento extends OpcoesCambio {
  /** Injetável nos testes; o padrão é a RPC real. */
  coletar?: (j: Janela) => Promise<LinhaAgregada[]>;
}

/**
 * Fecha UMA semana: garante o câmbio, lê o ledger, grava os grupos e tira os
 * velhos. LANÇA se o banco ou a RPC falharem (o cron traduz em 500: falha de
 * fechamento tem de ser visível, não um 200 com a semana em branco).
 */
export async function fecharSemana(sb: Sb, segunda: DataISO, opts: OpcoesFechamento = {}): Promise<ResultadoFechamento> {
  const cambio = await garantirCambio(sb, segunda, opts);
  const coletar = opts.coletar ?? coletarJanela;
  const linhas = await coletar(janelaDaSemana(segunda));
  const grupos = agruparCustoIA(linhas);

  const agora = new Date().toISOString();
  const rows = grupos.map((g) => ({
    semana_inicio: segunda,
    natureza: g.natureza,
    chave_empresa: g.chaveEmpresa,
    empresa_id: g.empresaId,
    empresa_nome: g.empresaNome,
    custo_usd: g.custoUsd,
    usd_brl: cambio.usdBrl,
    custo_brl: arredondar2(g.custoUsd * cambio.usdBrl),
    chamadas: g.chamadas,
    linhas_sem_custo: g.linhasSemCusto,
    fechado_em: agora,
  }));

  if (rows.length) {
    const { error } = await sb.from('dre_custo_ia_semana').upsert(rows, { onConflict: 'semana_inicio,natureza,chave_empresa' });
    if (error) throw new Error(`dre_custo_ia_semana: gravação falhou: ${error.message}`);
  }

  const { data: existentes, error: errLeitura } = await sb
    .from('dre_custo_ia_semana')
    .select('id, natureza, chave_empresa, empresa_id')
    .eq('semana_inicio', segunda);
  if (errLeitura) throw new Error(`dre_custo_ia_semana: leitura dos velhos falhou: ${errLeitura.message}`);

  const novas = new Set(grupos.map((g) => `${g.natureza}|${g.chaveEmpresa}`));
  const apagar = (existentes ?? []).filter((x: any) => staleRemovivel(x, novas)).map((x: any) => x.id as string);
  if (apagar.length) {
    const { error } = await sb.from('dre_custo_ia_semana').delete().in('id', apagar);
    if (error) throw new Error(`dre_custo_ia_semana: remoção dos velhos falhou: ${error.message}`);
  }

  return {
    semana: segunda,
    cambio: { usdBrl: cambio.usdBrl, fonte: cambio.fonte },
    grupos: grupos.length,
    totalUsd: Math.round(grupos.reduce((s, g) => s + g.custoUsd, 0) * 1_000_000) / 1_000_000,
    linhasSemCusto: grupos.reduce((s, g) => s + g.linhasSemCusto, 0),
    removidos: apagar.length,
  };
}

/**
 * Das `quantas` semanas que terminam em `ultimaFechada`, quais NÃO têm nenhuma
 * linha em `dre_custo_ia_semana` (da mais nova para a mais velha).
 */
export async function semanasPendentes(
  sb: Sb,
  ultimaFechada: DataISO,
  quantas: number,
): Promise<{ pendentes: DataISO[]; jaFechadas: number }> {
  const candidatas: DataISO[] = [];
  for (let i = 0; i < Math.max(1, quantas); i++) candidatas.push(somarDias(ultimaFechada, -7 * i));

  const { data, error } = await sb
    .from('dre_custo_ia_semana')
    .select('semana_inicio')
    .in('semana_inicio', candidatas);
  if (error) throw new Error(`dre_custo_ia_semana: leitura das semanas fechadas falhou: ${error.message}`);
  const jaTem = new Set((data ?? []).map((r: any) => String(r.semana_inicio).slice(0, 10)));
  const pendentes = candidatas.filter((s) => !jaTem.has(s));
  return { pendentes, jaFechadas: candidatas.length - pendentes.length };
}

/**
 * Fecha as semanas que ainda não têm nenhuma linha, da mais NOVA para a mais
 * velha (se o limite cortar, o que fica de fora é o mais antigo). Cobre a 1ª
 * execução (backfill) e qualquer semana que um cron perdido deixou aberta.
 * `ultimaFechada` é a última semana COMPLETA em Brasília.
 */
export async function fecharSemanasPendentes(
  sb: Sb,
  ultimaFechada: DataISO,
  opts: OpcoesFechamento & { semanas?: number; limite?: number } = {},
): Promise<{ fechadas: ResultadoFechamento[]; jaFechadas: number }> {
  const limite = Math.max(1, opts.limite ?? 13);
  const { pendentes, jaFechadas } = await semanasPendentes(sb, ultimaFechada, opts.semanas ?? 13);
  const fechadas: ResultadoFechamento[] = [];
  for (const s of pendentes.slice(0, limite)) fechadas.push(await fecharSemana(sb, s, opts));
  return { fechadas, jaFechadas };
}

export interface ResultadoFechamentoSemanal {
  dry: boolean;
  ultimaSemana: DataISO;
  /** A última semana encerrada: SEMPRE refeita (o Batch pode gravar linha tardia). */
  principal: ResultadoFechamento | null;
  /** Semanas anteriores que estavam sem fechamento (backfill e cron perdido). */
  adicionais: ResultadoFechamento[];
  pendentesAntes: DataISO[];
}

/**
 * O que o cron de segunda faz: refaz a última semana encerrada e fecha as 12
 * anteriores que ainda estejam sem linha. `dry` só lista, não grava nem chama o BCB.
 */
export async function executarFechamentoSemanal(
  sb: Sb,
  agora: Date,
  opts: OpcoesFechamento & { dry?: boolean } = {},
): Promise<ResultadoFechamentoSemanal> {
  const ultima = ultimaSemanaFechadaBRT(agora);
  const { pendentes } = await semanasPendentes(sb, somarDias(ultima, -7), 12);
  if (opts.dry) {
    return { dry: true, ultimaSemana: ultima, principal: null, adicionais: [], pendentesAntes: pendentes };
  }
  const principal = await fecharSemana(sb, ultima, opts);
  const adicionais: ResultadoFechamento[] = [];
  for (const s of pendentes) adicionais.push(await fecharSemana(sb, s, opts));
  return { dry: false, ultimaSemana: ultima, principal, adicionais, pendentesAntes: pendentes };
}
