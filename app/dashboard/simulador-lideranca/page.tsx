import { redirect } from 'next/navigation';
import { requireUserAction } from '@/lib/auth/action-context';
import { contexto } from '@/lib/simulador-lideranca/access';
import { contextoEquipe } from '@/lib/simulador-lideranca/equipe';
import TreinoLideranca from '@/components/simulador-lideranca/treino';

/**
 * Quem PRATICA (população do programa) e quem ACOMPANHA (RH e gestor,
 * decisão do dono de 18/09/2026) entram pela mesma tela; o servidor decide as
 * duas coisas. Sem nenhuma das duas, volta ao início, como vendas e atendimento
 * fazem (até 18/09 a pessoa lia uma mensagem crua, sem menu e sem caminho).
 */
export default async function Page() {
  const auth = await requireUserAction().catch(() => null);
  if (!auth) redirect('/login');
  const podeTreinar = await contexto(auth).then(
    () => true,
    () => false,
  );
  const podeAcompanhar = await contextoEquipe(auth).then(
    () => true,
    () => false,
  );
  if (!podeTreinar && !podeAcompanhar) redirect('/dashboard');
  return <TreinoLideranca podeTreinar={podeTreinar} podeAcompanhar={podeAcompanhar} />;
}
