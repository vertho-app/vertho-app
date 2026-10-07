'use client';

import { useCallback } from 'react';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { getEngajamentoEmpresa, getEvolucaoEngajamentoEmpresa, listarTurmasEngajamento } from '@/actions/engajamento';
import EngagementPanel from '@/components/engajamento/engagement-panel';

export default function EngajamentoPage() {
  const { empresaId, empresa } = useEmpresaContexto();
  const loadRollup = useCallback((semana?: number | null, cargo?: string | null, turmaId?: string | null) => getEngajamentoEmpresa(empresaId!, semana, cargo, turmaId), [empresaId]);
  const loadEvolution = useCallback((area?: string | null, turmaId?: string | null) => getEvolucaoEngajamentoEmpresa(empresaId!, area, turmaId), [empresaId]);
  const loadTurmas = useCallback(() => listarTurmasEngajamento(empresaId!), [empresaId]);
  return <EngagementPanel key={empresaId || 'sem-empresa'} empresaId={empresaId} empresaNome={empresa?.nome || ''} surface="admin" loadRollup={loadRollup} loadEvolution={loadEvolution} loadTurmas={loadTurmas} />;
}
