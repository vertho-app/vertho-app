/**
 * Leitura do contexto de turma — a ponte entre o banco (mig 210) e o resolvedor
 * de `config-efetiva.ts`.
 *
 * Existe para que nenhum consumidor precise saber COMO se acha a turma de
 * alguém. Antes disto, todo gate fazia `select sys_config from empresas` e
 * decidia com a config da EMPRESA — o que ignora silenciosamente qualquer
 * override da turma. Trocar essas chamadas por `configEfetivaDoColaborador` é o
 * que torna o guard de fonte única possível.
 *
 * Duas queries pequenas e indexadas em vez de um embed do PostgREST: a FK
 * `turma_membros → turmas` é COMPOSTA (turma_id, empresa_id), e depender da
 * detecção de relacionamento composto para um gate de acesso é fragilidade
 * desnecessária.
 */

import { resolverConfigEfetiva, type ConfigEfetiva, type FontesConfig } from './config-efetiva';
import { TURMA_MEMBRO, TURMA_ENCERRADAS, type TurmaStatus } from '@/lib/status';

export interface ContextoTurma {
  turmaId: string | null;
  turmaMembroId: string | null;
  turmaNome: string | null;
  /** Segunda-feira canônica da safra — a geração de trilha usa ESTA data. */
  turmaDataInicio: string | null;
  turmaStatus: string | null;
  config: ConfigEfetiva;
}

const SEM_TURMA: Omit<ContextoTurma, 'config'> = {
  turmaId: null, turmaMembroId: null, turmaNome: null, turmaDataInicio: null, turmaStatus: null,
};

/**
 * Participação ATIVA de um colaborador (no máximo uma — índice parcial da mig
 * 210) + a turma dela.
 */
export async function carregarParticipacaoAtiva(
  sb: any,
  empresaId: string,
  colaboradorId: string,
): Promise<{
  membroId: string | null;
  configOverride: Record<string, any>;
  turma: { id: string; nome: string; sys_config: any; data_inicio: string | null; status: string } | null;
}> {
  if (!empresaId || !colaboradorId) return { membroId: null, configOverride: {}, turma: null };

  const { data: membro } = await sb.from('turma_membros')
    .select('id, turma_id, config_override')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaboradorId)
    .eq('status', TURMA_MEMBRO.ATIVO)
    .maybeSingle();
  if (!membro) return { membroId: null, configOverride: {}, turma: null };

  const { data: turma } = await sb.from('turmas')
    .select('id, nome, sys_config, data_inicio, status')
    .eq('id', membro.turma_id)
    .eq('empresa_id', empresaId)   // defense-in-depth: a FK composta já garante
    .maybeSingle();

  return { membroId: membro.id, configOverride: membro.config_override || {}, turma: turma || null };
}

/**
 * Contexto completo de um colaborador: qual turma, e a config efetiva dela.
 *
 * @param sysConfigEmpresa opcional — passe quando já tiver a config em mãos,
 *        para poupar a query. O resultado é idêntico.
 */
export async function carregarContextoTurma(
  sb: any,
  empresaId: string,
  colaboradorId: string,
  sysConfigEmpresa?: any,
): Promise<ContextoTurma> {
  let empresaCfg = sysConfigEmpresa;
  if (empresaCfg === undefined) {
    const { data: emp } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
    empresaCfg = emp?.sys_config || {};
  }

  const { membroId, configOverride, turma } = await carregarParticipacaoAtiva(sb, empresaId, colaboradorId);

  const fontes: FontesConfig = {
    empresa: empresaCfg,
    turma: turma?.sys_config,
    participacao: configOverride,
  };
  const { config } = resolverConfigEfetiva(fontes);

  if (!turma) return { ...SEM_TURMA, config };

  return {
    turmaId: turma.id,
    turmaMembroId: membroId,
    turmaNome: turma.nome,
    turmaDataInicio: turma.data_inicio,
    turmaStatus: turma.status,
    config,
  };
}

/**
 * O atalho que os gates usam: só a config efetiva.
 *
 * ⚠️ Use ESTA função no lugar de `empresa.sys_config` sempre que a decisão for
 * de ETAPA (perfil liberado, assessment aberto, modo do programa). Ler a config
 * da empresa direto faz a turma que ainda não abriu herdar a liberação da que já
 * abriu — que é o bug inteiro que as turmas existem para resolver.
 */
export async function configEfetivaDoColaborador(
  sb: any,
  empresaId: string,
  colaboradorId: string,
  sysConfigEmpresa?: any,
): Promise<ConfigEfetiva> {
  const ctx = await carregarContextoTurma(sb, empresaId, colaboradorId, sysConfigEmpresa);
  return ctx.config;
}

/** Turmas ATIVAS de uma empresa — base do fail-closed das ações em lote. */
export async function contarTurmasAtivas(sb: any, empresaId: string): Promise<number> {
  const encerradas = `(${TURMA_ENCERRADAS.map((s) => `"${s}"`).join(',')})`;
  const { count } = await sb.from('turmas')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .not('status', 'in', encerradas);
  return count || 0;
}

/** Turma vista por um FILTRO de leitura: rótulo + denominador, nada além. */
export interface TurmaDoTenant {
  id: string;
  nome: string;
  status: TurmaStatus;
  /**
   * Participantes ATIVOS, sem a conta de RH: o denominador que acompanha todo
   * número da turma.
   *
   * 🔑 A régua é a MESMA do painel (`neq('role','rh')`). Contar a participação
   * crua faria o chip dizer "127 pessoas" ao lado de um painel que conta 126:
   * dois números para a mesma pergunta na mesma tela, que é justamente o que o
   * filtro veio resolver um nível acima. `Medido em 31/08` em macae: a conta de
   * RH é membro ativo da turma de diretores.
   */
  membros: number;
}

/**
 * Turmas ativas de uma empresa, com a contagem de participantes.
 *
 * Deliberadamente mais pobre que `levantarPortfolioTurmas`: aquele agrega
 * respostas, IA4, trilhas e a distribuição de semanas para o operador da
 * Vertho. Um seletor de turma precisa do nome e de quantas pessoas ele recorta.
 * Pagar as quatro varreduras do portfólio para desenhar dois chips seria cobrar
 * da tela do RH o custo de um painel que ela não mostra.
 */
export async function listarTurmasDoTenant(sb: any, empresaId: string): Promise<TurmaDoTenant[]> {
  if (!empresaId) return [];
  const encerradas = `(${TURMA_ENCERRADAS.map((s) => `"${s}"`).join(',')})`;
  const { data: turmas, error } = await sb.from('turmas')
    .select('id, nome, status')
    .eq('empresa_id', empresaId)
    .not('status', 'in', encerradas)
    .order('created_at');
  if (error) {
    console.error('[turmas] listar do tenant:', error.message);
    return [];
  }
  if (!turmas?.length) return [];

  const [{ data: membros }, { data: administrativos }] = await Promise.all([
    sb.from('turma_membros')
      .select('turma_id, colaborador_id')
      .eq('empresa_id', empresaId)
      .eq('status', TURMA_MEMBRO.ATIVO),
    sb.from('colaboradores').select('id').eq('empresa_id', empresaId).eq('role', 'rh'),
  ]);

  const foraDaContagem = new Set((administrativos || []).map((c: any) => c.id));
  const porTurma = new Map<string, number>();
  for (const m of membros || []) {
    if (foraDaContagem.has(m.colaborador_id)) continue;
    porTurma.set(m.turma_id, (porTurma.get(m.turma_id) || 0) + 1);
  }

  return turmas.map((t: any) => ({
    id: t.id,
    nome: t.nome,
    status: t.status,
    membros: porTurma.get(t.id) || 0,
  }));
}
