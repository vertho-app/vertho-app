'use server';

// Gera UMA rodada do exemplo de cenário da proposta (deal desk). A tela chama de novo,
// com o feedback do auditor, até a nota mínima. Detalhe e motivos: `lib/sales/cenario-exemplo-ia.ts`.
//
// Todo export é endpoint HTTP: o gate é aplicado SEMPRE, a identidade vem do cookie SSR, e
// nada daqui lê ou grava dado de tenant. Cada chamada gasta IA (gerador + auditor), então o
// gate é o de quem GERENCIA o canal comercial, o mesmo de criar a proposta.
import { requirePlataformaSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import type { ActionResult } from '@/lib/auth/protected-action';
import { logAdminAction } from '@/lib/audit';
import { gerarRodadaExemplo, type RodadaGerada } from '@/lib/sales/cenario-exemplo-ia';
import { validarEntradaGeracao, type EntradaGerarExemplo } from '@/lib/sales/cenario-exemplo';

export type ResultadoGeracaoExemplo = RodadaGerada;

export async function gerarExemploCenario(input: EntradaGerarExemplo): Promise<ActionResult<ResultadoGeracaoExemplo>> {
  await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };

  const v = validarEntradaGeracao(input);
  if (!v.ok || !v.valor) return { success: false, error: v.erro ?? 'Entrada inválida.' };

  try {
    const rodada = await gerarRodadaExemplo(v.valor);
    await logAdminAction({
      adminEmail: email,
      acao: 'proposta_deal_desk.gerar_exemplo_cenario',
      alvo: v.valor.cargo,
      detalhes: {
        competencia: v.valor.competencia,
        segmento: v.valor.segmento,
        comFicha: !!v.valor.ficha,
        comFeedback: !!v.valor.feedback,
        nota: rodada.nota,
        status: rodada.status,
        gerador: rodada.exemplo.origem?.gerador ?? null,
        auditor: rodada.exemplo.origem?.auditor ?? null,
      },
    });
    return { success: true, data: rodada };
  } catch (e: any) {
    // Mensagem acionável para quem está na tela; o detalhe técnico vai para o log do servidor.
    console.error('[gerarExemploCenario]', e?.message ?? e);
    return { success: false, error: e?.message || 'Não foi possível gerar o exemplo agora.' };
  }
}
