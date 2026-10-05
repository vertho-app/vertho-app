'use server';

// Contratos da DRE por tenant (mig 276).
//
// Todo export aqui é endpoint HTTP (regra do repo): cada um passa por
// `executarAcaoDre`, que aplica o gate de plataforma + `dre.manage`, valida o
// corpo com zod e devolve `{ success, data | error }`. O ator vem da SESSÃO.
//
// Dinheiro: toda escrita grava em `admin_audit_log` (`dre.contrato.*`) com o
// ANTES e o DEPOIS. Os sócios lançam aqui (decisão do dono, 05/10/2026), e o
// rastro é a contrapartida de dar essa escrita a mais de uma pessoa.

import { logAdminAction } from '@/lib/audit';
import { ErroDre, executarAcaoDre } from '@/lib/dre/acao';
import { gerarParcelas } from '@/lib/dre/parcelas';
import { congelarPrevisto } from '@/lib/dre/previsto';
import {
  SchemaAtualizarContrato,
  SchemaCriarContrato,
  SchemaExcluirContrato,
  SchemaListarOrcamentos,
  SchemaRegerarParcelas,
} from '@/lib/dre/schemas';
import { normalizarResumo } from '@/lib/orcamento/cenario';

export async function listarOrcamentosParaContrato(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaListarOrcamentos, raw ?? {}, async ({ sb }) => {
    const { data, error } = await sb
      .from('orcamento_cenarios')
      .select('id, nome, cliente, resultado, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(`orcamento_cenarios: ${error.message}`);

    const { data: vinculados, error: errVinc } = await sb
      .from('dre_contratos')
      .select('orcamento_id')
      .not('orcamento_id', 'is', null)
      .limit(1000);
    if (errVinc) throw new Error(`dre_contratos: ${errVinc.message}`);
    const jaVinculados = new Set((vinculados ?? []).map((v: any) => String(v.orcamento_id)));

    return (data ?? [])
      .map((o: any) => {
        const r = normalizarResumo(o.resultado);
        if (!r) return null;
        return {
          id: String(o.id),
          nome: String(o.nome ?? ''),
          cliente: o.cliente ? String(o.cliente) : null,
          valorFinal: r.valorFinal,
          parcelas: r.parcelas,
          parcela: r.parcela,
          margemPct: r.margemPct,
          criadoEm: String(o.created_at ?? ''),
          jaVinculado: jaVinculados.has(String(o.id)),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      nome: string;
      cliente: string | null;
      valorFinal: number;
      parcelas: number;
      parcela: number;
      margemPct: number;
      criadoEm: string;
      jaVinculado: boolean;
    }>;
  });
}

export async function criarContrato(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaCriarContrato, raw, async ({ sb, email }, input) => {
    const { data: emp, error: errEmp } = await sb.from('empresas').select('id, nome').eq('id', input.empresaId).maybeSingle();
    if (errEmp) throw new Error(`empresas: ${errEmp.message}`);
    if (!emp) throw new ErroDre('Empresa não encontrada.');

    let previsto: ReturnType<typeof congelarPrevisto> = null;
    let previstoEm: string | null = null;
    if (input.orcamentoId) {
      const { data: orc, error: errOrc } = await sb
        .from('orcamento_cenarios')
        .select('id, nome, entradas, resultado')
        .eq('id', input.orcamentoId)
        .maybeSingle();
      if (errOrc) throw new Error(`orcamento_cenarios: ${errOrc.message}`);
      if (!orc) throw new ErroDre('Orçamento não encontrado.');
      previsto = congelarPrevisto(orc.resultado, orc.entradas, String(orc.nome ?? ''));
      if (!previsto) throw new ErroDre('Esse orçamento não tem a folha de decisão salva. Abra-o no deal desk e salve de novo.');
      previstoEm = new Date().toISOString();
    }

    const { data: criado, error: errIns } = await sb
      .from('dre_contratos')
      .insert({
        empresa_id: emp.id,
        empresa_nome: String(emp.nome ?? ''),
        chave_empresa: String(emp.id),
        nome: input.nome,
        valor_total_brl: input.valorTotalBrl,
        inicio: input.inicio,
        status: 'em_vigor',
        orcamento_id: input.orcamentoId ?? null,
        previsto,
        previsto_congelado_em: previstoEm,
        criado_por: email,
      })
      .select('id')
      .single();
    if (errIns) throw new Error(`dre_contratos: ${errIns.message}`);
    const contratoId = String(criado.id);

    let nParcelas = 0;
    if (input.parcelas) {
      const geradas = gerarParcelas({
        valorTotalBrl: input.valorTotalBrl,
        n: input.parcelas.n,
        primeiroVencimento: input.parcelas.primeiroVencimento,
      });
      const { error: errParc } = await sb.from('dre_parcelas').insert(
        geradas.map((p) => ({
          contrato_id: contratoId,
          numero: p.numero,
          vencimento: p.vencimento,
          valor_previsto_brl: p.valorPrevistoBrl,
          criado_por: email,
        })),
      );
      if (errParc) {
        // supabase-js não tem transação: o insert das parcelas é uma instrução só
        // (atômica), então falhar deixa ZERO parcelas e basta desfazer o contrato.
        const { error: errDesfazer } = await sb.from('dre_contratos').delete().eq('id', contratoId);
        if (errDesfazer) console.error('[dre] não consegui desfazer o contrato órfão', contratoId, errDesfazer.message);
        throw new Error(`dre_parcelas: ${errParc.message}`);
      }
      nParcelas = geradas.length;
    }

    await logAdminAction({
      adminEmail: email,
      acao: 'dre.contrato.criar',
      empresaId: String(emp.id),
      alvo: input.nome,
      detalhes: {
        contratoId,
        valorTotalBrl: input.valorTotalBrl,
        inicio: input.inicio,
        orcamentoId: input.orcamentoId ?? null,
        parcelas: nParcelas,
        previstoCongelado: !!previsto,
      },
    });
    return { id: contratoId, parcelas: nParcelas };
  });
}

export async function atualizarContrato(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaAtualizarContrato, raw, async ({ sb, email }, input) => {
    const { data: antes, error: errLeitura } = await sb.from('dre_contratos').select('*').eq('id', input.id).maybeSingle();
    if (errLeitura) throw new Error(`dre_contratos: ${errLeitura.message}`);
    if (!antes) throw new ErroDre('Contrato não encontrado.');

    const mudancas: Record<string, unknown> = {};
    if (input.nome !== undefined && input.nome !== antes.nome) mudancas.nome = input.nome;
    if (input.valorTotalBrl !== undefined && Number(input.valorTotalBrl) !== Number(antes.valor_total_brl)) {
      mudancas.valor_total_brl = input.valorTotalBrl;
    }
    if (input.inicio !== undefined && input.inicio !== String(antes.inicio).slice(0, 10)) mudancas.inicio = input.inicio;
    if (input.status !== undefined && input.status !== antes.status) mudancas.status = input.status;
    if (!Object.keys(mudancas).length) throw new ErroDre('Nada para atualizar.');

    const { error: errUpd } = await sb
      .from('dre_contratos')
      .update({ ...mudancas, atualizado_por: email, updated_at: new Date().toISOString() })
      .eq('id', input.id);
    if (errUpd) throw new Error(`dre_contratos: ${errUpd.message}`);

    const antesCampos: Record<string, unknown> = {};
    for (const k of Object.keys(mudancas)) antesCampos[k] = antes[k];
    await logAdminAction({
      adminEmail: email,
      acao: 'dre.contrato.atualizar',
      empresaId: antes.empresa_id ?? null,
      alvo: String(antes.nome ?? ''),
      detalhes: { contratoId: input.id, antes: antesCampos, depois: mudancas },
    });
    return { id: input.id };
  });
}

export async function excluirContrato(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaExcluirContrato, raw, async ({ sb, email }, input) => {
    const { data: contrato, error: errC } = await sb.from('dre_contratos').select('*').eq('id', input.id).maybeSingle();
    if (errC) throw new Error(`dre_contratos: ${errC.message}`);
    if (!contrato) throw new ErroDre('Contrato não encontrado.');

    const { data: parcelas, error: errP } = await sb
      .from('dre_parcelas')
      .select('id, numero, vencimento, valor_previsto_brl, recebido_em, valor_recebido_brl')
      .eq('contrato_id', input.id)
      .order('numero');
    if (errP) throw new Error(`dre_parcelas: ${errP.message}`);
    if ((parcelas ?? []).some((p: any) => p.recebido_em)) {
      throw new ErroDre('Este contrato já tem parcela recebida. Cancele-o em vez de apagar: o dinheiro que entrou continua na DRE.');
    }

    // O RESTRICT do banco impõe a ordem: parcelas antes do contrato.
    const { error: errDelP } = await sb.from('dre_parcelas').delete().eq('contrato_id', input.id);
    if (errDelP) throw new Error(`dre_parcelas: ${errDelP.message}`);
    const { error: errDelC } = await sb.from('dre_contratos').delete().eq('id', input.id);
    if (errDelC) throw new Error(`dre_contratos: ${errDelC.message}`);

    await logAdminAction({
      adminEmail: email,
      acao: 'dre.contrato.excluir',
      empresaId: contrato.empresa_id ?? null,
      alvo: String(contrato.nome ?? ''),
      detalhes: { contrato, parcelasApagadas: parcelas ?? [] },
    });
    return { id: input.id };
  });
}

export async function regerarParcelas(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaRegerarParcelas, raw, async ({ sb, email }, input) => {
    const { data: contrato, error: errC } = await sb.from('dre_contratos').select('*').eq('id', input.contratoId).maybeSingle();
    if (errC) throw new Error(`dre_contratos: ${errC.message}`);
    if (!contrato) throw new ErroDre('Contrato não encontrado.');

    const { data: antigas, error: errP } = await sb.from('dre_parcelas').select('*').eq('contrato_id', input.contratoId).order('numero');
    if (errP) throw new Error(`dre_parcelas: ${errP.message}`);
    if ((antigas ?? []).some((p: any) => p.recebido_em)) {
      throw new ErroDre('Há parcela já recebida: não dá para refazer o calendário inteiro. Edite as parcelas a receber uma a uma.');
    }

    const geradas = gerarParcelas({
      valorTotalBrl: Number(contrato.valor_total_brl),
      n: input.n,
      primeiroVencimento: input.primeiroVencimento,
    });

    const { error: errDel } = await sb.from('dre_parcelas').delete().eq('contrato_id', input.contratoId);
    if (errDel) throw new Error(`dre_parcelas: ${errDel.message}`);
    const { error: errIns } = await sb.from('dre_parcelas').insert(
      geradas.map((p) => ({
        contrato_id: input.contratoId,
        numero: p.numero,
        vencimento: p.vencimento,
        valor_previsto_brl: p.valorPrevistoBrl,
        criado_por: email,
      })),
    );
    if (errIns) {
      // Sem transação: devolve as parcelas antigas (nenhuma estava recebida).
      if ((antigas ?? []).length) {
        const { error: errVolta } = await sb.from('dre_parcelas').insert(antigas);
        if (errVolta) console.error('[dre] não consegui restaurar as parcelas antigas de', input.contratoId, errVolta.message);
      }
      throw new Error(`dre_parcelas: ${errIns.message}`);
    }

    await logAdminAction({
      adminEmail: email,
      acao: 'dre.contrato.regerar_parcelas',
      empresaId: contrato.empresa_id ?? null,
      alvo: String(contrato.nome ?? ''),
      detalhes: {
        contratoId: input.contratoId,
        antes: (antigas ?? []).map((p: any) => ({ numero: p.numero, vencimento: p.vencimento, valor: p.valor_previsto_brl })),
        depois: geradas,
      },
    });
    return { parcelas: geradas.length };
  });
}
