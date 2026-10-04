'use server';
/**
 * Ranking de Adequação ao Cargo — VIEW pura sobre o SNAPSHOT (self-service do RH).
 *
 * NÃO recomputa o motor: lê o `.json` assado gravado por geração (reprodução = servir o
 * resultado entregue). Engine-free: importa zero de lib/scoring. Eixo discriminante e
 * divergência saem do próprio snapshot (perfilIdeal.pesos + fit por bloco). Permissão:
 * Acesso exclusivo ao papel RH (indivíduos nomeados = alto risco). Escopo: empresa do RH.
 */
import { getUserContext } from '@/lib/authz';
import { blocoEstaOffline } from '@/lib/blocos-offline';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import {
  BUCKET_RELATORIOS,
  assinarRelatorio,
  listarArtefatosRelatorio,
  rotuloCargo,
  salvarRelatorio,
} from '@/lib/relatorios/relatorio-privado';

// O snapshot grava pesos[].bloco como LABEL acentuado ("Competência"), não a key.
// Tudo aqui é keyed por LABEL pra casar com o snapshot.
const BLOCOS = ['Competência', 'Liderança', 'DISC', 'Mapeamento'] as const;
const BLOCO_PESSOA: Record<string, 'competencia' | 'lideranca' | 'discScore' | 'mapeamento'> = { 'Competência': 'competencia', 'Liderança': 'lideranca', 'DISC': 'discScore', 'Mapeamento': 'mapeamento' };
const sd = (a: number[]) => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

async function ctxRh() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { erro: 'Não autenticado.' as const };
  const ctx = await getUserContext(email);
  if (ctx?.role !== 'rh') return { erro: 'Acesso exclusivo do RH.' as const };
  const empresaId = ctx.empresaId;
  if (!empresaId) return { erro: 'RH sem empresa vinculada.' as const };
  return { empresaId, ctx };
}

// ── Snapshots: bucket privado + pasta antiga (R-74) ──────────────────────────
// Os snapshots `.json` nomeiam pessoas. Desde o R-74 nascem no bucket PRIVADO
// (`relatorios-pdf/{empresaId}/adequacao-cargo/{cargo}-{ts}.json`); os gerados
// antes seguem em `conteudos/final/adequacao-cargo/{empresaId}-{cargo}-{ts}.json`
// até a migração. A leitura enxerga os dois, e o cargo casa pelo rótulo EXATO
// (antes um `startsWith` deixava "Professor" pegar o arquivo de "Professor-A").
async function snapshotsDaEmpresa(sb: any, empresaId: string) {
  const { artefatos, erros } = await listarArtefatosRelatorio(sb.storage, empresaId, 'adequacao-cargo', '.json');
  if (erros.length) console.error('[ranking-adequacao] listagem de snapshots:', erros.join(' | '));
  return { artefatos, falhou: erros.length > 0 && artefatos.length === 0 };
}

// ── Vagas da Seleção (lote 5b, 04/10/2026) ───────────────────────────────────
// O ranking do RH listava também as VAGAS (eh_vaga=true), que só existem na Seleção. A Seleção
// está OFF-LINE (`lib/blocos-offline.ts`, desde 31/08/2026; 2 vagas, ambas em projetomacae), então
// o cliente via, no produto "Ranking de Adequação", cargos de um bloco que não existe para ele.
// A regra é a do registro, não um `false` fixo: religar a Seleção (tirar a entrada de
// `BLOCOS_OFFLINE`) devolve as vagas à lista sem mexer aqui, e nenhum dado é apagado.
// O gate vale nos DOIS lugares que o registro exige: a lista (tela) e a leitura/export por nome
// de cargo (action), porque `'use server'` é endpoint e esconder a lista não fecha a leitura.
const vagasDaSelecaoVisiveis = () => !blocoEstaOffline('selecao');

const RANKING_NAO_GERADO = 'Ranking ainda não disponível para este cargo (relatório não gerado).';

/**
 * O cargo pedido é uma VAGA da Seleção que está escondida? Só pergunta ao banco quando o bloco
 * está off-line. Falha de leitura é falha FECHADA (não serve o ranking sem saber o que ele é).
 */
async function vagaEscondida(sb: any, empresaId: string, cargo: string): Promise<'sim' | 'nao' | 'erro'> {
  if (vagasDaSelecaoVisiveis()) return 'nao';
  const { data, error } = await sb.from('cargos_empresa')
    .select('eh_vaga').eq('empresa_id', empresaId).eq('nome', cargo).eq('eh_vaga', true).limit(1);
  if (error) {
    console.error('[ranking-adequacao] leitura do cargo:', error.message);
    return 'erro';
  }
  return (data || []).length > 0 ? 'sim' : 'nao';
}

// ── Núcleo compartilhado (RH self-service E preview de admin) ────────────────
async function _listarCargos(sb: any, empresaId: string, incluirVagas = false): Promise<string[]> {
  // incluirVagas: a tela de ranking do RH mostra também as VAGAS (eh_vaga=true) quando a Seleção
  // está no ar (numa empresa de seleção, só vagas, a tela viveria vazia). O cadastro segue separado.
  let cq = sb.from('cargos_empresa').select('nome, gabarito').eq('empresa_id', empresaId);
  if (!incluirVagas) cq = cq.eq('eh_vaga', false);
  const { data: cargos } = await cq;
  const comGab = (cargos || []).filter((c: any) => c.gabarito?.tela4).map((c: any) => c.nome);
  const { artefatos } = await snapshotsDaEmpresa(sb, empresaId);
  const rotulos = new Set(artefatos.map((a) => a.rotulo));
  return comGab.filter((nome: string) => rotulos.has(rotuloCargo(nome))).sort((a: string, b: string) => a.localeCompare(b));
}

/** Cargos da empresa que TÊM snapshot de ranking (relatório gerado) — RH. */
export async function listarCargosComRanking(): Promise<{ cargos: string[]; erro?: string }> {
  const g = await ctxRh(); if ('erro' in g) return { cargos: [], erro: g.erro };
  return { cargos: await _listarCargos(createSupabaseAdmin(), g.empresaId, vagasDaSelecaoVisiveis()) };
}
/** Idem — PREVIEW de admin (empresa vem da rota, gated p/ platform_admin). */
export async function listarCargosComRankingAdmin(empresaId: string): Promise<{ cargos: string[]; erro?: string }> {
  const sb = await requireAdminSupabase('admin.access');
  return { cargos: await _listarCargos(sb, empresaId) };
}

const LEITURA_INDISPONIVEL = 'Não foi possível ler o ranking agora. Tente novamente em instantes.';

async function ultimoSnapshot(sb: any, empresaId: string, cargo: string): Promise<{ snap: any | null; falhou: boolean }> {
  const { artefatos, falhou } = await snapshotsDaEmpresa(sb, empresaId);
  const rotulo = rotuloCargo(cargo);
  const ultimo = artefatos.find((a) => a.rotulo === rotulo);
  if (!ultimo) return { snap: null, falhou };
  const dl = await sb.storage.from(ultimo.bucket).download(ultimo.caminho);
  if (dl.error || !dl.data) {
    console.error('[ranking-adequacao] download do snapshot:', ultimo.caminho, dl.error?.message);
    return { snap: null, falhou: true };
  }
  const parsed = JSON.parse(await dl.data.text());
  if (parsed && typeof parsed === 'object') parsed.__ts = ultimo.ts;
  return { snap: parsed, falhou: false };
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
  const { snap, falhou } = await ultimoSnapshot(sb, empresaId, cargo);
  if (!snap?.data && falhou) return { success: false, error: LEITURA_INDISPONIVEL };
  if (!snap?.data) return { success: false, semSnapshot: true, error: RANKING_NAO_GERADO };
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

  return {
    success: true, cargo, dataISO: snap.dataISO || null, temTracos,
    eixo: { bloco: eixoBloco, label: eixoBloco, peso: eixoPeso },
    faixas: data.perfilIdeal?.faixas || null,
    divergencia, pesos, elegiveis, anexoGate,
    totais: { elegiveis: elegiveis.length, bloqueados: anexoGate.length },
  };
}

// ── EXPORT PDF (VIEW pura do snapshot; passa pessoas COMPLETAS ao template) ────
async function _exportarPDF(sb: any, empresaId: string, cargo: string): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const { snap, falhou } = await ultimoSnapshot(sb, empresaId, cargo);
  if (!snap?.data && falhou) return { success: false, error: LEITURA_INDISPONIVEL };
  if (!snap?.data) return { success: false, error: RANKING_NAO_GERADO };
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

  // R-74: o ranking é nominal. Ia para o bucket PÚBLICO `conteudos`, e o link
  // assinado de 30 min era decoração: a URL pública do mesmo objeto abria sem
  // sessão. Agora vai para o bucket PRIVADO, e o link (curto) é a única porta.
  // Quem chega aqui já passou pelo gate (RH da sessão ou admin da empresa).
  const up = await salvarRelatorio(sb.storage, empresaId, 'ranking-adequacao', `${rotuloCargo(cargo)}-${snap.__ts || Date.now()}.pdf`, buffer, 'application/pdf');
  if ('erro' in up) return { success: false, error: `Falha ao salvar PDF: ${up.erro}` };
  const assinado = await assinarRelatorio(sb.storage, { bucket: BUCKET_RELATORIOS, caminho: up.caminho });
  if ('erro' in assinado) return { success: false, error: 'Falha ao gerar link do PDF.' };
  return { success: true, url: assinado.url };
}

/** RH — exporta o PDF do ranking (empresa da sessão). */
export async function exportarRankingPDF(cargo: string) {
  const g = await ctxRh(); if ('erro' in g) return { success: false as const, error: g.erro };
  const sb = createSupabaseAdmin();
  // Vaga da Seleção off-line: mesma resposta de "ranking não gerado", sem confirmar que a vaga existe.
  const vaga = await vagaEscondida(sb, g.empresaId, cargo);
  if (vaga === 'erro') return { success: false as const, error: LEITURA_INDISPONIVEL };
  if (vaga === 'sim') return { success: false as const, error: RANKING_NAO_GERADO };
  return _exportarPDF(sb, g.empresaId, cargo);
}
/** ADMIN — exporta o PDF do ranking (empresa da rota, gated p/ platform_admin). */
export async function exportarRankingPDFAdmin(empresaId: string, cargo: string) {
  const sb = await requireEmpresaSupabase(empresaId, 'admin.access', 'exportarRankingPDFAdmin');
  return _exportarPDF(sb, empresaId, cargo);
}

/** RH self-service (empresa da sessão). */
export async function getRankingAdequacao(cargo: string): Promise<any> {
  const g = await ctxRh(); if ('erro' in g) return { success: false, error: g.erro };
  const sb = createSupabaseAdmin();
  const vaga = await vagaEscondida(sb, g.empresaId, cargo);
  if (vaga === 'erro') return { success: false, error: LEITURA_INDISPONIVEL };
  if (vaga === 'sim') return { success: false, semSnapshot: true, error: RANKING_NAO_GERADO };
  return _getRanking(sb, g.empresaId, cargo);
}
/** PREVIEW de admin (empresa da rota, gated p/ platform_admin). */
export async function getRankingAdequacaoAdmin(empresaId: string, cargo: string): Promise<any> {
  const sb = await requireAdminSupabase('admin.access');
  return _getRanking(sb, empresaId, cargo);
}
