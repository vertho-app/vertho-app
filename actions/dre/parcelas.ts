'use server';

// Parcelas e recebimentos da DRE (mig 276).
//
// A RECEITA da DRE é o que entra por aqui: `registrarRecebimento` é o único
// caminho que transforma uma parcela em receita (por caixa: conta na semana de
// `recebido_em`). Parcela sem recebimento é previsão, e a DRE não a soma.
//
// Todo export é endpoint HTTP: gate + zod em `executarAcaoDre`, ator da sessão,
// auditoria com antes e depois em toda escrita (`dre.parcela.*`).

import { logAdminAction } from '@/lib/audit';
import { ErroDre, executarAcaoDre } from '@/lib/dre/acao';
import {
  SchemaAdicionarParcela,
  SchemaAtualizarParcela,
  SchemaDesfazerRecebimento,
  SchemaExcluirParcela,
  SchemaRegistrarRecebimento,
} from '@/lib/dre/schemas';
import { dataBRT } from '@/lib/dre/semana';

/** A parcela com o contrato dela (para auditar no tenant certo). */
async function lerParcela(sb: any, id: string) {
  const { data: parcela, error } = await sb.from('dre_parcelas').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`dre_parcelas: ${error.message}`);
  if (!parcela) throw new ErroDre('Parcela não encontrada.');
  const { data: contrato, error: errC } = await sb
    .from('dre_contratos')
    .select('id, nome, empresa_id')
    .eq('id', parcela.contrato_id)
    .maybeSingle();
  if (errC) throw new Error(`dre_contratos: ${errC.message}`);
  return { parcela, contrato };
}

export async function registrarRecebimento(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaRegistrarRecebimento, raw, async ({ sb, email }, input) => {
    // Caixa é o que JÁ entrou: data no futuro é previsão disfarçada de receita.
    if (input.recebidoEm > dataBRT(new Date())) {
      throw new ErroDre('A data de recebimento não pode ser futura. Parcela que ainda não entrou fica como "a receber".');
    }
    const { parcela, contrato } = await lerParcela(sb, input.parcelaId);

    const depois = {
      recebido_em: input.recebidoEm,
      valor_recebido_brl: input.valorRecebidoBrl,
      nota_fiscal: input.notaFiscal ?? parcela.nota_fiscal ?? null,
    };
    const { error } = await sb
      .from('dre_parcelas')
      .update({ ...depois, atualizado_por: email, updated_at: new Date().toISOString() })
      .eq('id', input.parcelaId);
    if (error) throw new Error(`dre_parcelas: ${error.message}`);

    await logAdminAction({
      adminEmail: email,
      acao: 'dre.parcela.receber',
      empresaId: contrato?.empresa_id ?? null,
      alvo: `${contrato?.nome ?? 'contrato'} · parcela ${parcela.numero}`,
      detalhes: {
        parcelaId: input.parcelaId,
        antes: { recebido_em: parcela.recebido_em, valor_recebido_brl: parcela.valor_recebido_brl, nota_fiscal: parcela.nota_fiscal },
        depois,
      },
    });
    return { id: input.parcelaId };
  });
}

export async function desfazerRecebimento(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaDesfazerRecebimento, raw, async ({ sb, email }, input) => {
    const { parcela, contrato } = await lerParcela(sb, input.parcelaId);
    if (!parcela.recebido_em) throw new ErroDre('Esta parcela não está marcada como recebida.');

    const { error } = await sb
      .from('dre_parcelas')
      .update({ recebido_em: null, valor_recebido_brl: null, atualizado_por: email, updated_at: new Date().toISOString() })
      .eq('id', input.parcelaId);
    if (error) throw new Error(`dre_parcelas: ${error.message}`);

    await logAdminAction({
      adminEmail: email,
      acao: 'dre.parcela.desfazer_recebimento',
      empresaId: contrato?.empresa_id ?? null,
      alvo: `${contrato?.nome ?? 'contrato'} · parcela ${parcela.numero}`,
      detalhes: {
        parcelaId: input.parcelaId,
        antes: { recebido_em: parcela.recebido_em, valor_recebido_brl: parcela.valor_recebido_brl },
      },
    });
    return { id: input.parcelaId };
  });
}

export async function atualizarParcela(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaAtualizarParcela, raw, async ({ sb, email }, input) => {
    const { parcela, contrato } = await lerParcela(sb, input.id);

    const mudancas: Record<string, unknown> = {};
    if (input.vencimento !== undefined && input.vencimento !== String(parcela.vencimento).slice(0, 10)) mudancas.vencimento = input.vencimento;
    if (input.valorPrevistoBrl !== undefined && Number(input.valorPrevistoBrl) !== Number(parcela.valor_previsto_brl)) {
      mudancas.valor_previsto_brl = input.valorPrevistoBrl;
    }
    if (input.observacao !== undefined && (input.observacao ?? null) !== (parcela.observacao ?? null)) mudancas.observacao = input.observacao ?? null;
    if (input.notaFiscal !== undefined && (input.notaFiscal ?? null) !== (parcela.nota_fiscal ?? null)) mudancas.nota_fiscal = input.notaFiscal ?? null;
    if (!Object.keys(mudancas).length) throw new ErroDre('Nada para atualizar.');

    const { error } = await sb
      .from('dre_parcelas')
      .update({ ...mudancas, atualizado_por: email, updated_at: new Date().toISOString() })
      .eq('id', input.id);
    if (error) throw new Error(`dre_parcelas: ${error.message}`);

    const antes: Record<string, unknown> = {};
    for (const k of Object.keys(mudancas)) antes[k] = parcela[k];
    await logAdminAction({
      adminEmail: email,
      acao: 'dre.parcela.editar',
      empresaId: contrato?.empresa_id ?? null,
      alvo: `${contrato?.nome ?? 'contrato'} · parcela ${parcela.numero}`,
      detalhes: { parcelaId: input.id, antes, depois: mudancas },
    });
    return { id: input.id };
  });
}

export async function adicionarParcela(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaAdicionarParcela, raw, async ({ sb, email }, input) => {
    const { data: contrato, error: errC } = await sb
      .from('dre_contratos')
      .select('id, nome, empresa_id')
      .eq('id', input.contratoId)
      .maybeSingle();
    if (errC) throw new Error(`dre_contratos: ${errC.message}`);
    if (!contrato) throw new ErroDre('Contrato não encontrado.');

    const { data: ultima, error: errU } = await sb
      .from('dre_parcelas')
      .select('numero')
      .eq('contrato_id', input.contratoId)
      .order('numero', { ascending: false })
      .limit(1);
    if (errU) throw new Error(`dre_parcelas: ${errU.message}`);
    const numero = (ultima?.[0]?.numero ?? 0) + 1;

    const { data: criada, error } = await sb
      .from('dre_parcelas')
      .insert({
        contrato_id: input.contratoId,
        numero,
        vencimento: input.vencimento,
        valor_previsto_brl: input.valorPrevistoBrl,
        criado_por: email,
      })
      .select('id')
      .single();
    if (error) throw new Error(`dre_parcelas: ${error.message}`);

    await logAdminAction({
      adminEmail: email,
      acao: 'dre.parcela.adicionar',
      empresaId: contrato.empresa_id ?? null,
      alvo: `${contrato.nome} · parcela ${numero}`,
      detalhes: { parcelaId: criada.id, vencimento: input.vencimento, valorPrevistoBrl: input.valorPrevistoBrl },
    });
    return { id: String(criada.id), numero };
  });
}

export async function excluirParcela(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaExcluirParcela, raw, async ({ sb, email }, input) => {
    const { parcela, contrato } = await lerParcela(sb, input.id);
    if (parcela.recebido_em) {
      throw new ErroDre('Parcela já recebida não se apaga: desfaça o recebimento antes, se foi lançado por engano.');
    }
    const { error } = await sb.from('dre_parcelas').delete().eq('id', input.id);
    if (error) throw new Error(`dre_parcelas: ${error.message}`);

    await logAdminAction({
      adminEmail: email,
      acao: 'dre.parcela.excluir',
      empresaId: contrato?.empresa_id ?? null,
      alvo: `${contrato?.nome ?? 'contrato'} · parcela ${parcela.numero}`,
      detalhes: { parcela },
    });
    return { id: input.id };
  });
}
