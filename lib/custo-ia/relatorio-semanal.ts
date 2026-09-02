/**
 * Relatório SEMANAL de custo de IA por empresa/tenant.
 *
 * Fecha na segunda às 04:00 de Brasília e cobre a semana anterior INTEIRA
 * (segunda 00:00 → domingo 23:59:59, BRT). O corte é o de sempre neste
 * repositório: `vercel.json` agenda em UTC, e Brasília é UTC−3 fixo desde 2019
 * — o cron entra como `0 7 * * 1`. Ver o cabeçalho de `app/api/cron/route.ts`.
 *
 * ── O que este relatório mede, e o que ele NÃO mede ───────────────────────────
 *
 * A fonte é `ia_usage_log`, e o ledger só registra quem escreve nele. Hoje há
 * três escritores: o wrapper (`actions/ai-client.ts`), o TTS (`lib/gemini-tts.ts`,
 * desde 30/08/2026) e o Batch (`lib/ai-batch.ts`). Tudo que não passa por um
 * deles — render de vídeo, HeyGen, Bunny, embeddings — não aparece aqui, e a
 * ausência tem exatamente a mesma cara de um zero. Por isso o e-mail carrega uma
 * nota de cobertura fixa: um número sem a fronteira dele convida a ler "não
 * gastamos" onde o certo é "não medimos".
 *
 * ⚠️ O TTS entrou no ledger em 30/08/2026. A primeira comparação semana-a-semana
 * que cruzar essa data vai mostrar o áudio "aparecendo do nada" — é o
 * INSTRUMENTO que mudou, não o gasto. `avisoInstrumento()` põe isso no e-mail
 * enquanto a janela comparada tocar a virada.
 *
 * ── Por que a fatia sem `empresa_id` não é descartada ─────────────────────────
 *
 * Medido em 01/09/2026, 30 dias: 3.988 das 10.525 linhas (38%) não têm empresa,
 * e elas respondem por US$ 102,41 de US$ 291,40 (35% do dinheiro). São autoria
 * de conteúdo, evals, copiloto e simulador — custo de PLATAFORMA, real e pago.
 * Um relatório "por empresa" que filtrasse `empresa_id is not null` mostraria
 * dois terços da conta com cara de conta inteira.
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import { frenteDePD, naturezaDaLinha } from './classificacao';

/**
 * Client de INFRA: o ledger não é dado de tenant (`empresa_id` ali é etiqueta de
 * atribuição, não escopo de acesso) e este relatório é justamente a visão
 * cruzada de TODOS os tenants — passar por `tenantDb` seria contraditório.
 */
function sbInfra() {
  return createSupabaseAdmin();
}

/** BRT = UTC−3, fixo (sem horário de verão no Brasil desde 2019). */
const OFFSET_BRT_MS = 3 * 3_600_000;

export interface Janela {
  /** Início da janela, em UTC (inclusivo). */
  ini: Date;
  /** Fim da janela, em UTC (EXCLUSIVO). */
  fim: Date;
}

/**
 * A última semana FECHADA em Brasília, a partir de `agora`.
 *
 * Rodando na segunda às 04:00 BRT, devolve [segunda anterior 00:00 BRT,
 * segunda de hoje 00:00 BRT) — ou seja, a semana que acabou de terminar, sem
 * nenhuma hora do dia em curso. Fim exclusivo de propósito: com fim inclusivo,
 * uma chamada exatamente à meia-noite de segunda entraria em DUAS semanas.
 */
export function janelaSemanaFechada(agora: Date): Janela {
  const brt = new Date(agora.getTime() - OFFSET_BRT_MS);
  const diasDesdeSegunda = (brt.getUTCDay() + 6) % 7; // 0=domingo → 6
  const meiaNoiteBrtEmUtcMs =
    Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()) + OFFSET_BRT_MS;
  const fim = new Date(meiaNoiteBrtEmUtcMs - diasDesdeSegunda * 86_400_000);
  return { ini: new Date(fim.getTime() - 7 * 86_400_000), fim };
}

/** Uma linha da RPC `custo_ia_agregado` (migrations 238 e 239). */
export interface LinhaAgregada {
  empresaId: string | null;
  empresaNome: string | null;
  empresaSlug: string | null;
  feature: string;
  /** Quem disparou, declarado no call-site. Separa operação de medição. */
  source: string;
  provider: string;
  model: string;
  chamadas: number;
  chamadasNaoOk: number;
  linhasSemCusto: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  custoUsd: number;
}

export interface ItemCusto {
  nome: string;
  custoUsd: number;
  chamadas: number;
}

export interface BlocoEmpresa {
  empresaId: string | null;
  nome: string;
  slug: string | null;
  /** `false` = fatia de plataforma (linhas sem `empresa_id`). */
  atribuida: boolean;
  custoUsd: number;
  /** Custo do mesmo bloco na semana anterior. `null` = não existia lá. */
  custoAnteriorUsd: number | null;
  chamadas: number;
  chamadasNaoOk: number;
  linhasSemCusto: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  features: ItemCusto[];
  modelos: ItemCusto[];
}

/**
 * Uma frente de P&D: o trabalho de medir e experimentar, agrupado pelo que ele
 * investiga, não pela empresa cujos dados usou.
 */
export interface BlocoPD {
  frente: string;
  custoUsd: number;
  custoAnteriorUsd: number | null;
  chamadas: number;
  /** Empresas cujos dados alimentaram a frente. Vazio = rodada sintética. */
  tenants: string[];
  features: ItemCusto[];
  modelos: ItemCusto[];
}

export interface RelatorioSemanal {
  ini: Date;
  fim: Date;
  totalUsd: number;
  totalAnteriorUsd: number;
  /** Custo de entregar. É o número que sustenta preço e conversa com cliente. */
  operacaoUsd: number;
  operacaoAnteriorUsd: number;
  /** Custo de descobrir. Investimento, não serviço prestado. */
  pdUsd: number;
  pdAnteriorUsd: number;
  totalChamadas: number;
  totalNaoOk: number;
  totalSemCusto: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Tenants com custo de OPERAÇÃO, do mais caro para o mais barato. */
  empresas: BlocoEmpresa[];
  /** Operação sem `empresa_id`: trabalho de plataforma. `null` se não houve. */
  plataforma: BlocoEmpresa | null;
  /** Frentes de P&D da semana, da mais cara para a mais barata. */
  pd: BlocoPD[];
  /** Nenhuma linha na janela — relatório vazio é resultado, não falha. */
  semDados: boolean;
}

/** Número que veio do PostgREST (numeric/int8 podem chegar como string). */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Lê a janela agregada no banco. Lança se a RPC falhar — ver `executar...`. */
export async function coletarJanela(j: Janela): Promise<LinhaAgregada[]> {
  const { data, error } = await sbInfra().rpc('custo_ia_agregado', {
    p_ini: j.ini.toISOString(),
    p_fim: j.fim.toISOString(),
  });
  if (error) {
    throw new Error(`custo_ia_agregado falhou: ${error.message}`);
  }
  return (data || []).map((r: Record<string, unknown>) => ({
    empresaId: (r.empresa_id as string) ?? null,
    empresaNome: (r.empresa_nome as string) ?? null,
    empresaSlug: (r.empresa_slug as string) ?? null,
    feature: (r.feature as string) || 'sem-feature',
    source: (r.source as string) || 'wrapper',
    provider: (r.provider as string) || 'desconhecido',
    model: (r.model as string) || 'desconhecido',
    chamadas: num(r.chamadas),
    chamadasNaoOk: num(r.chamadas_erro),
    linhasSemCusto: num(r.linhas_sem_custo),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    cacheReadTokens: num(r.cache_read_tokens),
    cacheWriteTokens: num(r.cache_write_tokens),
    custoUsd: num(r.custo_usd),
  }));
}

const CHAVE_PLATAFORMA = '__plataforma__';

/** Chave de agrupamento: o `empresa_id`, ou a fatia de plataforma. */
function chaveDe(l: LinhaAgregada): string {
  return l.empresaId || CHAVE_PLATAFORMA;
}

function ordenarPorCusto(m: Map<string, ItemCusto>): ItemCusto[] {
  return [...m.values()].sort((a, b) => b.custoUsd - a.custoUsd);
}

/**
 * Dobra as linhas agregadas em blocos por empresa. Puro: sem rede, testável.
 *
 * `anteriores` alimenta só o Δ — uma empresa que gastou na semana passada e
 * ZERO nesta não vira linha do relatório, porque a pergunta é "quanto custou
 * esta semana". O total anterior, esse sim, soma tudo.
 */
export function montarRelatorio(
  j: Janela,
  linhas: LinhaAgregada[],
  anteriores: LinhaAgregada[],
): RelatorioSemanal {
  const ehPD = (l: LinhaAgregada) => naturezaDaLinha(l.feature, l.source) === 'pd';
  const operacao = linhas.filter((l) => !ehPD(l));
  const pesquisa = linhas.filter(ehPD);
  const operacaoAnterior = anteriores.filter((l) => !ehPD(l));
  const pesquisaAnterior = anteriores.filter(ehPD);

  const custoAnteriorPorChave = new Map<string, number>();
  for (const l of operacaoAnterior) {
    const k = chaveDe(l);
    custoAnteriorPorChave.set(k, (custoAnteriorPorChave.get(k) || 0) + l.custoUsd);
  }

  const blocos = new Map<string, BlocoEmpresa>();
  const featuresPor = new Map<string, Map<string, ItemCusto>>();
  const modelosPor = new Map<string, Map<string, ItemCusto>>();

  for (const l of operacao) {
    const k = chaveDe(l);
    let b = blocos.get(k);
    if (!b) {
      b = {
        empresaId: l.empresaId,
        // Empresa apagada depois da chamada deixa o join sem nome: o id ainda é
        // atribuição válida, e somá-la em "plataforma" trocaria a natureza do
        // gasto. Fica identificada pelo id, explicitamente.
        nome: l.empresaId
          ? (l.empresaNome || `empresa ${l.empresaId.slice(0, 8)} (sem cadastro)`)
          : 'Plataforma Vertho (não atribuído a tenant)',
        slug: l.empresaSlug,
        atribuida: !!l.empresaId,
        custoUsd: 0,
        custoAnteriorUsd: custoAnteriorPorChave.has(k) ? custoAnteriorPorChave.get(k)! : null,
        chamadas: 0,
        chamadasNaoOk: 0,
        linhasSemCusto: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        features: [],
        modelos: [],
      };
      blocos.set(k, b);
      featuresPor.set(k, new Map());
      modelosPor.set(k, new Map());
    }
    b.custoUsd += l.custoUsd;
    b.chamadas += l.chamadas;
    b.chamadasNaoOk += l.chamadasNaoOk;
    b.linhasSemCusto += l.linhasSemCusto;
    b.inputTokens += l.inputTokens;
    b.outputTokens += l.outputTokens;
    b.cacheReadTokens += l.cacheReadTokens;
    b.cacheWriteTokens += l.cacheWriteTokens;

    const fs = featuresPor.get(k)!;
    const f = fs.get(l.feature) || { nome: l.feature, custoUsd: 0, chamadas: 0 };
    f.custoUsd += l.custoUsd;
    f.chamadas += l.chamadas;
    fs.set(l.feature, f);

    const ms = modelosPor.get(k)!;
    const m = ms.get(l.model) || { nome: l.model, custoUsd: 0, chamadas: 0 };
    m.custoUsd += l.custoUsd;
    m.chamadas += l.chamadas;
    ms.set(l.model, m);
  }

  for (const [k, b] of blocos) {
    b.features = ordenarPorCusto(featuresPor.get(k)!);
    b.modelos = ordenarPorCusto(modelosPor.get(k)!);
  }

  const todos = [...blocos.values()];
  const empresas = todos.filter((b) => b.atribuida).sort((a, b) => b.custoUsd - a.custoUsd);
  const plataforma = todos.find((b) => !b.atribuida) || null;

  const pd = montarBlocosPD(pesquisa, pesquisaAnterior);
  const somaCusto = (ls: LinhaAgregada[]) => ls.reduce((s, l) => s + l.custoUsd, 0);
  const soma = (f: (l: LinhaAgregada) => number) => linhas.reduce((s, l) => s + f(l), 0);

  return {
    ini: j.ini,
    fim: j.fim,
    // O total continua sendo TUDO: separar as naturezas não pode fazer dinheiro
    // sumir da conta, só mudar de coluna.
    totalUsd: somaCusto(linhas),
    totalAnteriorUsd: somaCusto(anteriores),
    operacaoUsd: somaCusto(operacao),
    operacaoAnteriorUsd: somaCusto(operacaoAnterior),
    pdUsd: somaCusto(pesquisa),
    pdAnteriorUsd: somaCusto(pesquisaAnterior),
    totalChamadas: soma((l) => l.chamadas),
    totalNaoOk: soma((l) => l.chamadasNaoOk),
    totalSemCusto: soma((l) => l.linhasSemCusto),
    inputTokens: soma((l) => l.inputTokens),
    outputTokens: soma((l) => l.outputTokens),
    cacheReadTokens: soma((l) => l.cacheReadTokens),
    cacheWriteTokens: soma((l) => l.cacheWriteTokens),
    empresas,
    plataforma,
    pd,
    semDados: linhas.length === 0,
  };
}

/** Agrupa as linhas de P&D pela frente que investigam. */
function montarBlocosPD(linhas: LinhaAgregada[], anteriores: LinhaAgregada[]): BlocoPD[] {
  const anteriorPorFrente = new Map<string, number>();
  for (const l of anteriores) {
    const f = frenteDePD(l.feature, l.source);
    anteriorPorFrente.set(f, (anteriorPorFrente.get(f) || 0) + l.custoUsd);
  }

  const blocos = new Map<string, BlocoPD>();
  const featuresPor = new Map<string, Map<string, ItemCusto>>();
  const modelosPor = new Map<string, Map<string, ItemCusto>>();
  const tenantsPor = new Map<string, Set<string>>();

  for (const l of linhas) {
    const frente = frenteDePD(l.feature, l.source);
    let b = blocos.get(frente);
    if (!b) {
      b = {
        frente,
        custoUsd: 0,
        custoAnteriorUsd: anteriorPorFrente.has(frente) ? anteriorPorFrente.get(frente)! : null,
        chamadas: 0,
        tenants: [],
        features: [],
        modelos: [],
      };
      blocos.set(frente, b);
      featuresPor.set(frente, new Map());
      modelosPor.set(frente, new Map());
      tenantsPor.set(frente, new Set());
    }
    b.custoUsd += l.custoUsd;
    b.chamadas += l.chamadas;
    // De quem eram os dados. Importa porque a frente consome material de um
    // cliente real, e é isso que o bloco do tenant deixou de mostrar.
    if (l.empresaNome) tenantsPor.get(frente)!.add(l.empresaNome);

    const fs = featuresPor.get(frente)!;
    const f = fs.get(l.feature) || { nome: l.feature, custoUsd: 0, chamadas: 0 };
    f.custoUsd += l.custoUsd;
    f.chamadas += l.chamadas;
    fs.set(l.feature, f);

    const ms = modelosPor.get(frente)!;
    const m = ms.get(l.model) || { nome: l.model, custoUsd: 0, chamadas: 0 };
    m.custoUsd += l.custoUsd;
    m.chamadas += l.chamadas;
    ms.set(l.model, m);
  }

  for (const [frente, b] of blocos) {
    b.features = ordenarPorCusto(featuresPor.get(frente)!);
    b.modelos = ordenarPorCusto(modelosPor.get(frente)!);
    b.tenants = [...tenantsPor.get(frente)!].sort();
  }
  return [...blocos.values()].sort((a, b) => b.custoUsd - a.custoUsd);
}

/**
 * Destinatários do relatório.
 *
 * 🔑 **`ADMIN_EMAILS` NÃO entra como fallback aqui, e isso é decisão.** Aquela
 * env é usada como fallback de AUTORIZAÇÃO de platform-admin
 * (`app/admin/admin-actions.ts`): pôr alguém lá para "receber o relatório de
 * custo" concede acesso de admin da plataforma. O mesmo raciocínio que criou
 * `HEALTH_ALERT_EMAILS` vale aqui — ver `lib/pipeline-health/core.ts`.
 *
 * O default fica no código, não só na env: um relatório que depende de env não
 * configurada não falha, ele simplesmente não chega, e ninguém percebe.
 */
export function destinosDoRelatorio(): string[] {
  const bruto = process.env.CUSTO_IA_REPORT_EMAILS || 'rodrigo@vertho.ai';
  return [...new Set(bruto.split(',').map((s) => s.trim()).filter(Boolean))];
}

export interface ResultadoExecucao {
  message: string;
  periodo: { ini: string; fim: string };
  totalUsd: number;
  empresas: number;
  enviados: string[];
  falhas: { to: string; reason: string }[];
  relatorio: RelatorioSemanal;
}

/** "24/08 a 30/08/2026" — as datas que a pessoa reconhece, em BRT. */
export function rotuloPeriodo(r: { ini: Date; fim: Date }): string {
  const d = (data: Date) => {
    const brt = new Date(data.getTime() - OFFSET_BRT_MS);
    return {
      dd: String(brt.getUTCDate()).padStart(2, '0'),
      mm: String(brt.getUTCMonth() + 1).padStart(2, '0'),
      yyyy: brt.getUTCFullYear(),
    };
  };
  const a = d(r.ini);
  // O fim é EXCLUSIVO (segunda 00:00). O último dia coberto é o anterior.
  const b = d(new Date(r.fim.getTime() - 1000));
  return `${a.dd}/${a.mm} a ${b.dd}/${b.mm}/${b.yyyy}`;
}

/**
 * O TTS começou a gravar no ledger em 30/08/2026. Enquanto a comparação
 * semana-a-semana cruzar essa data, o áudio "aparece" sem que nada tenha
 * mudado no gasto — e um salto de instrumento lido como salto de custo manda
 * investigar o lugar errado.
 */
export const LEDGER_TTS_DESDE = new Date('2026-08-30T00:00:00Z');

export function avisoInstrumento(r: { ini: Date }): string | null {
  const inicioDaComparacao = new Date(r.ini.getTime() - 7 * 86_400_000);
  if (inicioDaComparacao >= LEDGER_TTS_DESDE) return null;
  return 'O áudio (TTS) só passou a ser registrado no ledger em 30/08/2026. '
    + 'Na comparação com a semana anterior, parte da variação é o instrumento que mudou, não o gasto.';
}

/**
 * Roda o relatório da última semana fechada e envia por e-mail.
 *
 * `enviar: false` monta tudo e não manda nada — é o dry-run que permite
 * conferir a conta sem queimar um envio.
 */
export async function executarRelatorioCustoIA(opts: {
  agora?: Date;
  enviar?: boolean;
} = {}): Promise<ResultadoExecucao> {
  const agora = opts.agora ?? new Date();
  const enviar = opts.enviar !== false;

  const janela = janelaSemanaFechada(agora);
  const anterior: Janela = {
    ini: new Date(janela.ini.getTime() - 7 * 86_400_000),
    fim: janela.ini,
  };

  const [linhas, linhasAnteriores] = await Promise.all([
    coletarJanela(janela),
    coletarJanela(anterior),
  ]);
  const relatorio = montarRelatorio(janela, linhas, linhasAnteriores);

  const { montarEmailCustoIA } = await import('./email');
  const { assunto, html } = montarEmailCustoIA(relatorio);

  const enviados: string[] = [];
  const falhas: { to: string; reason: string }[] = [];
  if (enviar) {
    const { enviarEmailPilula } = await import('@/lib/notifications/pilula-envio');
    for (const to of destinosDoRelatorio()) {
      const r = await enviarEmailPilula(to, assunto, html, { kind: 'custo_ia_semanal' });
      if (r.ok) enviados.push(to);
      else falhas.push({ to, reason: r.reason || 'desconhecido' });
    }
    // Relatório que não chega é relatório que não existe: o erro precisa
    // aparecer no log do cron, não só no retorno JSON que ninguém abre.
    if (falhas.length) {
      console.error('[custo-ia] envio falhou:', JSON.stringify(falhas));
    }
  }

  return {
    message:
      `custo IA ${rotuloPeriodo(relatorio)}: US$ ${relatorio.totalUsd.toFixed(2)} `
      + `(operação US$ ${relatorio.operacaoUsd.toFixed(2)} · P&D US$ ${relatorio.pdUsd.toFixed(2)}) · `
      + `${relatorio.empresas.length} tenant(s)`
      + (relatorio.plataforma ? ' + plataforma' : '')
      + (relatorio.pd.length ? ` · ${relatorio.pd.length} frente(s) de P&D` : '')
      + (enviar ? ` · enviado para ${enviados.length}/${enviados.length + falhas.length}` : ' · dry-run'),
    periodo: { ini: janela.ini.toISOString(), fim: janela.fim.toISOString() },
    totalUsd: relatorio.totalUsd,
    empresas: relatorio.empresas.length,
    enviados,
    falhas,
    relatorio,
  };
}
