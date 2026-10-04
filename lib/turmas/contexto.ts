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
import { lerTudoPaginado } from '@/lib/paginacao';

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

  // Falha de leitura LANÇA (27/09/2026). Até então virava "sem turma": quem
  // estava na turma do programa de liderança lia "não está aberto para você
  // nesta rodada", e os gates de config caíam na config da EMPRESA em silêncio.
  const { data: membro, error: erroMembro } = await sb.from('turma_membros')
    .select('id, turma_id, config_override')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaboradorId)
    .eq('status', TURMA_MEMBRO.ATIVO)
    .maybeSingle();
  if (erroMembro) throw new Error(`não foi possível ler a participação na turma: ${erroMembro.message}`);
  if (!membro) return { membroId: null, configOverride: {}, turma: null };

  const { data: turma, error: erroTurma } = await sb.from('turmas')
    .select('id, nome, sys_config, data_inicio, status')
    .eq('id', membro.turma_id)
    .eq('empresa_id', empresaId)   // defense-in-depth: a FK composta já garante
    .maybeSingle();
  if (erroTurma) throw new Error(`não foi possível ler a turma: ${erroTurma.message}`);

  return { membroId: membro.id, configOverride: membro.config_override || {}, turma: turma || null };
}

/**
 * Contexto completo de um colaborador: qual turma, e a config efetiva dela.
 *
 * @param sysConfigEmpresa opcional — passe quando já tiver a config em mãos,
 *        para poupar a query. O resultado é idêntico.
 * @param opcoes.colaboradorLegado o `programa_modo` gravado NA PESSOA, que entra
 *        na precedência no lugar dele (abaixo da turma e da participação, acima
 *        da empresa). Quem decide o formato de uma GERAÇÃO passa o colaborador
 *        aqui, e não como "empresa" de uma segunda resolução: aplicar o legado
 *        por cima da config JÁ resolvida fazia o override da pessoa vencer a
 *        turma, ao contrário do que o resolvedor documenta (R-101).
 */
export async function carregarContextoTurma(
  sb: any,
  empresaId: string,
  colaboradorId: string,
  sysConfigEmpresa?: any,
  opcoes: { colaboradorLegado?: FontesConfig['colaboradorLegado'] } = {},
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
    colaboradorLegado: opcoes.colaboradorLegado,
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

/**
 * Config efetiva de VÁRIAS pessoas da empresa, em duas leituras paginadas (por
 * pessoa seriam duas queries cada). É para quem varre a população e precisa da
 * MESMA precedência da geração (participação → turma → override do colaborador
 * → empresa): a prontidão da trilha dizia "quem resolveria para piloto" pela
 * empresa e pelo override, ignorando a turma, que a geração respeita (R-101).
 *
 * Falha de leitura LANÇA, como em `carregarParticipacaoAtiva`: "não consegui ler
 * as turmas" virando "ninguém está em turma" mostraria um veredito sobre a
 * config da empresa para quem está numa turma com outra.
 */
export async function carregarConfigsEfetivasEmLote(
  sb: any,
  empresaId: string,
  colabs: Array<{ id: string; programa_modo?: string | null }>,
  sysConfigEmpresa: any,
): Promise<Map<string, ConfigEfetiva>> {
  const [membros, turmas] = await Promise.all([
    lerTudoPaginado((de, ate) => sb.from('turma_membros')
      .select('colaborador_id, turma_id, config_override')
      .eq('empresa_id', empresaId)
      .eq('status', TURMA_MEMBRO.ATIVO)
      .order('colaborador_id')
      .range(de, ate)),
    lerTudoPaginado((de, ate) => sb.from('turmas')
      .select('id, sys_config')
      .eq('empresa_id', empresaId)
      .order('id')
      .range(de, ate)),
  ]);
  if (membros.error) throw new Error(`não foi possível ler as participações nas turmas: ${membros.error}`);
  if (turmas.error) throw new Error(`não foi possível ler as turmas: ${turmas.error}`);

  const turmaPorId = new Map<string, any>(turmas.data.map((t: any) => [t.id, t]));
  const membroPorColab = new Map<string, any>(membros.data.map((m: any) => [m.colaborador_id, m]));

  const out = new Map<string, ConfigEfetiva>();
  for (const colab of colabs) {
    const membro = membroPorColab.get(colab.id);
    const turma = membro ? turmaPorId.get(membro.turma_id) : null;
    out.set(colab.id, resolverConfigEfetiva({
      empresa: sysConfigEmpresa || {},
      turma: turma?.sys_config,
      participacao: membro?.config_override || {},
      colaboradorLegado: colab,
    }).config);
  }
  return out;
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
