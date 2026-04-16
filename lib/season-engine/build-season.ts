/**
 * Monta o plano de 14 semanas a partir dos descritores selecionados,
 * resolvendo o conteúdo (formato_core conforme prioridade do colaborador)
 * e gerando desafios + cenários via Claude.
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { promptDesafio } from '@/lib/season-engine/prompts/challenge';
import { promptCenario } from '@/lib/season-engine/prompts/scenario';
import { promptMissao } from '@/lib/season-engine/prompts/missao';
import type { SelectedDescriptor } from './select-descriptors';

interface MicroConteudo {
  id: string;
  titulo: string;
  url?: string | null;
  formato: string;
  competencia: string;
  descritor?: string;
  empresa_id?: string | null;
  ativo: boolean;
  versao?: number;
  taxa_conclusao?: number | null;
  impacto_amostras?: number | null;
  impacto_medio_delta?: number | null;
}

interface SemanaConteudo {
  semana: number;
  tipo: 'conteudo';
  descritor: string | null;
  descritores_cobertos: string[];
  nivel_alvo?: number;
  nivel_atual?: number;
  conteudo?: {
    formato_core: string | null;
    core_id: string | null;
    core_reuso: boolean;
    core_titulo: string;
    core_url: string | null;
    desafio_texto: string;
    formatos_disponiveis: Record<string, { id: string; url: string | null | undefined; titulo: string }>;
    fallback_gerado: boolean;
  };
  status: 'disponivel' | 'bloqueada';
}

interface SemanaAplicacao {
  semana: number;
  tipo: 'aplicacao';
  descritor: null;
  descritores_cobertos: string[];
  missao?: { texto: string };
  cenario?: { texto: string; complexidade: string };
  status: 'disponivel' | 'bloqueada';
}

interface SemanaAvaliacao {
  semana: number;
  tipo: 'avaliacao';
  descritor: null;
  descritores_cobertos: string[];
  status: 'disponivel' | 'bloqueada';
}

export type SemanaPlan = SemanaConteudo | SemanaAplicacao | SemanaAvaliacao;

export interface AIConfigOpt {
  model?: string;
}

export interface BuildSeasonInput {
  descritoresSelecionados: SelectedDescriptor[];
  competencia: string;
  cargo: string;
  contexto?: string;
  prioridadeFormatos?: string[];
  empresaId?: string | null;
  aiConfig?: AIConfigOpt;
}

/**
 * Score composto de um micro-conteúdo pra ranking de recomendação.
 *   - 70% impacto_medio_delta (normalizado 0-1 em escala 0-1.5 de delta)
 *   - 30% taxa_conclusao
 * Com menos de 5 amostras de impacto, usa só taxa_conclusao (dado insuficiente).
 */
function computarScoreConteudo(c: MicroConteudo): number {
  const taxa = c.taxa_conclusao ?? 0;
  const amostras = c.impacto_amostras ?? 0;
  const delta = c.impacto_medio_delta ?? null;
  if (amostras < 5 || delta == null) return taxa;
  const deltaNorm = Math.max(0, Math.min(1, delta / 1.5));
  return 0.7 * deltaNorm + 0.3 * taxa;
}

export async function buildSeason({
  descritoresSelecionados,
  competencia,
  cargo,
  contexto = 'generico',
  prioridadeFormatos = ['video', 'texto', 'audio', 'case'],
  empresaId = null,
  aiConfig = {},
}: BuildSeasonInput): Promise<SemanaPlan[]> {
  const semanas: SemanaPlan[] = [];

  // Mapeia semana → descritor (a partir de descritoresSelecionados)
  const semanaParaDescritor: Record<number, SelectedDescriptor> = {};
  for (const d of descritoresSelecionados) {
    for (const s of d.semanas_ids) {
      semanaParaDescritor[s] = d;
    }
  }

  const idsJaUsados = new Set<string>();
  for (let semana = 1; semana <= 14; semana++) {
    let plan: SemanaPlan;
    if ([4, 8, 12].includes(semana)) {
      plan = await montarSemanaAplicacao(semana, descritoresSelecionados, competencia, cargo, contexto, aiConfig);
    } else if ([13, 14].includes(semana)) {
      plan = {
        semana,
        tipo: 'avaliacao',
        descritor: null,
        descritores_cobertos: descritoresSelecionados.map(d => d.descritor),
        status: 'bloqueada',
      };
    } else {
      const d = semanaParaDescritor[semana];
      if (!d) {
        plan = {
          semana,
          tipo: 'conteudo',
          descritor: null,
          descritores_cobertos: [],
          status: 'bloqueada',
        };
      } else {
        plan = await montarSemanaConteudo(semana, d, competencia, cargo, contexto, prioridadeFormatos, empresaId, aiConfig, idsJaUsados);
        if (plan.tipo === 'conteudo' && plan.conteudo?.core_id) idsJaUsados.add(plan.conteudo.core_id);
      }
    }
    plan.status = semana === 1 ? 'disponivel' : 'bloqueada';
    semanas.push(plan);
  }

  return semanas;
}

async function montarSemanaConteudo(
  semana: number,
  descritorSel: SelectedDescriptor,
  competencia: string,
  cargo: string,
  contexto: string,
  prioridadeFormatos: string[],
  empresaId: string | null,
  aiConfig: AIConfigOpt,
  idsJaUsados: Set<string> = new Set(),
): Promise<SemanaConteudo> {
  const sb = createSupabaseAdmin();
  const nivelMedio = (descritorSel.nota_atual + 3.0) / 2;

  // Busca conteúdos pra esse descritor com fallback gradual.
  const buildQ = (withNivel: boolean) => {
    let q = sb.from('micro_conteudos').select('*')
      .eq('ativo', true)
      .eq('competencia', competencia);
    if (withNivel) q = q.lte('nivel_min', nivelMedio).gte('nivel_max', nivelMedio);
    if (empresaId) q = q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
    else q = q.is('empresa_id', null);
    return q;
  };
  let { data: candidatos } = await buildQ(true);
  if (!candidatos || candidatos.length <= 1) {
    const { data: todos } = await buildQ(false);
    candidatos = todos || candidatos || [];
  }

  const candidatosTyped = (candidatos || []) as MicroConteudo[];
  const matchDescritor = candidatosTyped.filter(c => c.descritor === descritorSel.descritor);
  const todosComp = candidatosTyped;
  const poolDescDisp = matchDescritor.filter(c => !idsJaUsados.has(c.id));
  const poolCompDisp = todosComp.filter(c => !idsJaUsados.has(c.id));
  const pool: MicroConteudo[] = poolDescDisp.length > 0
    ? poolDescDisp
    : (poolCompDisp.length > 0 ? poolCompDisp : (matchDescritor.length > 0 ? matchDescritor : todosComp));

  // Dentro de cada formato, escolhe o conteúdo com melhor SCORE.
  const formatosDisponiveis: Record<string, MicroConteudo> = {};
  const ordenadoPorQualidade = [...pool].sort((a, b) => {
    const scoreA = computarScoreConteudo(a);
    const scoreB = computarScoreConteudo(b);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (b.versao || 0) - (a.versao || 0);
  });
  for (const c of ordenadoPorQualidade) {
    if (!formatosDisponiveis[c.formato]) formatosDisponiveis[c.formato] = c;
  }

  let formatoCore: string | null = prioridadeFormatos.find(f => formatosDisponiveis[f]) || null;
  let coreContent: MicroConteudo | null = formatoCore ? formatosDisponiveis[formatoCore] : null;

  if (!coreContent) {
    formatoCore = 'texto';
  }

  // Gera desafio via Claude
  let desafioTexto = '';
  try {
    const { system, user } = promptDesafio({
      competencia,
      descritor: descritorSel.descritor,
      nivel: descritorSel.nota_atual,
      cargo,
      contexto,
      semana,
    });
    desafioTexto = await callAI(system, user, aiConfig, 300);
    desafioTexto = desafioTexto.trim();
  } catch (err: any) {
    console.warn(`[buildSeason] desafio sem 1: ${err?.message ?? err}`);
    desafioTexto = `Aplique ${descritorSel.descritor} em uma situação real esta semana e observe o resultado.`;
  }

  const reused = !!(coreContent && idsJaUsados.has(coreContent.id));
  return {
    semana,
    tipo: 'conteudo',
    descritor: descritorSel.descritor,
    descritores_cobertos: [descritorSel.descritor],
    nivel_alvo: 3.0,
    nivel_atual: descritorSel.nota_atual,
    conteudo: {
      formato_core: formatoCore,
      core_id: coreContent?.id || null,
      core_reuso: reused,
      core_titulo: (reused ? '[Continuação] ' : '') + (coreContent?.titulo || `Episódio ${semana}: ${descritorSel.descritor}`),
      core_url: coreContent?.url || null,
      desafio_texto: desafioTexto,
      formatos_disponiveis: Object.fromEntries(
        Object.entries(formatosDisponiveis).map(([f, c]) => [f, { id: c.id, url: c.url, titulo: c.titulo }])
      ),
      fallback_gerado: !coreContent,
    },
    status: 'bloqueada',
  };
}

async function montarSemanaAplicacao(
  semana: number,
  descritores: SelectedDescriptor[],
  competencia: string,
  cargo: string,
  contexto: string,
  aiConfig: AIConfigOpt,
): Promise<SemanaAplicacao> {
  const blocosCobertos: Record<number, string[]> = {
    4: descritores.slice(0, 3).map(d => d.descritor),
    8: descritores.slice(0, 6).map(d => d.descritor),
    12: descritores.map(d => d.descritor),
  };
  const complexidadeMap: Record<number, string> = { 4: 'simples', 8: 'intermediario', 12: 'completo' };
  const complexidade = complexidadeMap[semana];
  const cobertos = blocosCobertos[semana] || [];

  let missaoTexto = '';
  let cenarioTexto = '';
  try {
    const m = promptMissao({ competencia, descritores: cobertos, cargo, contexto });
    const c = promptCenario({ competencia, descritores: cobertos, cargo, contexto, complexidade });
    const [mResp, cResp] = await Promise.all([
      callAI(m.system, m.user, aiConfig, 500),
      callAI(c.system, c.user, aiConfig, 800),
    ]);
    missaoTexto = (mResp || '').trim();
    cenarioTexto = (cResp || '').trim();
  } catch (err: any) {
    console.warn(`[buildSeason] missao/cenario sem ${semana}: ${err?.message ?? err}`);
    missaoTexto = missaoTexto || `Missão pendente. Aplique os descritores ${cobertos.join(', ')} em uma situação real do seu cargo esta semana.`;
    cenarioTexto = cenarioTexto || `Cenário pendente. Descreva como você aplicaria os descritores ${cobertos.join(', ')} em uma situação típica do seu cargo.`;
  }

  return {
    semana,
    tipo: 'aplicacao',
    descritor: null,
    descritores_cobertos: cobertos,
    missao: { texto: missaoTexto },
    cenario: { texto: cenarioTexto, complexidade },
    status: 'bloqueada',
  };
}
