import 'server-only';
import { z } from 'zod';
import { tenantDb } from '@/lib/tenant-db';
import { SimuladorError } from './core';
import { BACKUP_DIAS, exigirBucketPrivado, gravarBackupConferido, removerBackupRecusado } from './backup';
import { erroExclusao } from '@/lib/erros-exclusao';

type Alvo = { tipo: 'empresa' } | { tipo: 'colaborador'; id: string };
type Snapshot = {
  hash: string; sessoes: number; tentativas: number;
  documento: {
    empresa_id: string; colaborador_id: string | null;
    cadastro: { id: string }; colaboradores: { id: string; empresa_id: string }[];
    sessoes: { id: string; empresa_id: string }[];
    tentativas: { empresa_id: string; sessao_id: string }[];
  };
};
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const uuid = z.string().uuid();
function parametros(empresaId: string, alvo: Alvo) {
  return { p_empresa: uuid.parse(empresaId), p_colaborador: alvo.tipo === 'colaborador' ? uuid.parse(alvo.id) : null };
}
async function lerSnapshot(empresaId: string, alvo: Alvo): Promise<Snapshot> {
  const params = parametros(empresaId, alvo);
  const { data, error } = await tenantDb(empresaId).rpc('sim_vendas_exclusao_snapshot', params);
  if (error) throw new SimuladorError(503, 'Não foi possível conferir o impacto da exclusão. Nenhum cadastro foi excluído.');
  if (!data) throw new SimuladorError(404, 'Cadastro não encontrado nesta empresa.');
  const s = data as Snapshot;
  const d = s.documento;
  if (!hashSchema.safeParse(s.hash).success || !d || d.empresa_id !== empresaId ||
    d.colaborador_id !== params.p_colaborador || d.cadastro?.id !== (params.p_colaborador || empresaId) ||
    !Array.isArray(d.sessoes) || !Array.isArray(d.tentativas) || !Array.isArray(d.colaboradores) ||
    d.sessoes.length !== s.sessoes || d.tentativas.length !== s.tentativas ||
    d.sessoes.some((r) => r.empresa_id !== empresaId) || d.colaboradores.some((r) => r.empresa_id !== empresaId) ||
    d.tentativas.some((r) => r.empresa_id !== empresaId || !d.sessoes.some((sessao) => sessao.id === r.sessao_id)))
    throw new SimuladorError(503, 'Não foi possível validar o escopo da exclusão. Nenhum cadastro foi excluído.');
  return s;
}

/** Única representação que pode ir ao navegador; nunca devolve o snapshot. */
export async function preverExclusaoPace(empresaId: string, alvo: Alvo) {
  const { hash, sessoes, tentativas } = await lerSnapshot(empresaId, alvo);
  return { confirmacao: hash, sessoes, tentativas, backupDias: BACKUP_DIAS };
}

/** Núcleo headless. As actions/rotas autenticam e autorizam o alvo ANTES de chamar. */
export async function excluirCadastroComBackupPace(
  empresaId: string, alvo: Alvo, confirmacao: string | null | undefined, autor: string,
) {
  if (!hashSchema.safeParse(confirmacao).success)
    throw new SimuladorError(409, 'Confira a prévia e confirme a exclusão deste cadastro e dos treinos vinculados.');
  const s = await lerSnapshot(empresaId, alvo);
  if (s.hash !== confirmacao)
    throw new SimuladorError(409, 'Os dados mudaram desde a prévia. Atualize e confirme novamente; nada foi excluído.');
  const tdb = tenantDb(empresaId);
  await exigirBucketPrivado(tdb.storage);
  const backup = await gravarBackupConferido(tdb.storage, 'pace-exclusao', { motivo: 'exclusao_administrativa', ...s });
  const { data, error } = await tdb.rpc('sim_vendas_excluir_cadastro', {
    ...parametros(empresaId, alvo), p_hash: confirmacao, p_backup: backup.caminho,
    p_backup_sha256: backup.sha256, p_autor: autor,
  });
  if (error) {
    // Só estes erros SQL confirmam rollback. Transporte/timeout é ambíguo:
    // nesse caso o backup deve continuar existindo para eventual recuperação.
    const codigo = ['SIM_CONFIRMACAO','SIM_OCUPADA','SIM_CADASTRO','SIM_BACKUP'].find((c) => error.message?.includes(c));
    if (codigo || error.code === '23503') await removerBackupRecusado(tdb.storage, backup.caminho);
    if (codigo === 'SIM_CONFIRMACAO') throw new SimuladorError(409, 'Os dados mudaram durante a exclusão. Atualize a prévia e confirme novamente; nada foi excluído.');
    if (codigo === 'SIM_OCUPADA') throw new SimuladorError(409, 'Há um treino sendo processado. Aguarde a conclusão e confira novamente a prévia.');
    if (codigo === 'SIM_CADASTRO') throw new SimuladorError(404, 'Cadastro não encontrado nesta empresa.');
    const falha = erroExclusao(error);
    throw new SimuladorError(falha.status, falha.message);
  }
  if (!data?.id) throw new SimuladorError(503, 'Não foi possível confirmar o resultado da exclusão. Confira o cadastro; o backup foi preservado.');
  return data as { id: string; nome_completo: string | null; nome: string | null; slug: string | null };
}
