'use server';
/**
 * Relatório de Adequação ao Cargo — match dos colaboradores de um cargo com o
 * PERFIL IDEAL (gabarito). Agrega (lib/adequacao-cargo/aggregate) → narrativa IA
 * opcional (lib/adequacao-cargo/narrative) → PDF (lib/adequacao-cargo-pdf) →
 * bucket PRIVADO → caminho + link da rota que autoriza no clique.
 */
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { aggregateAdequacao } from '@/lib/adequacao-cargo/aggregate';
import { renderAdequacaoCargoPDF } from '@/lib/adequacao-cargo-pdf';
import {
  hrefRelatorio,
  interpretarRefRelatorio,
  rotuloCargo,
  salvarRelatorio,
} from '@/lib/relatorios/relatorio-privado';

/** Cargos da empresa que TÊM gabarito (perfil ideal) — alimenta o seletor da UI. */
export async function listarCargosComGabarito(empresaId: string): Promise<{ cargos: string[] }> {
  try {
    const sb = await requireEmpresaSupabase(empresaId, 'admin.access', 'listarCargosComGabarito');
    const { data } = await sb.from('cargos_empresa')
      .select('nome, gabarito').eq('empresa_id', empresaId).eq('eh_vaga', false);
    const cargos = (data || [])
      .filter((c: any) => c.gabarito?.tela4)
      .map((c: any) => c.nome)
      .sort((a: string, b: string) => a.localeCompare(b));
    return { cargos };
  } catch {
    return { cargos: [] };
  }
}

export async function gerarRelatorioAdequacao(
  empresaId: string,
  cargo: string,
  opts: { comAnaliseIA?: boolean; poolCompleto?: boolean; poolCargos?: string[] } = {},
): Promise<{ success: boolean; url?: string; caminho?: string; avaliados?: number; error?: string }> {
  try {
    if (!empresaId || !cargo) return { success: false, error: 'Empresa e cargo são obrigatórios.' };
    const sb = await requireEmpresaSupabase(empresaId, 'admin.access', 'gerarRelatorioAdequacao');
    const { data: emp } = await sb.from('empresas').select('id, nome').eq('id', empresaId).maybeSingle();
    if (!emp) return { success: false, error: 'Empresa não encontrada.' };

    const data = await aggregateAdequacao(sb, empresaId, cargo, { poolCompleto: opts.poolCompleto, poolCargos: opts.poolCargos });
    if (data.semGabarito) return { success: false, error: `"${cargo}" ainda não tem perfil ideal (gabarito). Gere o perfil primeiro.` };
    if (data.semColaboradores) return { success: false, error: opts.poolCompleto ? 'Nenhum candidato com mapeamento comportamental (DISC) na base. Importe candidatos e capture o DISC antes de avaliar.' : `Nenhum colaborador do cargo "${cargo}" tem mapeamento comportamental (DISC). Sem dados para o relatório.` };

    const narrativas = opts.comAnaliseIA
      ? await (await import('@/lib/adequacao-cargo/narrative')).gerarNarrativasAdequacao(data).catch(() => ({}))
      : {};

    // renderInput = o RESULTADO renderizável completo. É o que vira PDF E snapshot.
    const renderInput = { data, empresaNome: emp.nome, dataISO: new Date().toISOString(), narrativas };
    const buffer = await renderAdequacaoCargoPDF(renderInput);
    // R-74: PDF e snapshot nomeiam pessoas (ranking por cargo). Vão para o bucket
    // PRIVADO, em `{empresaId}/adequacao-cargo/{cargo}-{ts}`, e a tela recebe a
    // rota que autoriza no clique, nunca uma URL pública.
    const base = `${rotuloCargo(cargo)}-${Date.now()}`;
    const pdf = await salvarRelatorio(sb.storage, empresaId, 'adequacao-cargo', `${base}.pdf`, Buffer.from(buffer), 'application/pdf');
    if ('erro' in pdf) return { success: false, error: 'Falha ao salvar o PDF: ' + pdf.erro };
    // SNAPSHOT p/ reprodução (gatilho: TODA geração). Grava o renderInput já assado ao
    // lado do PDF. Reproduzir um relatório = reRenderAdequacaoFromSnapshot(este .json),
    // SEM tocar no motor → mesmo candidato nunca muda de status entre versões da régua.
    // Pega as 3 dimensões (régua+gabarito+código) de graça, pois é o output, não o input.
    // Best-effort: falha não derruba a entrega do PDF, mas fica no log (sem o
    // snapshot o cargo não aparece no ranking do RH).
    const snap = await salvarRelatorio(sb.storage, empresaId, 'adequacao-cargo', `${base}.json`, Buffer.from(JSON.stringify(renderInput)), 'application/json');
    if ('erro' in snap) console.error('[adequacao-cargo] snapshot não salvo:', snap.erro);

    return { success: true, url: hrefRelatorio(pdf.caminho), caminho: pdf.caminho, avaliados: data.avaliados };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao gerar o Relatório de Adequação ao Cargo.' };
  }
}

/**
 * REPRODUZ um relatório a partir do SNAPSHOT gravado (`.json` ao lado do `.pdf`),
 * sem recomputar nada. Serve o resultado já assado → o relatório reproduzido é
 * idêntico ao entregue, mesmo que a régua/gabarito/código tenham evoluído. NÃO
 * chama aggregateAdequacao nem nenhum módulo do motor: só baixa o JSON e re-renderiza
 * (reRenderAdequacaoFromSnapshot vive no módulo PDF, livre de motor).
 *
 * `jsonPath` = caminho do snapshot: o novo (`{empresaId}/adequacao-cargo/{nome}.json`,
 * bucket privado) ou o antigo (`final/adequacao-cargo/{empresaId}-{nome}.json`).
 * Qualquer outro caminho é recusado: antes do R-74 a action baixava o que o
 * cliente pedisse do bucket `conteudos`.
 */
export async function reproduzirRelatorioAdequacao(
  jsonPath: string,
): Promise<{ success: boolean; url?: string; caminho?: string; error?: string }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const ref = interpretarRefRelatorio(jsonPath);
    if (!ref || ref.tipo !== 'adequacao-cargo' || !ref.nome.endsWith('.json')) {
      return { success: false, error: 'Caminho de snapshot inválido.' };
    }
    const dl = await sb.storage.from(ref.bucket).download(ref.caminho);
    if (dl.error || !dl.data) return { success: false, error: 'Snapshot não encontrado: ' + jsonPath };
    const snapshot = await dl.data.text();
    const { reRenderAdequacaoFromSnapshot } = await import('@/lib/adequacao-cargo-pdf');
    const buffer = await reRenderAdequacaoFromSnapshot(snapshot); // PURO: snapshot → PDF
    const nome = ref.nome.replace(/\.json$/, '') + `-repro-${Date.now()}.pdf`;
    const up = await salvarRelatorio(sb.storage, ref.empresaId, 'adequacao-cargo', nome, Buffer.from(buffer), 'application/pdf');
    if ('erro' in up) return { success: false, error: 'Falha ao salvar o PDF reproduzido: ' + up.erro };
    return { success: true, url: hrefRelatorio(up.caminho), caminho: up.caminho };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao reproduzir o relatório do snapshot.' };
  }
}
