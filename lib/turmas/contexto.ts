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
import { TURMA_MEMBRO, TURMA_ENCERRADAS } from '@/lib/status';

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
