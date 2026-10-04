import 'server-only';
import { tenantDb } from '@/lib/tenant-db';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { acessoDoCargo, ACESSO_ATUAL, CHAVE_ACESSO_SIMULADORES, SEM_ACESSO, idDoCargo, mapaDeCargos, type AcessoSimuladores } from './acesso-cargo';

/**
 * O acesso lido, com a marca de que a leitura FALHOU (R-139, 04/10/2026).
 *
 * 🔴 O DEFEITO. Erro de banco virava `SEM_ACESSO`, sem registro: o item sumia do menu
 * e a página mandava a pessoa de volta ao início, e ninguém, nem ela, sabia que era uma
 * falha do banco e não a regra do cargo. Os valores continuam `false` (quem ignora a
 * marca segue FECHADO, como antes: o gate nunca abre por falha), mas `indisponivel: true`
 * deixa quem pode fazer melhor dizer "indisponível, tente de novo" em vez de "sem
 * acesso", e o menu, que só exibe, não esconder o que o gate ainda vai decidir.
 */
export type AcessoSimuladoresLido = AcessoSimuladores & { indisponivel?: boolean };

async function leituraFalhou(
  colaborador: { empresa_id?: string | null },
  onde: string,
  motivo: string,
): Promise<AcessoSimuladoresLido> {
  console.error(`[simuladores/acesso] ${onde} falhou:`, motivo);
  await registrarDegradacao({
    fluxo: 'leitura',
    tipo: DEGRADACAO.LEITURA_INDISPONIVEL,
    chave: `acesso-simuladores:${colaborador.empresa_id ?? 'sem-empresa'}`,
    empresaId: colaborador.empresa_id ?? null,
    severidade: 'aviso',
    detalhe: { onde, motivo },
  });
  return { ...SEM_ACESSO, indisponivel: true };
}

/** Cargo vem do cadastro autenticado, nunca de um parâmetro enviado pelo participante. */
export async function acessoSimuladoresDoColaborador(
  colaborador: { empresa_id?: string | null; cargo?: string | null } | null | undefined,
): Promise<AcessoSimuladoresLido> {
  if (!colaborador?.empresa_id) return { ...SEM_ACESSO };
  try {
    const tdb = tenantDb(colaborador.empresa_id);
    const { data: empresa, error } = await tdb.raw.from('empresas')
      .select('sys_config').eq('id', colaborador.empresa_id).maybeSingle();
    if (error) return await leituraFalhou(colaborador, 'configuração da empresa', error.message);
    // Empresa que não existe é "sem acesso" de verdade, não falha de leitura.
    if (!empresa) return { ...SEM_ACESSO };
    if (empresa.sys_config?.[CHAVE_ACESSO_SIMULADORES] === undefined) return { ...ACESSO_ATUAL };
    if (!colaborador.cargo) return acessoDoCargo(empresa.sys_config, null);
    // Nome normalizado (caixa, acento, espaços), a mesma régua dos painéis de equipe.
    const { data: cargos, error: erroCargo } = await tdb.from('cargos_empresa').select('id,nome');
    if (erroCargo) return await leituraFalhou(colaborador, 'cargos da empresa', erroCargo.message);
    return acessoDoCargo(empresa.sys_config, idDoCargo(mapaDeCargos(cargos || []), colaborador.cargo));
  } catch (e) {
    return await leituraFalhou(colaborador, 'exceção', e instanceof Error ? e.message : String(e));
  }
}
