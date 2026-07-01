'use client';
/** Ranking de Adequação — GESTOR self-service (escopo = empresa da sessão). */
import { PageContainer } from '@/components/page-shell';
import RankingAdequacaoView from '@/components/ranking-adequacao-view';
import { listarCargosComRanking, getRankingAdequacao, exportarRankingPDF } from '@/actions/ranking-adequacao';

export default function RankingPage() {
  return (
    <PageContainer>
      <RankingAdequacaoView listar={listarCargosComRanking} carregar={getRankingAdequacao} exportar={exportarRankingPDF} />
    </PageContainer>
  );
}
