import { CONVERGENCIA, type Convergencia } from '@/lib/season-engine/convergencia';

/**
 * Cores do VEREDITO de convergência: fonte única para PDF e telas.
 *
 * 🔑 DECISÃO DO DONO (16/09/2026): "evolução parcial deve ser verde claro e
 * evolução confirmada verde mais escuro". Até então cada superfície tinha a sua
 * paleta, e o mesmo veredito saía em cores diferentes conforme onde se olhava:
 * parcial era laranja no PDF da pessoa, âmbar nas telas da temporada, do gestor
 * e do admin, ciano no painel de RH e no relatório da Fase 5, azul no PDF
 * executivo e laranja escuro no PDF da plenária. Oito lugares, cinco cores.
 *
 * Os dois vereditos de avanço ficam na MESMA família (verde) e se distinguem
 * pela intensidade: confirmada é o verde mais fechado, parcial o mais claro.
 * Estável continua neutro (cinza).
 *
 * Duas variantes porque o fundo muda a leitura: no PAPEL (branco), "escuro" é
 * tinta mais densa; na TELA (fundo navy), é o verde saturado contra o verde
 * pálido. As classes Tailwind vão LITERAIS aqui (o Tailwind só gera classe que
 * encontra escrita no código; montar `text-${cor}-400` em tempo de execução não
 * gera nada).
 */

export interface CorPapel { fg: string; bg: string; borda: string }

export const COR_VEREDITO_PAPEL: Record<Convergencia, CorPapel> = {
  [CONVERGENCIA.CONFIRMADA]: { fg: '#166534', bg: '#DCFCE7', borda: '#86EFAC' },
  [CONVERGENCIA.PARCIAL]:    { fg: '#22A35A', bg: '#F0FDF4', borda: '#BBF7D0' },
  [CONVERGENCIA.ESTAVEL]:    { fg: '#6B7280', bg: '#F3F4F6', borda: '#E5E7EB' },
};

export interface CorTela {
  /** Texto e ícone. */
  tinta: string;
  borda: string;
  fundo: string;
  /** Fundo do quadradinho do ícone. */
  icone: string;
  /** Preenchimento sólido (barra de distribuição). */
  solido: string;
  /** Pílula completa (fundo + texto + borda). */
  pilula: string;
  /** Hex da tinta, para quem estiliza por `style` em vez de classe. */
  hex: string;
  hexFundo: string;
}

export const COR_VEREDITO_TELA: Record<Convergencia, CorTela> = {
  [CONVERGENCIA.CONFIRMADA]: {
    tinta: 'text-emerald-500', borda: 'border-emerald-500/30', fundo: 'bg-emerald-500/[0.08]',
    icone: 'bg-emerald-500/20', solido: 'bg-emerald-600',
    pilula: 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
    hex: '#10B981', hexFundo: 'rgba(16,185,129,.14)',
  },
  [CONVERGENCIA.PARCIAL]: {
    tinta: 'text-green-300', borda: 'border-green-300/25', fundo: 'bg-green-300/[0.05]',
    icone: 'bg-green-300/15', solido: 'bg-green-300',
    pilula: 'bg-green-300/10 text-green-300 border border-green-300/25',
    hex: '#86EFAC', hexFundo: 'rgba(134,239,172,.10)',
  },
  [CONVERGENCIA.ESTAVEL]: {
    tinta: 'text-gray-300', borda: 'border-white/10', fundo: 'bg-white/[0.03]',
    icone: 'bg-white/10', solido: 'bg-gray-500',
    pilula: 'bg-white/[0.06] text-white/70 border border-white/12',
    hex: 'rgba(255,255,255,.62)', hexFundo: 'rgba(255,255,255,.06)',
  },
};

export function corPapel(veredito: string | null | undefined): CorPapel {
  return COR_VEREDITO_PAPEL[veredito as Convergencia] || COR_VEREDITO_PAPEL[CONVERGENCIA.ESTAVEL];
}

export function corTela(veredito: string | null | undefined): CorTela {
  return COR_VEREDITO_TELA[veredito as Convergencia] || COR_VEREDITO_TELA[CONVERGENCIA.ESTAVEL];
}
