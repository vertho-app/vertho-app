/**
 * O SELO de cada linha do painel do fluxo (pedido do dono, 16/10/2026): "passou" ou não, num relance. Na simulação
 * toda etapa termina "pulada" (nada é gerado), e a palavra sozinha não dizia se a etapa PASSARIA; aqui ela passa se
 * não tem ninguém bloqueado. Na rodada real vale o estado da etapa. PURO: a tela só desenha o que isto devolve.
 */
import type { ProgressoEtapa } from './tipos';

export type SeloEtapa = 'passou' | 'atencao' | 'falhou' | 'rodando' | 'aguardando' | 'neutro';

/** Pulada porque não havia o que fazer (o trabalho já estava feito): isso é passar. */
const NADA_A_FAZER = /^(nada pendente|nada a definir agora|nenhum kit faltando|biblioteca já completa|nenhum blueprint novo)/;

export function seloDaEtapa(
  e: Pick<ProgressoEtapa, 'estado' | 'detalhe'>,
  ctx: { dryRun: boolean; bloqueados?: number },
): SeloEtapa {
  const bloqueados = ctx.bloqueados ?? 0;
  switch (e.estado) {
    case 'ok': return 'passou';
    case 'parcial': return 'atencao';
    case 'erro': return 'falhou';
    case 'rodando': return 'rodando';
    case 'aguardando': return 'aguardando';
    case 'pulado': {
      const detalhe = (e.detalhe || '').trim();
      // Gente esperando (IA4 ou check pendente) não é "passou", mesmo sem nada para gravar agora.
      if (/aguardando|sem nota/.test(detalhe)) return 'atencao';
      if (detalhe.startsWith('simulação') || NADA_A_FAZER.test(detalhe)) {
        return ctx.dryRun && bloqueados > 0 ? 'atencao' : 'passou';
      }
      // Pulada por escolha (fora da seleção, regra desligada, escopo de turma, nenhum PDI novo): não é falha nem acerto.
      return 'neutro';
    }
    default: return 'neutro';
  }
}

/**
 * Etapa com AUDITORIA (IA4, blueprint, PDI): gerado não é aprovado (pedido do dono, 16/10/2026: "na tela aparece tudo
 * verde concluído... falsa impressão de estar ok"). Com algo reprovado ou sem veredito, o que seria "passou" (ou
 * "sem ação") vira "atenção". Rodando, aguardando e falhou ficam como estão: dizem mais do que o veredito.
 */
export function seloComVeredito(selo: SeloEtapa, v: { naoAprovados: number; semVeredito: number } | null | undefined): SeloEtapa {
  if (!v || v.naoAprovados + v.semVeredito === 0) return selo;
  return selo === 'passou' || selo === 'neutro' ? 'atencao' : selo;
}

export const ROTULO_SELO: Record<SeloEtapa, string> = {
  passou: 'passou',
  atencao: 'atenção',
  falhou: 'falhou',
  rodando: 'rodando',
  aguardando: 'aguardando',
  neutro: 'sem ação',
};
