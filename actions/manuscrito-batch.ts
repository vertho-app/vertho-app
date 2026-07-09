'use server';

/**
 * Import de manuscrito autoral (DOCX) → Módulos-Base, em LOTE.
 *
 * Duas etapas, de propósito:
 *  1. `analisarManuscrito` — parse determinístico + resolução dos descritores no
 *     catálogo. **Custo zero, nenhuma chamada de IA.** É o preview que o admin vê
 *     antes de comprometer o custo do lote.
 *  2. `enqueueManuscritoBatch` — cria o job em `ia_jobs` (fase='manuscrito') e
 *     dispara a task `gerar-modulos-manuscrito` (Batch API, −50%).
 *
 * Reusa `ia_jobs` (mig 172), que já nasceu com `fase` aberto a outras fases —
 * não há tabela nova. O polling da tela é o `statusIAJob`/`cancelIAJob` que o IA2
 * já expõe em `actions/ia-pipeline-batch`.
 *
 * Ver docs/EXTRACAO-MANUSCRITO.md.
 */
import { tasks } from '@trigger.dev/sdk';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { regionOpts } from '@/lib/trigger-region';
import { parsearManuscrito, TRANSICOES, type ManuscritoParseResult } from '@/lib/manuscrito-parser';
import { resolverDescritores } from '@/lib/manuscrito-modulos';
import type { gerarModulosManuscritoTask } from '@/trigger/gerar-modulos-manuscrito';

/** Uma célula da matriz descritor × transição do preview. */
export interface CelulaPreview {
  nivel_entrada: string;
  nivel_destino: string;
  chars: number;
  microblocos: string[];
  jaExiste: boolean;
}

export interface PreviewManuscrito {
  cod_comp: string;
  cargoManuscrito: string;
  titulo: string;
  subtitulo: string;
  /** Sugestão de termo canônico. O admin confirma/edita. */
  termoSugerido: string;
  stats: ManuscritoParseResult['stats'];
  avisos: string[];
  descritores: Array<{
    indice: number;
    descritorManuscrito: string;
    descritorBanco: string;
    cod_desc: string;
    competencia_id: string;
    matchExato: boolean;
    celulas: CelulaPreview[];
  }>;
  recursos: ManuscritoParseResult['recursos'];
  /** Quantos módulos seriam realmente gerados (descontados os que já existem). */
  aGerar: number;
  jaExistem: number;
}

/**
 * Parseia o DOCX e casa os descritores com o catálogo. NÃO gera nada, NÃO chama IA.
 *
 * `empresaId` preenchido → competência da empresa (`competencias`); é o caso dos
 * manuscritos da rede (SED01-SED12, Ibipeba). Nulo → catálogo canônico.
 */
export async function analisarManuscrito(opts: {
  arquivoBase64: string;
  filename?: string;
  empresaId?: string | null;
  locale?: string;
}): Promise<{ preview?: PreviewManuscrito; error?: string }> {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!opts.arquivoBase64) return { error: 'arquivoBase64 obrigatório' };
    if (opts.filename && !opts.filename.toLowerCase().endsWith('.docx')) {
      return { error: 'Suba o .docx original. PDFs impressos perdem a camada de texto e não podem ser processados.' };
    }

    const locale = opts.locale || 'pt-BR';
    const empresaId = opts.empresaId || null;

    let parse: ManuscritoParseResult;
    try {
      parse = await parsearManuscrito(Buffer.from(opts.arquivoBase64, 'base64'));
    } catch (e: any) {
      // O parser falha alto de propósito quando o DOCX foge da convenção.
      return { error: e?.message || 'Não foi possível parsear o manuscrito.' };
    }

    const { resolvidos, avisos: avisosMatch, error } = await resolverDescritores(sb, parse, empresaId);
    if (error || !resolvidos) return { error: error || 'falha ao resolver descritores' };

    // Módulos já existentes, para a matriz mostrar o que seria pulado.
    const col = empresaId ? 'competencia_id' : 'competencia_base_id';
    const { data: existentes } = await sb
      .from('modulos_base_conteudo')
      .select(`${col}, nivel_entrada, nivel_destino`)
      .in(col, resolvidos.map((r) => r.comp.id))
      .eq('locale', locale)
      .neq('status', 'obsoleto');
    const chaves = new Set((existentes || []).map((m: any) => `${m[col]}|${m.nivel_entrada}|${m.nivel_destino}`));

    let aGerar = 0;
    let jaExistem = 0;
    const descritores = parse.descritores.map((g, i) => {
      const r = resolvidos[i];
      const celulas = g.transicoes.map((t) => {
        const jaExiste = chaves.has(`${r.comp.id}|${t.nivel_entrada}|${t.nivel_destino}`);
        jaExiste ? jaExistem++ : aGerar++;
        return {
          nivel_entrada: t.nivel_entrada,
          nivel_destino: t.nivel_destino,
          chars: t.chars,
          microblocos: t.microblocos,
          jaExiste,
        };
      });
      return {
        indice: g.indice,
        descritorManuscrito: g.descritor,
        descritorBanco: r.comp.nome_curto || r.comp.nome,
        cod_desc: r.comp.cod_desc,
        competencia_id: r.comp.id,
        matchExato: r.matchExato,
        celulas,
      };
    });

    return {
      preview: {
        cod_comp: parse.cod_comp,
        cargoManuscrito: parse.cargo,
        titulo: parse.titulo,
        subtitulo: parse.subtitulo,
        // O manuscrito nomeia o cargo de um jeito e o banco de outro (SED08 diz
        // "Gestor Educacional", SED05 diz "Gestão Educacional"). O default vem do
        // banco; o admin corrige para o termo que o texto usa ("o técnico").
        termoSugerido: resolvidos[0]?.comp.cargo || parse.cargo,
        stats: parse.stats,
        avisos: [...parse.avisos, ...avisosMatch],
        descritores,
        recursos: parse.recursos,
        aGerar,
        jaExistem,
      },
    };
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Enfileira a geração. O DOCX vai em `params.docxBase64` e a task re-parseia —
 * o parser é determinístico, então isso é mais barato e mais seguro que serializar
 * as 18 fatias de ~65k chars. A task descarta o base64 ao terminar.
 */
export async function enqueueManuscritoBatch(opts: {
  arquivoBase64: string;
  empresaId?: string | null;
  locale?: string;
  termoCanonico?: string;
  /** Só estes descritores (1-based). Vazio = todos. */
  apenasDescritores?: number[];
  /** Regera módulos que já existem para a mesma transição. */
  substituirExistentes?: boolean;
}) {
  try {
    const ctx = await requireAdminAction('content.manage');
    const sb = await requireAdminSupabase('content.manage');
    if (!opts.arquivoBase64) return { success: false as const, error: 'arquivoBase64 obrigatório' };

    // Revalida o DOCX aqui: enfileirar um job que a task não consegue parsear
    // seria um erro silencioso de 40 minutos.
    let parse: ManuscritoParseResult;
    try {
      parse = await parsearManuscrito(Buffer.from(opts.arquivoBase64, 'base64'));
    } catch (e: any) {
      return { success: false as const, error: e?.message || 'DOCX inválido' };
    }

    const empresaId = opts.empresaId || null;
    const { resolvidos, error } = await resolverDescritores(sb, parse, empresaId);
    if (error || !resolvidos) return { success: false as const, error: error || 'falha ao resolver descritores' };

    const nDesc = opts.apenasDescritores?.length || parse.descritores.length;
    const total = nDesc * TRANSICOES.length;

    const params = {
      cod_comp: parse.cod_comp,
      titulo: parse.titulo,
      cargoManuscrito: parse.cargo,
      empresaId,
      locale: opts.locale || 'pt-BR',
      termoCanonico: opts.termoCanonico || null,
      apenasDescritores: opts.apenasDescritores || null,
      substituirExistentes: !!opts.substituirExistentes,
      createdBy: ctx.email,
      parseStats: parse.stats,
      recursos: parse.recursos,
      docxBase64: opts.arquivoBase64,
    };

    const { data: job, error: errJob } = await sb.from('ia_jobs').insert({
      empresa_id: empresaId,
      fase: 'manuscrito',
      params,
      status: 'queued',
      progress: { done: 0, total, current: 'na fila', resultados: [] },
      created_by: ctx.email,
    }).select('id').single();
    if (errJob) return { success: false as const, error: errJob.message };

    try {
      const handle = await tasks.trigger<typeof gerarModulosManuscritoTask>(
        'gerar-modulos-manuscrito', { jobId: job.id }, regionOpts(),
      );
      await sb.from('ia_jobs').update({ params: { ...params, runId: handle.id } }).eq('id', job.id);
    } catch (e: any) {
      await sb.from('ia_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
      return { success: false as const, error: 'Não foi possível enfileirar: ' + (e?.message || e) };
    }

    return { success: true as const, jobId: job.id, total, cod_comp: parse.cod_comp };
  } catch (err: any) {
    return { success: false as const, error: err?.message || 'Erro' };
  }
}
