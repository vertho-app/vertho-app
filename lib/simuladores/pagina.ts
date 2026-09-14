import 'server-only';
import { redirect } from 'next/navigation';
import { requireUserAction } from '@/lib/auth/action-context';
import { recepcaoHabilitada } from '@/lib/recepcao/flag';
import { vendasHabilitado } from '@/lib/simulador-vendas/access';
import { prontidaoLiderancaHabilitada } from '@/lib/prontidao-lideranca/habilitado';
import { tenantDb } from '@/lib/tenant-db';
import { acessoSimuladoresDoColaborador } from './acesso';
import type { Simulador } from './acesso-cargo';

export async function exigirAcessoPaginaSimulador(simulador: Simulador) {
  const auth = await requireUserAction().catch(() => null);
  if (!auth) redirect('/login');
  // Prontidão expõe relatórios da empresa e continua restrita ao RH.
  if (simulador === 'lideranca' && auth.role !== 'rh') redirect('/dashboard');
  if (auth.isPlatformAdmin) return;
  const acesso = await acessoSimuladoresDoColaborador(auth.colaborador);
  if (!acesso[simulador] || !auth.empresaId) redirect('/dashboard');
  const habilitado = simulador === 'vendas' ? await vendasHabilitado(auth.empresaId)
    : simulador === 'atendimento' ? await recepcaoHabilitada(auth.empresaId)
      : await prontidaoLiderancaHabilitada(tenantDb(auth.empresaId).raw, auth.empresaId);
  if (!habilitado) redirect('/dashboard');
}
