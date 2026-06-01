'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { getSegmento, RADAR_DISCLAIMER } from '@/lib/radarempresas/segmentos';
import { CLASSIFICACAO_LABEL, type Classificacao } from '@/lib/radarempresas/score';
import type { RadarFiltros } from './busca';

async function audit(sb: any, action: string, meta: any) {
  const email = (await getAuthenticatedEmailFromAction()) || 'admin';
  await sb.from('radarempresas_audit_logs').insert({
    actor_email: email, action_type: action, target_table: 'radarempresas_listas',
    metadata_json: meta,
  });
  return email;
}

export async function listarListas() {
  const sb = await requireAdminSupabase();
  const { data } = await sb.from('radarempresas_listas')
    .select('*').order('created_at', { ascending: false });
  if (!data?.length) return [];
  const ids = data.map((l: any) => l.id);
  const { data: itens } = await sb.from('radarempresas_lista_itens')
    .select('lista_id, status').in('lista_id', ids);
  return data.map((l: any) => {
    const its = (itens || []).filter((i: any) => i.lista_id === l.id);
    return { ...l, total_itens: its.length,
      por_status: its.reduce((a: any, i: any) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {}) };
  });
}

export async function criarLista(input: { nome: string; descricao?: string; filtros?: RadarFiltros }) {
  const sb = await requireAdminSupabase('radar_empresas.access');
  if (!input.nome?.trim()) return { ok: false as const, error: 'Nome obrigatório' };
  const email = await audit(sb, 'criar_lista', { nome: input.nome });
  const { data, error } = await sb.from('radarempresas_listas')
    .insert({ nome: input.nome.trim(), descricao: input.descricao || null,
              owner_email: email, filters_json: input.filtros || null })
    .select('id').single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: (data as any).id };
}

/** Adiciona estabelecimentos a uma lista (idempotente via UK). */
export async function adicionarItens(listaId: string, estabelecimentoIds: string[]) {
  const sb = await requireAdminSupabase('radar_empresas.access');
  if (!estabelecimentoIds.length) return { ok: false as const, error: 'Nenhum item' };
  const rows = estabelecimentoIds.map(id => ({
    lista_id: listaId, estabelecimento_id: id, status: 'new',
  }));
  const { error } = await sb.from('radarempresas_lista_itens')
    .upsert(rows, { onConflict: 'lista_id,estabelecimento_id', ignoreDuplicates: true });
  if (error) return { ok: false as const, error: error.message };
  await audit(sb, 'add_itens_lista', { lista_id: listaId, n: rows.length });
  return { ok: true as const, adicionados: rows.length };
}

export async function atualizarStatusItem(itemId: string, status: string) {
  const sb = await requireAdminSupabase('radar_empresas.access');
  const { error } = await sb.from('radarempresas_lista_itens')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', itemId);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

const CSV_HEADER = [
  'cnpj', 'razao_social', 'nome_fantasia', 'municipio', 'uf', 'cnae',
  'segmento', 'subsegmento', 'porte', 'capital_social', 'score_total',
  'classificacao', 'priority_rank', 'score_confidence', 'actionability',
  'email', 'telefone', 'status_lead',
];

function toCsvLine(vals: any[]): string {
  return vals.map(v => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';');
}

// Monta as linhas de export (arrays na ordem de CSV_HEADER), ordenadas
// por priority_rank. Fonte: lista (listaId) OU filtro da busca.
async function montarExport(
  sb: any, src: { listaId?: string; filtros?: RadarFiltros },
): Promise<{ ok: true; rows: any[][]; n: number } | { ok: false; error: string }> {
  let estIds: string[] | null = null;
  let statusMap = new Map<string, string>();
  if (src.listaId) {
    const { data: itens } = await sb.from('radarempresas_lista_itens')
      .select('estabelecimento_id, status').eq('lista_id', src.listaId);
    if (!itens?.length) return { ok: false, error: 'Lista vazia' };
    estIds = (itens as any[]).map(i => i.estabelecimento_id);
    statusMap = new Map((itens as any[]).map(i => [i.estabelecimento_id, i.status]));
  }

  let q = sb.from('radarempresas_estabelecimentos')
    .select('id, cnpj_completo, nome_fantasia, municipio_nome, uf, cnae_principal, cnpj_basico');
  if (estIds) q = q.in('id', estIds);
  else {
    const f = src.filtros || {};
    if (f.uf) q = q.eq('uf', f.uf);
    if (f.municipio) q = q.ilike('municipio_nome', `%${f.municipio}%`);
    q = q.limit(20000); // teto de export por filtro
  }
  const { data: ests } = await q;
  if (!ests?.length) return { ok: false, error: 'Sem registros' };

  const ids = (ests as any[]).map((e: any) => e.id);
  const basicos = [...new Set((ests as any[]).map((e: any) => e.cnpj_basico))];
  const [{ data: scores }, { data: emps }] = await Promise.all([
    sb.from('radarempresas_scores').select('estabelecimento_id, score_total, classificacao, priority_rank, score_confidence, commercial_actionability, score_explanation').in('estabelecimento_id', ids),
    sb.from('radarempresas_empresas').select('cnpj_basico, razao_social, porte_empresa, capital_social').in('cnpj_basico', basicos),
  ]);
  const scMap = new Map((scores || []).map((s: any) => [s.estabelecimento_id, s]));
  const empMap = new Map((emps || []).map((e: any) => [e.cnpj_basico, e]));
  const f = src.filtros || {};

  const rows = (ests as any[]).map((e: any) => {
    const sc = scMap.get(e.id) as any; const emp = empMap.get(e.cnpj_basico) as any;
    const segKey = sc?.score_explanation?.segmento_key;
    return {
      _ord: sc?.priority_rank ?? -1,
      _passa: (!f.segmento_key || segKey === f.segmento_key)
        && (!f.classificacao || sc?.classificacao === f.classificacao)
        && (f.score_min == null || (sc?.score_total ?? -1) >= f.score_min)
        && (!f.priorizados || (sc?.priority_rank ?? -1) >= 90)
        && (!f.porte || emp?.porte_empresa === f.porte),
      v: [
        e.cnpj_completo, emp?.razao_social || '', e.nome_fantasia || '',
        e.municipio_nome || '', e.uf || '', e.cnae_principal || '',
        segKey ? (getSegmento(segKey)?.nome || segKey) : '',
        sc?.score_explanation?.subsegmento || '', emp?.porte_empresa || '',
        emp?.capital_social ?? '', sc?.score_total ?? '',
        sc?.classificacao ? CLASSIFICACAO_LABEL[sc.classificacao as Classificacao] : '',
        sc?.priority_rank ?? '', sc?.score_confidence || '',
        sc?.commercial_actionability ?? '', '', '',
        src.listaId ? (statusMap.get(e.id) || 'new') : '',
      ],
    };
  }).filter((r: any) => src.listaId || r._passa)
    .sort((a: any, b: any) => b._ord - a._ord)
    .map((r: any) => r.v);

  return { ok: true, rows, n: rows.length };
}

async function auditExport(sb: any, kind: string, src: any, n: number) {
  await sb.from('radarempresas_audit_logs').insert({
    actor_email: (await getAuthenticatedEmailFromAction()) || 'admin',
    action_type: kind,
    metadata_json: { fonte: src.listaId ? 'lista' : 'filtro', n },
  });
}

/** Export CSV (string). Client faz o download. */
export async function exportarCSV(
  src: { listaId?: string; filtros?: RadarFiltros },
): Promise<{ ok: true; csv: string; n: number } | { ok: false; error: string }> {
  const sb = await requireAdminSupabase('exports.run');
  const r = await montarExport(sb, src);
  if (r.ok === false) return r;
  const csv = [
    `# ${RADAR_DISCLAIMER}`,
    CSV_HEADER.join(';'),
    ...r.rows.map(v => toCsvLine(v)),
  ].join('\n');
  await auditExport(sb, 'export_csv', src, r.n);
  return { ok: true, csv, n: r.n };
}

/** Export XLSX (base64). Client decodifica → Blob → download. */
export async function exportarXLSX(
  src: { listaId?: string; filtros?: RadarFiltros },
): Promise<{ ok: true; base64: string; n: number } | { ok: false; error: string }> {
  const sb = await requireAdminSupabase('exports.run');
  const r = await montarExport(sb, src);
  if (r.ok === false) return r;

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Radar Empresas');
  ws.addRow([RADAR_DISCLAIMER]);
  ws.mergeCells(1, 1, 1, CSV_HEADER.length);
  ws.getRow(1).font = { italic: true, size: 9, color: { argb: 'FF888888' } };
  const head = ws.addRow(CSV_HEADER);
  head.font = { bold: true };
  head.eachCell((c: any) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2B54' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  for (const v of r.rows) ws.addRow(v);
  ws.views = [{ state: 'frozen', ySplit: 2 }];
  ws.columns.forEach((col: any, i: number) => { col.width = [18, 34, 28, 16, 6, 10, 22, 20, 8, 14, 8, 16, 8, 10, 8, 16, 16, 12][i] || 14; });

  const buf = await wb.xlsx.writeBuffer();
  await auditExport(sb, 'export_xlsx', src, r.n);
  return { ok: true, base64: Buffer.from(buf as any).toString('base64'), n: r.n };
}
