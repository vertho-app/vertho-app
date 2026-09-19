'use client';
import { useAdminShell } from '@/app/admin/_shell/AdminShellContext';
import TreinoLideranca from '@/components/simulador-lideranca/treino';
export default function Page() {
  const { empresaSelecionada } = useAdminShell();
  // O admin experimenta (acervo próprio, identificado como piloto) e acompanha a
  // equipe da empresa selecionada, com a mesma tela que RH e gestor usam.
  return (
    <TreinoLideranca
      key={empresaSelecionada?.id || 'todas'}
      admin
      empresaId={empresaSelecionada?.id}
      podeTreinar
      podeAcompanhar
    />
  );
}
