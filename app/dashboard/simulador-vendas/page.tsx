import TreinoVendas from '@/components/simulador-vendas/treino';
import { exigirAcessoPaginaSimulador } from '@/lib/simuladores/pagina';
export default async function Page() {
  await exigirAcessoPaginaSimulador('vendas');
  return <TreinoVendas/>;
}
