'use server';
/**
 * Relatório de Adequação ao Cargo — match dos colaboradores de um cargo com o
 * PERFIL IDEAL (gabarito). Agrega (lib/adequacao-cargo/aggregate) → narrativa IA
 * opcional (lib/adequacao-cargo/narrative) → PDF (lib/adequacao-cargo-pdf) →
 * Storage → URL.
 */
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { aggregateAdequacao } from '@/lib/adequacao-cargo/aggregate';
import { renderAdequacaoCargoPDF } from '@/lib/adequacao-cargo-pdf';

/** Cargos da empresa que TÊM gabarito (perfil ideal) — alimenta o seletor da UI. */
export async function listarCargosComGabarito(empresaId: string): Promise<{ cargos: string[] }> {
  try {
    const sb = await requireEmpresaSupabase(empresaId, 'admin.access');
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
): Promise<{ success: boolean; url?: string; avaliados?: number; error?: string }> {
  try {
    if (!empresaId || !cargo) return { success: false, error: 'Empresa e cargo são obrigatórios.' };
    const sb = await requireEmpresaSupabase(empresaId, 'admin.access');
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
    const base = `final/adequacao-cargo/${empresaId}-${encodeURIComponent(cargo).replace(/%/g, '')}-${Date.now()}`;
    const { error: upErr } = await sb.storage.from('conteudos')
      .upload(`${base}.pdf`, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
    if (upErr) return { success: false, error: 'Falha ao salvar o PDF: ' + upErr.message };
    // SNAPSHOT p/ reprodução (gatilho: TODA geração). Grava o renderInput já assado ao
    // lado do PDF. Reproduzir um relatório = reRenderAdequacaoFromSnapshot(este .json),
    // SEM tocar no motor → mesmo candidato nunca muda de status entre versões da régua.
    // Pega as 3 dimensões (régua+gabarito+código) de graça, pois é o output, não o input.
    await sb.storage.from('conteudos')
      .upload(`${base}.json`, Buffer.from(JSON.stringify(renderInput)), { contentType: 'application/json', upsert: true })
      .catch(() => { /* snapshot é best-effort: falha não derruba a entrega do PDF */ });
    const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(`${base}.pdf`);

    return { success: true, url: publicUrl, avaliados: data.avaliados };
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
 * `jsonPath` = caminho do snapshot no bucket (o mesmo base do PDF, com `.json`).
 */
export async function reproduzirRelatorioAdequacao(
  jsonPath: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const dl = await sb.storage.from('conteudos').download(jsonPath);
    if (dl.error || !dl.data) return { success: false, error: 'Snapshot não encontrado: ' + jsonPath };
    const snapshot = await dl.data.text();
    const { reRenderAdequacaoFromSnapshot } = await import('@/lib/adequacao-cargo-pdf');
    const buffer = await reRenderAdequacaoFromSnapshot(snapshot); // PURO: snapshot → PDF
    const outPath = jsonPath.replace(/\.json$/, '') + `-repro-${Date.now()}.pdf`;
    const up = await sb.storage.from('conteudos').upload(outPath, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
    if (up.error) return { success: false, error: 'Falha ao salvar o PDF reproduzido: ' + up.error.message };
    const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(outPath);
    return { success: true, url: publicUrl };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao reproduzir o relatório do snapshot.' };
  }
}
