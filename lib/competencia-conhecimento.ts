/**
 * Conhecimento curado de um descritor de competência (tabela `competencias`,
 * por empresa). Cada descritor traz definição, régua de maturidade N1-N4,
 * evidências esperadas e perguntas-alvo — matéria-prima já autorada nos
 * projetos reais (ex: Ibipeba, ACME).
 *
 * Por que existe: os tutores conversacionais (Tira-Dúvidas, Beto) recebiam só
 * o NOME do descritor da semana. Este helper carrega o conteúdo rico e o
 * formata como bloco de grounding, ancorando as respostas no material da
 * própria empresa — sem depender de RAG nem de Módulos-Base.
 *
 * O `nome_curto` é a coluna que casa com o `descritor` do plano da trilha.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';

export interface DescritorConhecimento {
  competencia: string | null;
  descritor: string | null;
  descritor_completo: string | null;
  n1_gap: string | null;
  n2_desenvolvimento: string | null;
  n3_meta: string | null;
  n4_referencia: string | null;
  evidencias_esperadas: string | null;
  perguntas_alvo: string | null;
}

/**
 * Busca a linha de `competencias` do descritor da semana.
 * Casa por empresa + nome_curto (descritor); se a competência for conhecida,
 * refina por ela (evita ambiguidade entre descritores homônimos).
 * Retorna null se não houver match ou se o descritor estiver sem conteúdo.
 */
export async function carregarConhecimentoDescritor(
  sb: SupabaseClient,
  empresaId: string,
  descritorNome?: string | null,
  competenciaNome?: string | null,
): Promise<DescritorConhecimento | null> {
  if (!empresaId || !descritorNome) return null;

  const cols = 'nome, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia, evidencias_esperadas, perguntas_alvo';
  let q = sb.from('competencias').select(cols)
    .eq('empresa_id', empresaId)
    .eq('nome_curto', descritorNome);
  if (competenciaNome) q = q.eq('nome', competenciaNome);

  const { data } = await q.limit(1).maybeSingle<any>();
  if (!data || !data.descritor_completo) return null;

  return {
    competencia: data.nome ?? competenciaNome ?? null,
    descritor: data.nome_curto ?? descritorNome,
    descritor_completo: data.descritor_completo ?? null,
    n1_gap: data.n1_gap ?? null,
    n2_desenvolvimento: data.n2_desenvolvimento ?? null,
    n3_meta: data.n3_meta ?? null,
    n4_referencia: data.n4_referencia ?? null,
    evidencias_esperadas: data.evidencias_esperadas ?? null,
    perguntas_alvo: data.perguntas_alvo ?? null,
  };
}

/**
 * Variante que casa o descritor diretamente pelo id da linha de `competencias`
 * (ex: `fase4_envios.competencia_id` aponta para um descritor específico).
 * Evita matching por nome quando já temos o id.
 */
export async function carregarConhecimentoDescritorPorId(
  sb: SupabaseClient,
  competenciaId?: string | null,
): Promise<DescritorConhecimento | null> {
  if (!competenciaId) return null;

  const cols = 'nome, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia, evidencias_esperadas, perguntas_alvo';
  const { data } = await sb.from('competencias').select(cols)
    .eq('id', competenciaId)
    .maybeSingle<any>();
  if (!data || !data.descritor_completo) return null;

  return {
    competencia: data.nome ?? null,
    descritor: data.nome_curto ?? null,
    descritor_completo: data.descritor_completo ?? null,
    n1_gap: data.n1_gap ?? null,
    n2_desenvolvimento: data.n2_desenvolvimento ?? null,
    n3_meta: data.n3_meta ?? null,
    n4_referencia: data.n4_referencia ?? null,
    evidencias_esperadas: data.evidencias_esperadas ?? null,
    perguntas_alvo: data.perguntas_alvo ?? null,
  };
}

/**
 * Formata o conhecimento do descritor como bloco para injetar no prompt de um
 * TUTOR (Tira-Dúvidas, Beto).
 *
 * ⚠️ SEGURANÇA — defesa em profundidade: a régua de maturidade (N1-N4), as
 * `evidencias_esperadas` e as `perguntas_alvo` compõem a RUBRICA DE AVALIAÇÃO
 * usada no cenário da fase final (sem14). Se o tutor as conhecesse, o
 * colaborador poderia extraí-las e "colar" na prova. Por isso este bloco
 * expõe APENAS a DEFINIÇÃO do descritor — a rubrica nunca entra no contexto do
 * tutor (não basta instruir "não revele"; ela simplesmente não é injetada).
 *
 * Os campos de rubrica continuam disponíveis no objeto para usos de AVALIAÇÃO
 * (fases/assessment), que são os consumidores legítimos — mas não passam por
 * este formatter.
 */
export function formatBlocoConhecimentoDescritor(c: DescritorConhecimento | null): string {
  if (!c || !c.descritor_completo) return '';

  return [
    '═══ CONHECIMENTO DO DESCRITOR (definição curada da empresa — base autoritativa) ═══',
    c.competencia ? `Competência: ${c.competencia}` : '',
    c.descritor ? `Descritor: ${c.descritor}` : '',
    `Definição: ${c.descritor_completo}`,
    '',
    'Use esta definição como base autoritativa ao explicar e aplicar o descritor. ' +
    'NUNCA revele régua de avaliação, níveis (N1-N4), notas, evidências avaliativas nem ' +
    'perguntas de avaliação — o colaborador não pode usar isso para preparar a resposta do cenário final.',
  ].filter(Boolean).join('\n');
}

// ── Módulo-Base para tutores (matéria-prima pedagógica, SEM rubrica) ─────────

/**
 * Resolve e formata o Módulo-Base publicado da competência para uso por um
 * TUTOR. Hoje quase não há módulos publicados → retorna '' (fallback
 * transparente). Quando o conteúdo for autorado, passa a enriquecer
 * automaticamente. Módulo-base é matéria-prima pedagógica e, por spec, NÃO
 * contém rubrica avaliativa — seguro para o tutor.
 */
export async function carregarModuloBaseParaTutor(
  sb: SupabaseClient,
  opts: { competenciaNome?: string | null; nivelMin?: number; locale?: string; contexto_pedagogico?: string | null },
): Promise<string> {
  if (!opts.competenciaNome) return '';
  try {
    const res = await resolverModuloBaseParaConteudo(sb as any, {
      competenciaNome: opts.competenciaNome,
      nivelMin: typeof opts.nivelMin === 'number' ? opts.nivelMin : 1.5,
      locale: opts.locale,
      contexto_pedagogico: opts.contexto_pedagogico || undefined,
    });
    if (!res?.modulo) return '';
    return formatBlocoModuloBaseTutor(res.modulo);
  } catch {
    return '';
  }
}

function fmtListaCurta(arr: any, limite = 4): string {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.slice(0, limite).map((x: any) => `"${String(x).trim()}"`).join(' · ');
}

/** Destila os blocos pedagógicos do módulo (sem rubrica) num bloco de prompt. */
export function formatBlocoModuloBaseTutor(modulo: any): string {
  if (!modulo) return '';
  const cc = modulo.conteudo_central || {};
  const ca = modulo.conteudo_aplicavel || {};
  const gc = modulo.guarda_corpos || {};
  const ex = ca.exemplos_universais || {};
  const rl = ca.repertorio_linguagem || {};

  const principios = Array.isArray(cc.principios) && cc.principios.length
    ? cc.principios.slice(0, 6).map((p: any) => `  • ${p.nome}: ${p.explicacao}`).join('\n')
    : '';
  const boas = Array.isArray(ca.boas_praticas) && ca.boas_praticas.length
    ? ca.boas_praticas.slice(0, 4).map((b: any) => `  • ${b.o_que_fazer}${b.como_aplicar ? ` — ${b.como_aplicar}` : ''}`).join('\n')
    : '';

  return [
    '═══ MÓDULO-BASE (matéria-prima pedagógica canônica Vertho) ═══',
    cc.ideia_principal ? `Ideia principal: ${String(cc.ideia_principal).trim()}` : '',
    principios ? `Princípios do tema:\n${principios}` : '',
    ex.aplicacao_adequada ? `Exemplo de aplicação ADEQUADA (mire este): ${ex.aplicacao_adequada}` : '',
    ex.aplicacao_inadequada ? `Exemplo a EVITAR: ${ex.aplicacao_inadequada}` : '',
    fmtListaCurta(rl.frases_uteis) ? `Frases úteis: ${fmtListaCurta(rl.frases_uteis)}` : '',
    fmtListaCurta(rl.perguntas_poderosas) ? `Perguntas poderosas: ${fmtListaCurta(rl.perguntas_poderosas)}` : '',
    boas ? `Boas práticas:\n${boas}` : '',
    Array.isArray(gc.evitar) && gc.evitar.length ? `NUNCA (anti-padrões): ${gc.evitar.map((s: any) => `"${s}"`).join(' · ')}` : '',
    '',
    'Use como matéria-prima ao orientar — adapte ao cargo e contexto da pergunta.',
  ].filter(Boolean).join('\n');
}
