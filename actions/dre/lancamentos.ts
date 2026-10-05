'use server';

// Lançamentos manuais da DRE (mig 276): horas de gente, impostos, comissão,
// infraestrutura, WhatsApp, terceiros e outros.
//
// O que NÃO vem do cliente: o valor das horas. O cliente manda horas e custo/hora
// e o SERVIDOR calcula `valor = round(horas × custo/hora, 2)`; o banco ainda
// confere a amarra (`dre_lancamentos_horas_coerentes`). Um valor digitado que
// diverge do cálculo nunca entra.
//
// Todo export é endpoint HTTP: gate + zod em `executarAcaoDre`, ator da sessão,
// auditoria com antes e depois (`dre.lancamento.*`).

import { logAdminAction } from '@/lib/audit';
import { ErroDre, executarAcaoDre } from '@/lib/dre/acao';
import { valorDasHoras } from '@/lib/dre/dinheiro';
import { SchemaExcluirLancamento, SchemaSalvarLancamento } from '@/lib/dre/schemas';
import { semanaAtualBRT } from '@/lib/dre/semana';
import { CHAVE_SEM_TENANT } from '@/lib/dre/tipos';
import { ORCAMENTO_DEFAULTS } from '@/lib/orcamento/precificacao';

export async function salvarLancamento(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaSalvarLancamento, raw, async ({ sb, email }, input) => {
    if (input.semanaInicio > semanaAtualBRT(new Date())) {
      throw new ErroDre('Não dá para lançar custo numa semana que ainda não começou.');
    }

    // Tenant: custo de empresa exige a empresa; custo de plataforma não tem tenant.
    let empresaId: string | null = null;
    let empresaNome: string | null = null;
    let chave = CHAVE_SEM_TENANT;
    if (input.escopo === 'empresa') {
      if (!input.empresaId) throw new ErroDre('Escolha a empresa deste custo (ou use "plataforma" para custo geral).');
      const { data: emp, error: errEmp } = await sb.from('empresas').select('id, nome').eq('id', input.empresaId).maybeSingle();
      if (errEmp) throw new Error(`empresas: ${errEmp.message}`);
      if (!emp) throw new ErroDre('Empresa não encontrada.');
      empresaId = String(emp.id);
      empresaNome = String(emp.nome ?? '');
      chave = empresaId;
    }

    // Valor: horas × custo/hora no servidor; as demais categorias usam o valor informado.
    let horas: number | null = null;
    let custoHora: number | null = null;
    let valor: number;
    if (input.categoria === 'horas') {
      if (!input.horas) throw new ErroDre('Informe as horas trabalhadas.');
      horas = input.horas;
      custoHora = input.custoHoraBrl ?? ORCAMENTO_DEFAULTS.custoHora;
      valor = valorDasHoras(horas, custoHora);
      if (!(valor > 0)) throw new ErroDre('Horas × custo por hora resultou em R$ 0: confira o custo por hora.');
    } else {
      if (!input.valorBrl) throw new ErroDre('Informe o valor do custo.');
      valor = input.valorBrl;
    }

    const linha = {
      escopo: input.escopo,
      empresa_id: empresaId,
      empresa_nome: empresaNome,
      chave_empresa: chave,
      semana_inicio: input.semanaInicio,
      categoria: input.categoria,
      descricao: input.descricao ?? null,
      horas,
      custo_hora_brl: custoHora,
      responsavel: input.responsavel ?? null,
      valor_brl: valor,
    };

    if (input.id) {
      const { data: antes, error: errLeitura } = await sb.from('dre_lancamentos').select('*').eq('id', input.id).maybeSingle();
      if (errLeitura) throw new Error(`dre_lancamentos: ${errLeitura.message}`);
      if (!antes) throw new ErroDre('Lançamento não encontrado.');
      const { error } = await sb
        .from('dre_lancamentos')
        .update({ ...linha, atualizado_por: email, updated_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw new Error(`dre_lancamentos: ${error.message}`);
      await logAdminAction({
        adminEmail: email,
        acao: 'dre.lancamento.atualizar',
        empresaId: empresaId ?? antes.empresa_id ?? null,
        alvo: `${input.categoria} · semana ${input.semanaInicio}`,
        detalhes: { lancamentoId: input.id, antes, depois: linha },
      });
      return { id: input.id };
    }

    const { data: criado, error } = await sb
      .from('dre_lancamentos')
      .insert({ ...linha, criado_por: email })
      .select('id')
      .single();
    if (error) throw new Error(`dre_lancamentos: ${error.message}`);
    await logAdminAction({
      adminEmail: email,
      acao: 'dre.lancamento.criar',
      empresaId,
      alvo: `${input.categoria} · semana ${input.semanaInicio}`,
      detalhes: { lancamentoId: criado.id, depois: linha },
    });
    return { id: String(criado.id) };
  });
}

export async function excluirLancamento(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaExcluirLancamento, raw, async ({ sb, email }, input) => {
    const { data: antes, error: errLeitura } = await sb.from('dre_lancamentos').select('*').eq('id', input.id).maybeSingle();
    if (errLeitura) throw new Error(`dre_lancamentos: ${errLeitura.message}`);
    if (!antes) throw new ErroDre('Lançamento não encontrado.');

    const { error } = await sb.from('dre_lancamentos').delete().eq('id', input.id);
    if (error) throw new Error(`dre_lancamentos: ${error.message}`);

    await logAdminAction({
      adminEmail: email,
      acao: 'dre.lancamento.excluir',
      empresaId: antes.empresa_id ?? null,
      alvo: `${antes.categoria} · semana ${String(antes.semana_inicio).slice(0, 10)}`,
      detalhes: { lancamento: antes },
    });
    return { id: input.id };
  });
}
