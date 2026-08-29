/**
 * Régua ÚNICA do painel de respostas da IA4 (`/admin/empresas/[id]/fase2`):
 * quem entra no recorte e como o recorte é contado.
 *
 * Por que é um módulo, e não duas expressões dentro da tela: até 29/08/2026 a
 * lista usava o conjunto FILTRADO e os chips do topo (`Total`, `Avaliadas`,
 * `N aprovadas`…) contavam `respostas` inteira. Filtrar por cargo não mexia em
 * nenhum número — quem lia o cabeçalho via o total da empresa achando que via o
 * do recorte. O botão "Re-avaliar todos" tinha a mesma origem e alcançava
 * respostas que o filtro havia tirado da tela, o que custa IA e reescreve
 * avaliação de gente que ninguém pediu para revisar.
 *
 * Com filtro e contagem saindo daqui, o par não pode divergir de novo sem o
 * teste (`tests/unit/ia4-painel-respostas.test.ts`) acusar.
 */

import { IA4_FILTRO } from '@/lib/status';

/** Bandas do filtro de nota de check, alinhadas às cores da tela. */
export type NotaBanda = '' | 'alto' | 'medio' | 'baixo' | 'sem';

export type RespostaPainel = {
  colaborador_nome?: string | null;
  colaborador_cargo?: string | null;
  avaliacao_ia?: unknown;
  status_ia4?: string | null;
  payload_ia4?: unknown;
};

export type FiltrosPainel = {
  colab?: string;
  cargo?: string;
  status?: string;
  nota?: NotaBanda;
};

function getCheck(r: any): any {
  if (!r) return null;
  try { return typeof r.payload_ia4 === 'string' ? JSON.parse(r.payload_ia4) : r.payload_ia4; }
  catch { return null; }
}

/** ≥90 alto (aprovado) · 80–89 médio (com ajustes) · <80 baixo (revisar). */
export function notaBanda(r: any): NotaBanda {
  const check = getCheck(r);
  if (!check || check.nota === undefined || check.nota === null) return 'sem';
  const n = Number(check.nota);
  if (!Number.isFinite(n)) return 'sem';
  if (n >= 90) return 'alto';
  if (n >= 80) return 'medio';
  return 'baixo';
}

/** Há algum filtro escolhido? (decide se a tela mostra o "de N" e o "limpar"). */
export function temFiltro(f: FiltrosPainel): boolean {
  return Boolean(f.colab || f.cargo || f.status || f.nota);
}

/** O conjunto VISÍVEL — a única fonte da lista, dos chips e da fila do lote. */
export function filtrarRespostas<T extends RespostaPainel>(respostas: T[], f: FiltrosPainel): T[] {
  return (respostas || []).filter(r => {
    if (f.colab && r.colaborador_nome !== f.colab) return false;
    if (f.cargo && r.colaborador_cargo !== f.cargo) return false;
    if (f.status === IA4_FILTRO.AVALIADO && !r.avaliacao_ia) return false;
    if (f.status === IA4_FILTRO.PENDENTE && r.avaliacao_ia) return false;
    if (f.status === IA4_FILTRO.APROVADO && r.status_ia4 !== IA4_FILTRO.APROVADO) return false;
    if (f.status === IA4_FILTRO.APROVADO_COM_AJUSTES && r.status_ia4 !== IA4_FILTRO.APROVADO_COM_AJUSTES) return false;
    if (f.status === IA4_FILTRO.REVISAR && r.status_ia4 !== IA4_FILTRO.REVISAR) return false;
    if (f.nota && notaBanda(r) !== f.nota) return false;
    return true;
  });
}

export type StatsPainel = {
  total: number;
  avaliadas: number;
  aprovadas: number;
  com_ajustes: number;
  revisar: number;
  pendentes: number;
};

/** Conta a lista que RECEBE — passar o conjunto visível é responsabilidade da tela. */
export function contarStats(lista: RespostaPainel[]): StatsPainel {
  const l = lista || [];
  return {
    total: l.length,
    avaliadas: l.filter(r => r.avaliacao_ia).length,
    aprovadas: l.filter(r => r.status_ia4 === IA4_FILTRO.APROVADO).length,
    com_ajustes: l.filter(r => r.status_ia4 === IA4_FILTRO.APROVADO_COM_AJUSTES).length,
    revisar: l.filter(r => r.status_ia4 === IA4_FILTRO.REVISAR).length,
    pendentes: l.filter(r => !r.avaliacao_ia).length,
  };
}
