'use client';

import { getEngajamentoRh, getEvolucaoEngajamentoRh } from '@/actions/engajamento-rh';
import EngagementPanel from './engagement-panel';
import EngagementReport from './engagement-report';

export default function RhEngagementPanel({ empresaId, empresaNome, report = false }: {
  empresaId: string; empresaNome: string; report?: boolean;
}) {
  const Component = report ? EngagementReport : EngagementPanel;
  return <Component key={empresaId} empresaId={empresaId} empresaNome={empresaNome} surface="rh"
    loadRollup={getEngajamentoRh} loadEvolution={getEvolucaoEngajamentoRh} />;
}
