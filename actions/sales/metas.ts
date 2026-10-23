'use server';

// Portal do Representante — metas (Anexo IV), ajuda de custo e provisão da
// indenização (cláusula 19). Regras em lib/sales/metas.ts.
//
//   • O admin grava a meta do período e a remuneração fixa de cada RC. A meta não
//     muda depois que o período começa (9.10).
//   • O RC lê a própria meta, o progresso e a provisão sobre as comissões pagas.
//     A ajuda de custo é só do admin (decisão do dono de 23/10/2026): ela entra na
//     base da indenização (19.3), mas o valor não vai ao portal do RC.
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireCommercialAdminAction, requireRepresentativeAction } from '@/lib/sales/permissions';
import { pipelineQualificado } from '@/lib/sales/kpis';
import { dataBRT } from '@/lib/dre/semana';
import { logAdminAction } from '@/lib/audit';
import {
  mesesCompletos, metaEditavel, progressoDaMeta, provisaoDeIndenizacao,
  type Meta, type ProgressoDaMeta, type PropostaAceita, type Provisao,
} from '@/lib/sales/metas';
import type { SalesOpportunity } from '@/lib/sales/types';

type Sb = ReturnType<typeof createSupabaseAdmin>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

const numero = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

/** A meta do período em curso (a mais recente que já começou) ou a próxima, se nenhuma começou. */
function metaVigente(metas: (Meta & { id: string })[], hoje: Date): (Meta & { id: string }) | null {
  const dia = dataBRT(hoje);
  const ordenadas = [...metas].sort((a, b) => a.periodo_inicio.localeCompare(b.periodo_inicio));
  const iniciadas = ordenadas.filter((m) => m.periodo_inicio <= dia);
  return iniciadas[iniciadas.length - 1] ?? ordenadas[0] ?? null;
}

async function lerResultados(sb: Sb, representanteId: string) {
  const [metas, aceitas, comissoes, opps] = await Promise.all([
    sb.from('sales_metas').select('*').eq('representante_id', representanteId),
    sb.from('sales_proposals').select('total_contract_value, accepted_recorded_at, carteira')
      .eq('representante_id', representanteId).eq('status', 'accepted'),
    sb.from('sales_commission_events').select('amount').eq('representante_id', representanteId).eq('status', 'paid'),
    sb.from('sales_opportunities').select('status, stage, quality_score, estimated_value, attribution_status').eq('representante_id', representanteId).eq('status', 'open'),
  ]);
  for (const r of [metas, aceitas, comissoes, opps]) if (r.error) throw new Error(r.error.message);
  return {
    metas: (metas.data || []) as (Meta & { id: string })[],
    aceitas: (aceitas.data || []) as PropostaAceita[],
    comissoesPagas: ((comissoes.data || []) as { amount: number }[]).reduce((s, e) => s + (Number(e.amount) || 0), 0),
    pipelineQualificado: pipelineQualificado((opps.data || []) as SalesOpportunity[]),
  };
}

export type MetaDoRc = {
  meta: (Meta & { id: string }) | null;
  progresso: ProgressoDaMeta | null;
  pipelineQualificadoAtual: number;
  editavel: boolean;
};

/** A meta do RC logado, o progresso e a provisão sobre as comissões pagas (sem a ajuda de custo). */
export async function getMinhaMeta() {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  try {
    const r = await lerResultados(sb, ctx.rep.id);
    const hoje = new Date();
    const meta = metaVigente(r.metas, hoje);
    return {
      success: true as const,
      meta,
      progresso: meta ? progressoDaMeta(meta, r.aceitas, hoje) : null,
      pipelineQualificadoAtual: r.pipelineQualificado,
      // Só as comissões: a ajuda de custo também entra na base (19.3), mas o valor é do admin.
      provisaoSobreComissoes: provisaoDeIndenizacao(r.comissoesPagas, null, 0).provisao,
    };
  } catch (e: any) {
    return { success: false as const, error: `Não foi possível ler a meta: ${e?.message || 'erro de leitura'}` };
  }
}

export type LinhaMetasAdmin = MetaDoRc & {
  representanteId: string;
  nome: string;
  status: string;
  modelo: string;
  remuneracao: { ajuda_custo_mensal: number | null; contrato_inicio: string | null } | null;
  provisao: Provisao;
};

/** Metas, progresso, remuneração e provisão de cada RC (só admin). */
export async function getMetasAdmin() {
  await requireCommercialAdminAction(false);
  const sb = createSupabaseAdmin();
  const [reps, remuneracoes] = await Promise.all([
    sb.from('sales_representatives').select('id, name, status, compensation_model').order('name'),
    sb.from('sales_remuneracao_rc').select('representante_id, ajuda_custo_mensal, contrato_inicio'),
  ]);
  if (reps.error) return { success: false as const, error: reps.error.message };
  if (remuneracoes.error) return { success: false as const, error: remuneracoes.error.message };
  const hoje = new Date();
  try {
    const linhas: LinhaMetasAdmin[] = await Promise.all(((reps.data || []) as any[]).map(async (rep) => {
      const r = await lerResultados(sb, rep.id);
      const meta = metaVigente(r.metas, hoje);
      const rem = ((remuneracoes.data || []) as any[]).find((x) => x.representante_id === rep.id) ?? null;
      const meses = rem?.contrato_inicio ? mesesCompletos(rem.contrato_inicio, hoje) : 0;
      return {
        representanteId: rep.id,
        nome: rep.name,
        status: rep.status,
        modelo: rep.compensation_model,
        meta,
        progresso: meta ? progressoDaMeta(meta, r.aceitas, hoje) : null,
        pipelineQualificadoAtual: r.pipelineQualificado,
        editavel: meta ? metaEditavel(meta.periodo_inicio, hoje) : true,
        remuneracao: rem ? { ajuda_custo_mensal: rem.ajuda_custo_mensal, contrato_inicio: rem.contrato_inicio } : null,
        provisao: provisaoDeIndenizacao(r.comissoesPagas, rem?.ajuda_custo_mensal ?? null, meses),
      };
    }));
    return { success: true as const, linhas };
  } catch (e: any) {
    return { success: false as const, error: `Não foi possível ler as metas: ${e?.message || 'erro de leitura'}` };
  }
}

/**
 * Grava a meta de um período (Anexo IV). Período novo entra a qualquer momento;
 * o que já começou não muda (9.10: fixada antes do início, inalterada durante).
 */
export async function salvarMeta(input: {
  representanteId: string; periodoInicio: string; metaAnual: unknown;
  marcoT1?: unknown; marcoT2?: unknown; marcoT3?: unknown; ativacaoPipeline?: unknown; primeiroContratoMeses?: unknown;
}) {
  const admin = await requireCommercialAdminAction(true);
  if (!UUID_RE.test(String(input?.representanteId || ''))) return { success: false as const, error: 'Representante inválido' };
  const inicio = String(input?.periodoInicio || '').slice(0, 10);
  if (!DATA_RE.test(inicio)) return { success: false as const, error: 'Informe o início do período (a assinatura do contrato)' };
  const meta_anual = numero(input.metaAnual);
  const marcos = [numero(input.marcoT1), numero(input.marcoT2), numero(input.marcoT3)];
  const ativacao_pipeline = numero(input.ativacaoPipeline);
  const meses = input.primeiroContratoMeses === '' || input.primeiroContratoMeses == null ? null : Number(input.primeiroContratoMeses);
  if (meta_anual == null || Number.isNaN(meta_anual) || meta_anual <= 0) return { success: false as const, error: 'Informe a meta anual' };
  if ([...marcos, ativacao_pipeline].some((v) => Number.isNaN(v))) return { success: false as const, error: 'Os valores não podem ser negativos' };
  if (meses != null && (!Number.isInteger(meses) || meses < 1 || meses > 12)) return { success: false as const, error: 'O prazo do 1º contrato vai de 1 a 12 meses' };
  // Marcos ACUMULADOS: cada um no mínimo o anterior, e o anual por último.
  const sequencia = [...marcos.filter((v): v is number => v != null), meta_anual];
  if (sequencia.some((v, i) => i > 0 && v < sequencia[i - 1])) return { success: false as const, error: 'Os marcos são acumulados: cada trimestre não pode ser menor que o anterior, e o anual é o maior' };

  const sb = createSupabaseAdmin();
  const { data: existente, error: erroLeitura } = await sb.from('sales_metas').select('id')
    .eq('representante_id', input.representanteId).eq('periodo_inicio', inicio).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (existente && !metaEditavel(inicio)) {
    return { success: false as const, error: 'Este período já começou: a meta não muda durante o período (cláusula 9.10). A do próximo período é comunicada com 30 dias de antecedência.' };
  }
  const linha = {
    representante_id: input.representanteId,
    periodo_inicio: inicio,
    meta_anual,
    marco_t1: marcos[0], marco_t2: marcos[1], marco_t3: marcos[2],
    ativacao_pipeline,
    primeiro_contrato_meses: meses,
    atualizado_por: admin.email,
    atualizado_em: new Date().toISOString(),
  };
  const { error } = existente
    ? await sb.from('sales_metas').update(linha).eq('id', existente.id)
    : await sb.from('sales_metas').insert(linha);
  if (error) return { success: false as const, error: error.message };
  await logAdminAction({ adminEmail: admin.email, acao: 'sales_meta.salvar', alvo: input.representanteId, detalhes: linha });
  return { success: true as const };
}

/** Ajuda de custo e início do contrato do RC (só admin; base da provisão de 1/12). */
export async function salvarRemuneracao(input: { representanteId: string; ajudaCustoMensal: unknown; contratoInicio: string | null }) {
  const admin = await requireCommercialAdminAction(true);
  if (!UUID_RE.test(String(input?.representanteId || ''))) return { success: false as const, error: 'Representante inválido' };
  const ajuda = numero(input.ajudaCustoMensal);
  if (Number.isNaN(ajuda)) return { success: false as const, error: 'A ajuda de custo não pode ser negativa' };
  const inicio = input.contratoInicio ? String(input.contratoInicio).slice(0, 10) : null;
  if (inicio && !DATA_RE.test(inicio)) return { success: false as const, error: 'Data de início do contrato inválida' };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('sales_remuneracao_rc').upsert({
    representante_id: input.representanteId,
    ajuda_custo_mensal: ajuda,
    contrato_inicio: inicio,
    atualizado_por: admin.email,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'representante_id' });
  if (error) return { success: false as const, error: error.message };
  await logAdminAction({ adminEmail: admin.email, acao: 'sales_remuneracao.salvar', alvo: input.representanteId, detalhes: { ajuda_custo_mensal: ajuda, contrato_inicio: inicio } });
  return { success: true as const };
}
