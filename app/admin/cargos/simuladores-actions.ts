'use server';

import { z } from 'zod';
import { requireAdminAction } from '@/lib/auth/action-context';
import { tenantDb } from '@/lib/tenant-db';
import { gravarSysConfig } from '@/lib/sys-config-escrita';
import { logAdminAction } from '@/lib/audit';
import { MODULOS, canUseModulo } from '@/lib/access-gates/modulos';
import { acessoDoCargo, CHAVE_ACESSO_SIMULADORES, type AcessoSimuladores } from '@/lib/simuladores/acesso-cargo';

const entradaSchema = z.object({
  empresaId: z.uuid(), cargoId: z.uuid(),
  acesso: z.object({ vendas: z.boolean(), atendimento: z.boolean(), lideranca: z.boolean() }).strict(),
  anterior: z.object({ vendas: z.boolean(), atendimento: z.boolean(), lideranca: z.boolean() }).strict(),
}).strict();

export async function carregarAcessosSimuladores(empresaId: string) {
  await requireAdminAction();
  if (!z.uuid().safeParse(empresaId).success) return { success: false as const, error: 'Selecione uma empresa válida.' };
  try {
    const tdb = tenantDb(empresaId);
    const cargos: Array<{ id: string; nome: string }> = [];
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await tdb.from('cargos_empresa').select('id,nome')
        .order('nome').order('id').range(pagina * 1000, pagina * 1000 + 999);
      if (error) return { success: false as const, error: 'Não foi possível carregar os cargos.' };
      cargos.push(...data);
      if (data.length < 1000) break;
    }
    const [empresa, vendas, atendimento] = await Promise.all([
      tdb.raw.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle(),
      tdb.from('sim_vendas_config').select('habilitado').maybeSingle(),
      tdb.from('recepcao_config').select('habilitado').maybeSingle(),
    ]);
    if (empresa.error || !empresa.data || vendas.error || atendimento.error)
      return { success: false as const, error: 'Não foi possível carregar as liberações da empresa.' };
    return {
      success: true as const,
      cargos: cargos.map(cargo => ({ ...cargo, acesso: acessoDoCargo(empresa.data.sys_config, cargo.id) })),
      habilitados: {
        vendas: vendas.data?.habilitado === true, atendimento: atendimento.data?.habilitado === true,
        lideranca: canUseModulo(empresa.data.sys_config, MODULOS.PRONTIDAO_LIDERANCA).allowed,
      },
    };
  } catch {
    return { success: false as const, error: 'Não foi possível carregar as liberações. Tente novamente.' };
  }
}

export async function salvarAcessoSimuladores(entrada: {
  empresaId: string; cargoId: string; acesso: AcessoSimuladores; anterior: AcessoSimuladores;
}) {
  const auth = await requireAdminAction('settings.company.manage');
  const parsed = entradaSchema.safeParse(entrada);
  if (!parsed.success) return { success: false, error: 'Configuração de acesso inválida.' };
  const { empresaId, cargoId, acesso, anterior } = parsed.data;
  try {
    const tdb = tenantDb(empresaId);
    const { data: cargo, error } = await tdb.from('cargos_empresa').select('id').eq('id', cargoId).maybeSingle();
    if (error) return { success: false, error: 'Não foi possível consultar o cargo.' };
    if (!cargo) return { success: false, error: 'Cargo não encontrado nesta empresa.' };
    const result = await gravarSysConfig(tdb, empresaId, atual => {
      const gravado = acessoDoCargo(atual, cargoId);
      if (Object.keys(anterior).some(chave => gravado[chave] !== anterior[chave]))
        return { erro: 'Outra pessoa alterou os acessos deste cargo. Recarregue a aba antes de salvar.' };
      return { ...atual, [CHAVE_ACESSO_SIMULADORES]: { ...(atual[CHAVE_ACESSO_SIMULADORES] || {}), [cargoId]: acesso } };
    });
    if (!result.ok) return { success: false, error: result.erro };
    await logAdminAction({ adminEmail: auth.email, empresaId, acao: 'simuladores.acesso_cargo', alvo: cargoId, detalhes: { anterior, acesso } });
    return { success: true };
  } catch {
    return { success: false, error: 'Não foi possível salvar os acessos. Tente novamente.' };
  }
}
