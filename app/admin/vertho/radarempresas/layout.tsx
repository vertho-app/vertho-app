import { notFound } from 'next/navigation';

/**
 * ⛔ Radar Empresas — bloco OFF-LINE desde 31/08/2026 (`lib/blocos-offline.ts`).
 *
 * Fecha as 4 telas de uma vez: busca, `listas`, `redes` e `empresa/[cnpj]`.
 *
 * ⚠️ O DADO permanece no banco e não foi tocado — 92 mil empresas, 94 mil
 * estabelecimentos e scores, 361 mil redes. O que está desligado é a interface
 * de consulta; a ingestão parou sozinha em 16/05/2026 e o acervo segue lá para
 * quando o canal B2B voltar.
 *
 * `app/admin/vertho/mercado-potencial` NÃO faz parte deste bloco e continua no
 * ar: apesar de vizinho no menu, ele lê as views de mercado do Radar de escolas
 * (`diag_mv_mercado_*`), não as tabelas `radarempresas_*`.
 */
export default function RadarEmpresasOfflineLayout() {
  notFound();
}
