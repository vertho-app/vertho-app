'use server';

// Câmbio e fechamento semanal da DRE (mig 276).
//
// `definirCambio` é a correção manual do câmbio de uma semana (o BCB fora do ar,
// ou uma cotação de contrato diferente da PTAX). Uma cotação `manual` nunca é
// sobrescrita pelo cron. Ao defini-la, o custo de IA JÁ FECHADO daquela semana é
// reconvertido, porque o fechamento congela o câmbio da linha.
//
// `recalcularSemana` refaz o fechamento de uma semana já encerrada (o Batch API
// pode gravar linha tardia no ledger, e o cron só passa uma vez).
//
// Todo export é endpoint HTTP: gate + zod em `executarAcaoDre`, ator da sessão,
// auditoria com antes e depois.

import { logAdminAction } from '@/lib/audit';
import { ErroDre, executarAcaoDre } from '@/lib/dre/acao';
import { lerCambio } from '@/lib/dre/cambio';
import { arredondar2 } from '@/lib/dre/dinheiro';
import { fecharSemana } from '@/lib/dre/fechamento';
import { SchemaDefinirCambio, SchemaRecalcularSemana } from '@/lib/dre/schemas';
import { ultimaSemanaFechadaBRT } from '@/lib/dre/semana';

export async function definirCambio(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaDefinirCambio, raw, async ({ sb, email }, input) => {
    const antes = await lerCambio(sb, input.semanaInicio);

    const { error } = await sb.from('dre_cambio_semanal').upsert(
      {
        semana_inicio: input.semanaInicio,
        usd_brl: input.usdBrl,
        fonte: 'manual',
        obtido_em: new Date().toISOString(),
        definido_por: email,
      },
      { onConflict: 'semana_inicio' },
    );
    if (error) throw new Error(`dre_cambio_semanal: ${error.message}`);

    // O fechamento congela o câmbio: reconverte as linhas já fechadas da semana.
    const { data: linhas, error: errLinhas } = await sb
      .from('dre_custo_ia_semana')
      .select('id, custo_usd')
      .eq('semana_inicio', input.semanaInicio);
    if (errLinhas) throw new Error(`dre_custo_ia_semana: ${errLinhas.message}`);
    for (const l of linhas ?? []) {
      const { error: errUpd } = await sb
        .from('dre_custo_ia_semana')
        .update({ usd_brl: input.usdBrl, custo_brl: arredondar2(Number(l.custo_usd) * input.usdBrl) })
        .eq('id', l.id);
      if (errUpd) throw new Error(`dre_custo_ia_semana: ${errUpd.message}`);
    }

    await logAdminAction({
      adminEmail: email,
      acao: 'dre.cambio.definir',
      alvo: `semana ${input.semanaInicio}`,
      detalhes: {
        semanaInicio: input.semanaInicio,
        antes: antes ? { usd_brl: antes.usdBrl, fonte: antes.fonte } : null,
        depois: { usd_brl: input.usdBrl, fonte: 'manual' },
        linhasReconvertidas: (linhas ?? []).length,
      },
    });
    return { semanaInicio: input.semanaInicio, linhasReconvertidas: (linhas ?? []).length };
  });
}

export async function recalcularSemana(raw: unknown) {
  return executarAcaoDre('dre.manage', SchemaRecalcularSemana, raw, async ({ sb, email }, input) => {
    // Só semana ENCERRADA: a em curso é calculada ao vivo e ainda vai mudar.
    if (input.semanaInicio > ultimaSemanaFechadaBRT(new Date())) {
      throw new ErroDre('Só dá para recalcular semana já encerrada. A semana em curso é calculada ao vivo.');
    }
    const r = await fecharSemana(sb, input.semanaInicio);
    await logAdminAction({
      adminEmail: email,
      acao: 'dre.fechamento.recalcular',
      alvo: `semana ${input.semanaInicio}`,
      detalhes: { ...r },
    });
    return r;
  });
}
