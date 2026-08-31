import { notFound } from 'next/navigation';

/**
 * ⛔ RadarBett — bloco OFF-LINE desde 31/08/2026 (`lib/blocos-offline.ts`).
 *
 * `/radar/bett` mora sob o layout do Radar vivo, então não é alcançada pelo
 * interruptor de `app/radarbett/layout.tsx` — precisa do seu próprio. É a
 * mesma superfície da feira por outro caminho.
 *
 * O resto de `/radar/*` continua no ar: são as telas públicas de consulta ao
 * acervo de escolas, que compartilham `lib/radar/` com este bloco e por isso
 * nada foi removido de lá.
 */
export default function RadarBettOfflineLayout() {
  notFound();
}
