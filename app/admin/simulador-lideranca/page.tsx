'use client';
import { useAdminShell } from '@/app/admin/_shell/AdminShellContext';
import TreinoLideranca from '@/components/simulador-lideranca/treino';
export default function Page() {
  const { empresaSelecionada } = useAdminShell();
  return (
    <TreinoLideranca
      key={empresaSelecionada?.id || 'todas'}
      admin
      empresaId={empresaSelecionada?.id}
    />
  );
}
