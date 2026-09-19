'use server';

import { z } from 'zod';
import { requireAdminAction } from '@/lib/auth/action-context';
import { tenantDb } from '@/lib/tenant-db';
import { gravarSysConfig } from '@/lib/sys-config-escrita';
import { logAdminAction } from '@/lib/audit';
import { MODULOS, canUseModulo } from '@/lib/access-gates/modulos';
import { acessoDoCargo, CHAVE_ACESSO_SIMULADORES, type AcessoSimuladores, type Simulador } from '@/lib/simuladores/acesso-cargo';
import { ehCargoAncora } from '@/lib/simuladores/lideranca/instalar';
import { periodoVigente } from '@/lib/simulador-vendas/prazo';
import { DOMINIO_PADRAO, dominioExiste } from '@/lib/recepcao/dominio';
import { chaveCompetencia, lerConfigProntidao } from '@/lib/prontidao-lideranca/config';

const cargoSchema = z.object({
  cargoId: z.uuid(),
  acesso: z.object({ vendas: z.boolean(), atendimento: z.boolean(), lideranca: z.boolean() }).strict(),
  anterior: z.object({ vendas: z.boolean(), atendimento: z.boolean(), lideranca: z.boolean() }).strict(),
}).strict();
type AlteracaoCargo = { cargoId: string; acesso: AcessoSimuladores; anterior: AcessoSimuladores };
// O formato individual permanece válido para abas abertas antes deste deploy.
const entradaSchema = z.union([
  z.object({ empresaId: z.uuid(), cargos: z.array(cargoSchema).min(1).max(1000) }).strict(),
  cargoSchema.extend({ empresaId: z.uuid() }).transform(({ empresaId, ...cargo }) => ({ empresaId, cargos: [cargo] })),
]);

export type PrazoVendas = 'vigente' | 'futuro' | 'encerrado' | 'sem_prazo';
export type ProgramaLideranca = 'ok' | 'sem_config' | 'sem_cargo_alvo';
const DIA_MS = 24 * 60 * 60 * 1000;

export async function carregarAcessosSimuladores(empresaId: string) {
  await requireAdminAction();
  if (!z.uuid().safeParse(empresaId).success) return { success: false as const, error: 'Selecione uma empresa válida.' };
  try {
    const tdb = tenantDb(empresaId);
    const cargos: Array<{ id: string; nome: string; descricao: string | null }> = [];
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await tdb.from('cargos_empresa').select('id,nome,descricao')
        .order('nome').order('id').range(pagina * 1000, pagina * 1000 + 999);
      if (error) return { success: false as const, error: 'Não foi possível carregar os cargos.' };
      cargos.push(...data);
      if (data.length < 1000) break;
    }
    const agora = Date.now();
    // Treino iniciado por quem é da empresa; o teste de administrador da plataforma não entra.
    const treinos = (tabela: string) => tdb.from(tabela).select('id', { count: 'exact', head: true })
      .like('owner_key', 'colab:%').gte('created_at', new Date(agora - 30 * DIA_MS).toISOString());
    const [empresa, vendas, atendimento, ...contagens] = await Promise.all([
      tdb.raw.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle(),
      tdb.from('sim_vendas_config').select('habilitado,periodo_inicio,periodo_fim').maybeSingle(),
      tdb.from('recepcao_config').select('habilitado,dominio').maybeSingle(),
      treinos('sim_vendas_sessoes'), treinos('recepcao_sessoes'), treinos('sim_lideranca_jornadas'),
    ]);
    if (empresa.error || !empresa.data || vendas.error || atendimento.error)
      return { success: false as const, error: 'Não foi possível carregar as liberações da empresa.' };
    const sysConfig = empresa.data.sys_config;
    const cfgVendas = vendas.data;
    const prazo: PrazoVendas = !cfgVendas?.periodo_inicio || !cfgVendas?.periodo_fim ? 'sem_prazo'
      : periodoVigente(cfgVendas, agora) ? 'vigente'
        : agora < Date.parse(cfgVendas.periodo_inicio) ? 'futuro' : 'encerrado';
    const segmento: string = atendimento.data?.dominio || DOMINIO_PADRAO;
    // Os mesmos dois motivos pelos quais o trilho da liderança recusa TODO mundo.
    const cfgLideranca = lerConfigProntidao(sysConfig);
    const programa: ProgramaLideranca = !cfgLideranca ? 'sem_config'
      : cargos.some(c => chaveCompetencia(c.nome) === chaveCompetencia(cfgLideranca.cargo_alvo)) ? 'ok' : 'sem_cargo_alvo';
    // Contagem que falhou é "indisponível", nunca zero.
    const [tVendas, tAtendimento, tLideranca] = contagens.map(r => (r.error ? null : (r.count ?? null)));
    return {
      success: true as const,
      // Âncora da matriz de liderança é cargo da plataforma, não da empresa: fora da tabela.
      cargos: cargos.filter(c => !ehCargoAncora(c))
        .map(({ id, nome }) => ({ id, nome, acesso: acessoDoCargo(sysConfig, id) })),
      habilitados: {
        vendas: cfgVendas?.habilitado === true, atendimento: atendimento.data?.habilitado === true,
        lideranca: canUseModulo(sysConfig, MODULOS.PRONTIDAO_LIDERANCA).allowed,
      },
      resumo: {
        vendas: { prazo, inicio: cfgVendas?.periodo_inicio ?? null, fim: cfgVendas?.periodo_fim ?? null },
        atendimento: { segmento, segmentoReconhecido: dominioExiste(segmento) },
        lideranca: { programa },
        treinos30d: { vendas: tVendas, atendimento: tAtendimento, lideranca: tLideranca } as Record<Simulador, number | null>,
      },
    };
  } catch {
    return { success: false as const, error: 'Não foi possível carregar as liberações. Tente novamente.' };
  }
}

export async function salvarAcessoSimuladores(entrada: { empresaId: string } & (AlteracaoCargo | { cargos: AlteracaoCargo[] })) {
  const auth = await requireAdminAction('settings.company.manage');
  const parsed = entradaSchema.safeParse(entrada);
  if (!parsed.success) return { success: false, error: 'Configuração de acesso inválida.' };
  const { empresaId, cargos } = parsed.data;
  const ids = cargos.map(c => c.cargoId);
  if (new Set(ids).size !== ids.length) return { success: false, error: 'Há cargos repetidos na configuração.' };
  try {
    const tdb = tenantDb(empresaId);
    // Valida todos os cargos antes da única gravação, em blocos para limitar a URL do PostgREST.
    for (let inicio = 0; inicio < ids.length; inicio += 100) {
      const bloco = ids.slice(inicio, inicio + 100);
      const { data, error } = await tdb.from('cargos_empresa').select('id').in('id', bloco);
      if (error) return { success: false, error: 'Não foi possível consultar os cargos.' };
      const encontrados = new Set((data || []).map(c => c.id));
      if (bloco.some(id => !encontrados.has(id))) return { success: false, error: 'Cargo não encontrado nesta empresa.' };
    }
    const result = await gravarSysConfig(tdb, empresaId, atual => {
      const regras = { ...(atual[CHAVE_ACESSO_SIMULADORES] || {}) };
      for (const { cargoId, acesso, anterior } of cargos) {
        const gravado = acessoDoCargo(atual, cargoId);
        if (Object.keys(anterior).some(chave => gravado[chave] !== anterior[chave]))
          return { erro: 'Outra pessoa alterou os acessos de um dos cargos. Recarregue a aba antes de salvar.' };
        regras[cargoId] = acesso;
      }
      return { ...atual, [CHAVE_ACESSO_SIMULADORES]: regras };
    });
    if (!result.ok) return { success: false, error: result.erro };
    await Promise.all(cargos.map(({ cargoId, anterior, acesso }) => logAdminAction({
      adminEmail: auth.email, empresaId, acao: 'simuladores.acesso_cargo', alvo: cargoId, detalhes: { anterior, acesso },
    })));
    return { success: true };
  } catch {
    return { success: false, error: 'Não foi possível salvar os acessos. Tente novamente.' };
  }
}
