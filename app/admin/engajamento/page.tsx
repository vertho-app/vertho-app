'use client';

import { useCallback } from 'react';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { getEngajamentoEmpresa, getEvolucaoEngajamentoEmpresa } from '@/actions/engajamento';
import EngagementPanel from '@/components/engajamento/engagement-panel';

export default function EngajamentoPage() {
  const { empresaId, empresa } = useEmpresaContexto();
  const loadRollup = useCallback((semana?: number | null, cargo?: string | null) => getEngajamentoEmpresa(empresaId!, semana, cargo), [empresaId]);
  const loadEvolution = useCallback((area?: string | null) => getEvolucaoEngajamentoEmpresa(empresaId!, area), [empresaId]);
  return <EngagementPanel key={empresaId || 'sem-empresa'} empresaId={empresaId} empresaNome={empresa?.nome || ''} surface="admin" loadRollup={loadRollup} loadEvolution={loadEvolution} />;
}
