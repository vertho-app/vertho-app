'use client';

import { getEngajamentoRh, getEvolucaoEngajamentoRh, listarTurmasEngajamentoRh } from '@/actions/engajamento-rh';
import EngagementPanel from './engagement-panel';
import EngagementReport from './engagement-report';

export default function RhEngagementPanel({ empresaId, empresaNome, report = false }: {
  empresaId: string; empresaNome: string; report?: boolean;
}) {
  const Component = report ? EngagementReport : EngagementPanel;
  // O relatório segue com a empresa inteira (é o documento que o RH leva à diretoria);
  // só a tela de acompanhamento ganha o seletor de turma.
  return <Component key={empresaId} empresaId={empresaId} empresaNome={empresaNome} surface="rh"
    loadRollup={getEngajamentoRh} loadEvolution={getEvolucaoEngajamentoRh}
    loadTurmas={report ? undefined : listarTurmasEngajamentoRh} />;
}
