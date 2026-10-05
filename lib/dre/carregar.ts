/**
 * Carga da DRE para a tela `/admin/vertho/dre`.
 *
 * Gate: `dre.view` (platform admin + permissão), pela porta
 * `requirePlataformaComContexto`. Este arquivo NÃO é `'use server'`: é chamado
 * pelo server component da página, então seus exports não viram endpoint.
 *
 * O que ele monta:
 *  - recebimentos, lançamentos manuais e custo de IA FECHADO, de TODO o
 *    histórico (os acumulados de caixa precisam dele; a janela só decide o que
 *    é exibido);
 *  - o custo de IA das semanas SEM fechamento (a em curso, e qualquer uma que o
 *    cron ainda não alcançou), calculado ao vivo com a MESMA RPC e a MESMA régua
 *    do fechamento e marcado `aoVivo` (provisório na tela);
 *  - `avisos`: tudo que está faltando na tela. Falha de leitura NUNCA vira zero:
 *    uma semana de IA que não pôde ser lida aparece como aviso, porque "não
 *    consegui ler" e "não gastamos" são números diferentes.
 */

import { coletarJanela } from '@/lib/custo-ia/relatorio-semanal';
import { requirePlataformaComContexto } from '@/lib/admin-supabase';
import { can } from '@/lib/permissions';
import { ORCAMENTO_DEFAULTS } from '@/lib/orcamento/precificacao';
import { cambioParaConverter } from './cambio';
import { consolidar, converterUsd, type ResultadoDRE } from './consolidar';
import { agruparCustoIA } from './fechamento';
import { cambioDeLinha, contratoDeLinha, custoIADeLinha, lancamentoDeLinha, parcelaDeLinha } from './linhas';
import {
  dataBRT,
  janelaDaSemana,
  semanaAtualBRT,
  semanaDaData,
  semanasEntre,
  somarDias,
  ultimasSemanas,
  type DataISO,
} from './semana';
import type { CambioDRE, ContratoDRE, CustoIASemanaDRE, LancamentoDRE, ParcelaDRE } from './tipos';

/** Quantas semanas abertas a tela calcula ao vivo no máximo (limita as RPCs). */
const LIMITE_SEMANAS_AO_VIVO = 13;
const PAGINA = 1000;
const OPCOES_JANELA = [4, 12, 26, 52] as const;

export interface EmpresaOpcao {
  id: string;
  nome: string;
  slug: string | null;
  isDemo: boolean;
}

export interface DadosDRE {
  resultado: ResultadoDRE;
  /** Lançamentos manuais das semanas exibidas (para listar e editar). */
  lancamentos: LancamentoDRE[];
  empresas: EmpresaOpcao[];
  canManage: boolean;
  /** Custo/hora que o formulário de horas propõe (o do orçamento). */
  custoHoraPadraoBrl: number;
  semanaAtual: DataISO;
  hoje: DataISO;
  semanasNaJanela: number;
  opcoesJanela: readonly number[];
  /** O que falta na tela. Vazio = tudo foi lido. */
  avisos: string[];
  geradoEm: string;
}

/** Lê uma tabela inteira em páginas de 1.000 (o PostgREST corta calado acima disso). */
async function lerTudo(rotulo: string, pagina: (de: number, ate: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) throw new Error(`${rotulo}: leitura falhou: ${error.message}`);
    const linhas = data ?? [];
    out.push(...linhas);
    if (linhas.length < PAGINA) break;
  }
  return out;
}

export function normalizarJanela(pedida: number | undefined): number {
  return (OPCOES_JANELA as readonly number[]).includes(pedida as number) ? (pedida as number) : 12;
}

export async function carregarDRE(opts: { semanas?: number; agora?: Date } = {}): Promise<DadosDRE> {
  const { sb, ctx } = await requirePlataformaComContexto('dre.view');
  const canManage = await can(ctx, 'dre.manage');
  const agora = opts.agora ?? new Date();
  const hoje = dataBRT(agora);
  const semanaAtual = semanaAtualBRT(agora);
  const nJanela = normalizarJanela(opts.semanas);
  const avisos: string[] = [];

  const [contratosRaw, parcelasRaw, lancRaw, iaRaw, cambioRaw, empRaw] = await Promise.all([
    lerTudo('dre_contratos', (de, ate) => sb.from('dre_contratos').select('*').order('id').range(de, ate)),
    lerTudo('dre_parcelas', (de, ate) => sb.from('dre_parcelas').select('*').order('contrato_id').order('numero').range(de, ate)),
    lerTudo('dre_lancamentos', (de, ate) => sb.from('dre_lancamentos').select('*').order('id').range(de, ate)),
    lerTudo('dre_custo_ia_semana', (de, ate) => sb.from('dre_custo_ia_semana').select('*').order('id').range(de, ate)),
    lerTudo('dre_cambio_semanal', (de, ate) => sb.from('dre_cambio_semanal').select('*').order('semana_inicio').range(de, ate)),
    lerTudo('empresas', (de, ate) => sb.from('empresas').select('id, nome, slug, is_demo').order('nome').order('id').range(de, ate)),
  ]);

  const parcelasPorContrato = new Map<string, ParcelaDRE[]>();
  for (const p of parcelasRaw.map(parcelaDeLinha)) {
    const l = parcelasPorContrato.get(p.contratoId) ?? [];
    l.push(p);
    parcelasPorContrato.set(p.contratoId, l);
  }
  const contratos: ContratoDRE[] = contratosRaw.map((c) => contratoDeLinha(c, parcelasPorContrato.get(String(c.id)) ?? []));
  const lancamentos: LancamentoDRE[] = lancRaw.map(lancamentoDeLinha);
  const custoIAFechado: CustoIASemanaDRE[] = iaRaw.map(custoIADeLinha);
  const cambios: CambioDRE[] = cambioRaw.map(cambioDeLinha);

  // Primeira semana com qualquer dado: os acumulados de caixa partem dela.
  const datas: DataISO[] = [];
  for (const c of contratos) {
    datas.push(semanaDaData(c.inicio));
    for (const p of c.parcelas) if (p.recebidoEm) datas.push(semanaDaData(p.recebidoEm));
  }
  for (const l of lancamentos) datas.push(l.semanaInicio);
  for (const c of custoIAFechado) datas.push(c.semanaInicio);
  const janela = ultimasSemanas(semanaAtual, nJanela);
  const primeira = [...datas, janela[0]].reduce((a, b) => (a < b ? a : b));
  // Teto de 2 anos: acima disso a tabela semanal não serve a ninguém.
  const piso = somarDias(semanaAtual, -7 * 103);
  const semanas = semanasEntre(primeira < piso ? piso : primeira, semanaAtual);

  // Semanas sem nenhum fechamento: calculadas ao vivo (a em curso, sempre).
  const fechadas = new Set(custoIAFechado.map((c) => c.semanaInicio));
  const abertas = semanas.filter((s) => !fechadas.has(s));
  // As mais NOVAS primeiro: se o limite cortar, perde-se a mais antiga.
  const aCalcular = [...abertas].reverse().slice(0, LIMITE_SEMANAS_AO_VIVO);
  const foraDoLimite = abertas.length - aCalcular.length;
  if (foraDoLimite > 0) {
    avisos.push(
      `${foraDoLimite} semana(s) antigas sem fechamento ficaram fora do cálculo ao vivo; o custo de IA delas não aparece (não é zero). O cron de segunda fecha as pendentes.`,
    );
  }

  const aoVivo: CustoIASemanaDRE[] = [];
  await Promise.all(
    aCalcular.map(async (semana) => {
      try {
        const grupos = agruparCustoIA(await coletarJanela(janelaDaSemana(semana)));
        const c = await cambioParaConverter(sb, semana);
        for (const g of grupos) {
          aoVivo.push({
            semanaInicio: semana,
            natureza: g.natureza,
            chaveEmpresa: g.chaveEmpresa,
            empresaId: g.empresaId,
            empresaNome: g.empresaNome,
            custoUsd: g.custoUsd,
            usdBrl: c.usdBrl,
            custoBrl: converterUsd(g.custoUsd, c.usdBrl),
            chamadas: g.chamadas,
            linhasSemCusto: g.linhasSemCusto,
            aoVivo: true,
          });
        }
      } catch (e: any) {
        avisos.push(`Custo de IA da semana de ${semana.slice(8, 10)}/${semana.slice(5, 7)} indisponível agora (${String(e?.message || e).slice(0, 120)}). Não é zero: recarregue a página.`);
      }
    }),
  );

  const resultado = consolidar({
    semanas,
    janela,
    contratos,
    lancamentos,
    custoIA: [...custoIAFechado, ...aoVivo],
    cambios,
    hoje,
  });

  const noPeriodo = new Set(janela);
  const empresas: EmpresaOpcao[] = empRaw.map((e) => ({
    id: String(e.id),
    nome: String(e.nome ?? ''),
    slug: e.slug ? String(e.slug) : null,
    isDemo: e.is_demo === true,
  }));

  return {
    resultado,
    lancamentos: lancamentos.filter((l) => noPeriodo.has(l.semanaInicio)),
    empresas,
    canManage,
    custoHoraPadraoBrl: ORCAMENTO_DEFAULTS.custoHora,
    semanaAtual,
    hoje,
    semanasNaJanela: nJanela,
    opcoesJanela: OPCOES_JANELA,
    avisos,
    geradoEm: agora.toISOString(),
  };
}
