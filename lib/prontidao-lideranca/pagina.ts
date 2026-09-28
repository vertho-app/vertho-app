import 'server-only';
import { redirect } from 'next/navigation';
import { requireUserAction } from '@/lib/auth/action-context';
import { prontidaoLiderancaHabilitada } from '@/lib/prontidao-lideranca/habilitado';
import { tenantDb } from '@/lib/tenant-db';

/**
 * Gate da página do MAPEAMENTO de liderança (`/dashboard/gestor/prontidao-lideranca`):
 * leitura da empresa, só do RH, com o módulo contratado.
 *
 * Nome próprio de propósito (27/09/2026). Até então este gate era
 * `exigirAcessoPaginaSimulador('lideranca')`, com um `if` que redirecionava
 * quem não é RH. A página do SIMULADOR de liderança não usa gate de página (o
 * servidor decide quem pratica e quem acompanha), e quem "padronizasse" a
 * página do simulador com o mesmo gate de vendas e atendimento mandaria todo
 * participante de volta ao início. `exigirAcessoPaginaSimulador` agora só
 * aceita vendas e atendimento.
 *
 * A aba de cargos diz só quem TREINA (decisão do dono, 22/09/2026): o
 * Mapeamento não depende dela, e o cargo do RH não decide o acesso.
 */
export async function exigirAcessoMapeamentoLideranca() {
  const auth = await requireUserAction().catch(() => null);
  if (!auth) redirect('/login');
  if (auth.role !== 'rh') redirect('/dashboard');
  if (auth.isPlatformAdmin) return;
  if (!auth.empresaId) redirect('/dashboard');
  if (!(await prontidaoLiderancaHabilitada(tenantDb(auth.empresaId).raw, auth.empresaId))) redirect('/dashboard');
}
