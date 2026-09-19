import 'server-only';
import { redirect } from 'next/navigation';
import { requireUserAction } from '@/lib/auth/action-context';
import { recepcaoHabilitada } from '@/lib/recepcao/flag';
import { vendasHabilitado } from '@/lib/simulador-vendas/access';
import { prontidaoLiderancaHabilitada } from '@/lib/prontidao-lideranca/habilitado';
import { tenantDb } from '@/lib/tenant-db';
import { acessoSimuladoresDoColaborador } from './acesso';
import { soAcompanhaSimuladores } from './papel';
import type { Simulador } from './acesso-cargo';

export async function exigirAcessoPaginaSimulador(simulador: Simulador) {
  const auth = await requireUserAction().catch(() => null);
  if (!auth) redirect('/login');
  // O Mapeamento de liderança (antiga Prontidão) expõe relatórios da empresa e é só do RH.
  if (simulador === 'lideranca' && auth.role !== 'rh') redirect('/dashboard');
  if (auth.isPlatformAdmin) return;
  if (!auth.empresaId) redirect('/dashboard');
  // Atendimento e vendas: gestor e RH entram para ACOMPANHAR a equipe, e a
  // liberação por cargo (quem treina) não vale para eles (17/09/2026).
  // No Mapeamento a coluna "Liderança" do cargo do RH vale, como nas actions e no menu.
  const soAcompanha = simulador !== 'lideranca' && soAcompanhaSimuladores(auth);
  if (!soAcompanha) {
    const acesso = await acessoSimuladoresDoColaborador(auth.colaborador);
    if (!acesso[simulador]) redirect('/dashboard');
  }
  const habilitado = simulador === 'vendas' ? await vendasHabilitado(auth.empresaId)
    : simulador === 'atendimento' ? await recepcaoHabilitada(auth.empresaId)
      : await prontidaoLiderancaHabilitada(tenantDb(auth.empresaId).raw, auth.empresaId);
  if (!habilitado) redirect('/dashboard');
}
