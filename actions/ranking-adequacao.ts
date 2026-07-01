'use server';
/**
 * Ranking de Adequação ao Cargo — VIEW pura sobre o SNAPSHOT (self-service do gestor).
 *
 * NÃO recomputa o motor: lê o `.json` assado gravado por geração (reprodução = servir o
 * resultado entregue). Engine-free: importa zero de lib/scoring. Eixo discriminante e
 * divergência saem do próprio snapshot (perfilIdeal.pesos + fit por bloco). Permissão:
 * reports.individual.view (indivíduos nomeados = alto risco). Escopo: empresa do gestor.
 */
import { getUserContext } from '@/lib/authz';
import { canBase } from '@/lib/permissions';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminSupabase } from '@/lib/admin-supabase';

// O snapshot grava pesos[].bloco como LABEL acentuado ("Competência"), não a key.
// Tudo aqui é keyed por LABEL pra casar com o snapshot.
const BLOCOS = ['Competência', 'Liderança', 'DISC', 'Mapeamento'] as const;
const BLOCO_PESSOA: Record<string, 'competencia' | 'lideranca' | 'discScore' | 'mapeamento'> = { 'Competência': 'competencia', 'Liderança': 'lideranca', 'DISC': 'discScore', 'Mapeamento': 'mapeamento' };
const sd = (a: number[]) => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

async function ctxGestor() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { erro: 'Não autenticado.' as const };
  const ctx = await getUserContext(email);
  if (!canBase(ctx, 'reports.individual.view')) return { erro: 'Sem permissão para ver relatórios individuais.' as const };
  const empresaId = ctx?.colaborador?.empresa_id;
  if (!empresaId) return { erro: 'Gestor sem empresa vinculada.' as const };
  return { empresaId, ctx };
}

const cargoEnc = (c: string) => encodeURIComponent(c).replace(/%/g, '');

// ── Núcleo compartilhado (gestor self-service E preview de admin) ────────────
async function _listarCargos(sb: any, empresaId: string): Promise<string[]> {
  const { data: cargos } = await sb.from('cargos_empresa').select('nome, gabarito').eq('empresa_id', empresaId).eq('eh_vaga', false);
  const comGab = (cargos || []).filter((c: any) => c.gabarito?.tela4).map((c: any) => c.nome);
  const { data: files } = await sb.storage.from('conteudos').list('final/adequacao-cargo', { limit: 1000, search: empresaId });
  const nomes: string[] = (files || []).map((f: any) => String(f.name));
  return comGab.filter((nome: string) => nomes.some((fn) => fn.startsWith(`${empresaId}-${cargoEnc(nome)}-`) && fn.endsWith('.json'))).sort((a: string, b: string) => a.localeCompare(b));
}

/** Cargos da empresa que TÊM snapshot de ranking (relatório gerado) — GESTOR. */
export async function listarCargosComRanking(): Promise<{ cargos: string[]; erro?: string }> {
  const g = await ctxGestor(); if ('erro' in g) return { cargos: [], erro: g.erro };
  return { cargos: await _listarCargos(createSupabaseAdmin(), g.empresaId) };
}
/** Idem — PREVIEW de admin (empresa vem da rota, gated p/ platform_admin). */
export async function listarCargosComRankingAdmin(empresaId: string): Promise<{ cargos: string[]; erro?: string }> {
  const sb = await requireAdminSupabase('admin.access');
  return { cargos: await _listarCargos(sb, empresaId) };
}

async function ultimoSnapshot(sb: any, empresaId: string, cargo: string): Promise<any | null> {
  const { data: files } = await sb.storage.from('conteudos').list('final/adequacao-cargo', { limit: 1000, search: empresaId });
  const pref = `${empresaId}-${cargoEnc(cargo)}-`;
  const jsons = (files || []).filter((f: any) => f.name.startsWith(pref) && f.name.endsWith('.json'))
    .map((f: any) => ({ name: f.name, ts: Number(f.name.slice(pref.length, -'.json'.length)) || 0 }))
    .sort((a: any, b: any) => b.ts - a.ts);
  if (!jsons.length) return null;
  const dl = await sb.storage.from('conteudos').download(`final/adequacao-cargo/${jsons[0].name}`);
  if (dl.error || !dl.data) return null;
  const parsed = JSON.parse(await dl.data.text());
  if (parsed && typeof parsed === 'object') parsed.__ts = jsons[0].ts;
  return parsed;
}

function gateTexto(e: any): string {
  return e.ehBloco ? `${e.traco} ${Math.round(e.medidoPct ?? 0)}% < ${Math.round(e.minPct ?? 0)}%` : `${e.traco} ${e.valorBruto} < ${e.piso}`;
}

const blocosDe = (p: any): Record<string, number | null> => ({
  'Competência': p.competencia?.pct ?? null,
  'Liderança': p.lideranca?.excluido ? null : (p.lideranca?.pct ?? null),
  'DISC': p.discScore?.pct ?? null,
  'Mapeamento': p.mapeamento?.pct ?? null,
});

// Eixo (bloco de maior peso) + divergência (o peso não separa este pool?). Compartilhado
// pela tela (_getRanking) e pelo PDF (_exportarPDF): mesma fonte, mesma decisão de eixo.
function _eixoDivergencia(pesos: { bloco: string; pct: number }[], elegiveisBlocos: Record<string, number | null>[]) {
  const eixoBloco = [...pesos].sort((a, b) => b.pct - a.pct)[0]?.bloco || 'Competência';
  const eixoPeso = pesos.find((p) => p.bloco === eixoBloco)?.pct ?? null;
  const varPorBloco = BLOCOS.map((b) => {
    const vals = elegiveisBlocos.map((x) => x[b]).filter((v): v is number => v != null);
    return { bloco: b as string, sd: vals.length ? sd(vals) : 0 };
  });
  const sdEixo = varPorBloco.find((v) => v.bloco === eixoBloco)?.sd ?? 0;
  const maisVaria = [...varPorBloco].filter((v) => v.sd > 0).sort((a, b) => b.sd - a.sd)[0];
  const divergencia = sdEixo < 4 && maisVaria && maisVaria.bloco !== eixoBloco && maisVaria.sd >= 4
    ? { eixo: eixoBloco, real: maisVaria.bloco, sdEixo: Math.round(sdEixo * 10) / 10 }
    : null;
  const sep = divergencia?.real || eixoBloco;
  return { eixoBloco, eixoPeso, sep, divergencia };
}

async function _getRanking(sb: any, empresaId: string, cargo: string): Promise<any> {
  const snap = await ultimoSnapshot(sb, empresaId, cargo);
  if (!snap?.data) return { success: false, semSnapshot: true, error: 'Ranking ainda não disponível para este cargo (relatório não gerado).' };
  const data = snap.data;
  const temTracos = data.pessoas?.[0] && Array.isArray(data.pessoas[0].tracos);

  const pesos: { bloco: string; pct: number }[] = data.perfilIdeal?.pesos || [];
  const elegiveis = (data.pessoas || []).filter((p: any) => p.status !== 'bloqueado').map((p: any) => ({
    id: p.id || p.nome, nome: p.nome,
    aderencia: p.beta?.pct ?? 0, status: p.status, statusLabel: p.statusLabel,
    borderline: !!p.borderline, semDelta: p.betaSemDelta,
    blocos: blocosDe(p),
    drivers: (p.gaps || []).map((x: any) => x.traco),
    disc: p.disc || [],
  }));
  // ANEXO de gate (TRAVA 1): bloqueados FORA do array ordenável; aderência NÃO exibida.
  const anexoGate = (data.pessoas || []).filter((p: any) => p.status === 'bloqueado').map((p: any) => ({
    id: p.id || p.nome, nome: p.nome,
    gates: (p.knockoutEvidencias || []).map(gateTexto),
    origem: p.origemBloqueioLabel || null,
  }));

  const { eixoBloco, eixoPeso, divergencia } = _eixoDivergencia(pesos, elegiveis.map((e: any) => e.blocos));
  const driversDisponiveis = Array.from(new Set(elegiveis.flatMap((e: any) => e.drivers))).sort();

  return {
    success: true, cargo, dataISO: snap.dataISO || null, temTracos,
    eixo: { bloco: eixoBloco, label: eixoBloco, peso: eixoPeso },
    faixas: data.perfilIdeal?.faixas || null,
    divergencia, pesos, elegiveis, anexoGate, driversDisponiveis,
    totais: { elegiveis: elegiveis.length, bloqueados: anexoGate.length },
  };
}

// ── EXPORT PDF (VIEW pura do snapshot; passa pessoas COMPLETAS ao template) ────
async function _exportarPDF(sb: any, empresaId: string, cargo: string): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const snap = await ultimoSnapshot(sb, empresaId, cargo);
  if (!snap?.data) return { success: false, error: 'Ranking ainda não disponível para este cargo (relatório não gerado).' };
  const data = snap.data;
  const pesos: { bloco: string; pct: number }[] = data.perfilIdeal?.pesos || [];

  const elegiveisFull = (data.pessoas || []).filter((p: any) => p.status !== 'bloqueado');
  const anexo = (data.pessoas || []).filter((p: any) => p.status === 'bloqueado');
  const { eixoBloco, eixoPeso, sep, divergencia } = _eixoDivergencia(pesos, elegiveisFull.map(blocosDe));

  // Ordena por ADERÊNCIA (Beta) — o veredito candidato-vs-cargo, imune ao pool. Desempate
  // = o bloco que SEPARA (sep), que também vira o foco de leitura ao lado de cada nome.
  // NÃO ordena por sep: a variância de um bloco é propriedade de QUEM se inscreveu, e a
  // posição do candidato não pode depender disso (contestável em concurso). __sepFit/
  // __mortoFit ainda carimbam o chip do template.
  const eixoMorto = divergencia ? eixoBloco : null;
  const withFit = elegiveisFull.map((p: any) => { const b = blocosDe(p); return { ...p, __sepFit: b[sep], __mortoFit: eixoMorto ? b[eixoMorto] : null }; });
  withFit.sort((a: any, b: any) => (b.beta?.pct ?? -1) - (a.beta?.pct ?? -1) || (b.__sepFit ?? -1) - (a.__sepFit ?? -1));

  const { renderRankingAdequacaoPDF } = await import('@/lib/adequacao-cargo/ranking-pdf');
  const buffer = await renderRankingAdequacaoPDF({
    empresaNome: snap.empresaNome || data.empresaNome || '', cargo, dataISO: snap.dataISO || null,
    perfilIdeal: data.perfilIdeal,
    eixo: { label: eixoBloco, peso: eixoPeso },
    sep, divergencia,
    elegiveis: withFit, anexo,
    narrativas: snap.narrativas || {},
  });

  const path = `final/ranking-adequacao/${empresaId}-${cargoEnc(cargo)}-${snap.__ts || Date.now()}.pdf`;
  const up = await sb.storage.from('conteudos').upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (up.error) return { success: false, error: `Falha ao salvar PDF: ${up.error.message}` };
  const signed = await sb.storage.from('conteudos').createSignedUrl(path, 60 * 30);
  if (signed.error || !signed.data?.signedUrl) return { success: false, error: 'Falha ao gerar link do PDF.' };
  return { success: true, url: signed.data.signedUrl };
}

/** GESTOR — exporta o PDF do ranking (empresa da sessão). */
export async function exportarRankingPDF(cargo: string) {
  const g = await ctxGestor(); if ('erro' in g) return { success: false as const, error: g.erro };
  return _exportarPDF(createSupabaseAdmin(), g.empresaId, cargo);
}
/** ADMIN — exporta o PDF do ranking (empresa da rota, gated p/ platform_admin). */
export async function exportarRankingPDFAdmin(empresaId: string, cargo: string) {
  const sb = await requireAdminSupabase('admin.access');
  return _exportarPDF(sb, empresaId, cargo);
}

/** GESTOR self-service (empresa da sessão). */
export async function getRankingAdequacao(cargo: string): Promise<any> {
  const g = await ctxGestor(); if ('erro' in g) return { success: false, error: g.erro };
  return _getRanking(createSupabaseAdmin(), g.empresaId, cargo);
}
/** PREVIEW de admin (empresa da rota, gated p/ platform_admin). */
export async function getRankingAdequacaoAdmin(empresaId: string, cargo: string): Promise<any> {
  const sb = await requireAdminSupabase('admin.access');
  return _getRanking(sb, empresaId, cargo);
}
