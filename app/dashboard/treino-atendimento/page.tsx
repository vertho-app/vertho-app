import TreinoRecepcao from '@/components/recepcao/treino';
import { exigirAcessoPaginaSimulador } from '@/lib/simuladores/pagina';
export default async function Page() {
  await exigirAcessoPaginaSimulador('atendimento');
  return <TreinoRecepcao/>;
}
