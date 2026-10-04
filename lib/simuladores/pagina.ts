import 'server-only';
import { redirect } from 'next/navigation';
import { requireUserAction } from '@/lib/auth/action-context';
import { recepcaoHabilitada } from '@/lib/recepcao/flag';
import { vendasHabilitado } from '@/lib/simulador-vendas/access';
import { acessoSimuladoresDoColaborador } from './acesso';
import { soAcompanhaSimuladores } from './papel';
import type { Simulador } from './acesso-cargo';

/**
 * Gate das páginas dos simuladores de VENDAS e de ATENDIMENTO.
 *
 * Liderança fica de fora de propósito (27/09/2026): a página do simulador de
 * liderança não tem gate de página (o servidor decide quem pratica e quem
 * acompanha), e o Mapeamento de liderança do RH tem gate próprio,
 * `exigirAcessoMapeamentoLideranca` (`lib/prontidao-lideranca/pagina.ts`).
 * Até então o Mapeamento usava este gate com `'lideranca'`, e padronizar a
 * página do simulador com ele redirecionaria todo participante.
 */
export async function exigirAcessoPaginaSimulador(simulador: Exclude<Simulador, 'lideranca'>) {
  const auth = await requireUserAction().catch(() => null);
  if (!auth) redirect('/login');
  if (auth.isPlatformAdmin) return;
  if (!auth.empresaId) redirect('/dashboard');
  // A aba de cargos diz só quem TREINA (decisão do dono, 22/09/2026). Gestor e RH
  // acompanham atendimento e vendas sem depender dela.
  if (!soAcompanhaSimuladores(auth)) {
    const acesso = await acessoSimuladoresDoColaborador(auth.colaborador);
    // Leitura que falhou NÃO manda a pessoa de volta ao início como se não tivesse acesso
    // (R-139): o erro chega ao boundary do dashboard, que oferece "tentar de novo".
    if (acesso.indisponivel) throw new Error('Não foi possível consultar o seu acesso agora. Tente novamente.');
    if (!acesso[simulador]) redirect('/dashboard');
  }
  const habilitado = simulador === 'vendas' ? await vendasHabilitado(auth.empresaId) : await recepcaoHabilitada(auth.empresaId);
  if (!habilitado) redirect('/dashboard');
}
