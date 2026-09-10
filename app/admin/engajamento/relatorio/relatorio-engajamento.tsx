'use client';

import { useCallback } from 'react';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { getEngajamentoEmpresa, getEvolucaoEngajamentoEmpresa } from '@/actions/engajamento';
import EngagementReport from '@/components/engajamento/engagement-report';

export default function RelatorioEngajamento() {
  const { empresaId, empresa } = useEmpresaContexto();
  const loadRollup = useCallback(() => getEngajamentoEmpresa(empresaId!), [empresaId]);
  const loadEvolution = useCallback(() => getEvolucaoEngajamentoEmpresa(empresaId!), [empresaId]);
  return <EngagementReport key={empresaId || 'sem-empresa'} empresaId={empresaId} empresaNome={empresa?.nome || ''} surface="admin" loadRollup={loadRollup} loadEvolution={loadEvolution} />;
}
