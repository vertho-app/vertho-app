/**
 * Turmas (coortes) — unidade operacional entre a empresa e o participante.
 * Proposta e razões: docs/TURMAS.md. Schema: migrations/210-turmas.sql.
 */
export { SPEC_CONFIG, CHAVES_DE_TURMA, CHAVES_DE_EMPRESA, specDaChave } from './chaves';
export type { EscopoChave, EstrategiaChave, SpecChave } from './chaves';
export { resolverConfigEfetiva, configEfetiva, resolverModoDaTurma } from './config-efetiva';
export type { ConfigEfetiva, FontesConfig, ResultadoConfig, ProcedenciaConfig } from './config-efetiva';
export {
  carregarContextoTurma,
  carregarParticipacaoAtiva,
  configEfetivaDoColaborador,
  contarTurmasAtivas,
  listarTurmasDoTenant,
} from './contexto';
export type { ContextoTurma, TurmaDoTenant } from './contexto';
