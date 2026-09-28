import { redirect } from 'next/navigation';
import { requireUserAction } from '@/lib/auth/action-context';
import { contexto } from '@/lib/simulador-lideranca/access';
import { contextoEquipe } from '@/lib/simulador-lideranca/equipe';
import { LiderancaError } from '@/lib/simulador-lideranca/schema';
import TreinoLideranca from '@/components/simulador-lideranca/treino';

/**
 * Recusa (403, 404…) decide que a pessoa não entra por aquela porta; falha de
 * leitura (503 ou erro inesperado) sobe para a tela de erro. Até 27/09/2026 as
 * duas viravam "não pode", e uma leitura da turma que falhava mandava quem
 * treina de volta ao início sem explicação.
 */
const recusou = (e: unknown) => {
  if (e instanceof LiderancaError && e.status < 500) return false;
  throw e;
};

/**
 * Quem PRATICA (população do programa) e quem ACOMPANHA (RH e gestor,
 * decisão do dono de 18/09/2026) entram pela mesma tela; o servidor decide as
 * duas coisas. Sem nenhuma das duas, volta ao início, como vendas e atendimento
 * fazem (até 18/09 a pessoa lia uma mensagem crua, sem menu e sem caminho).
 */
export default async function Page() {
  const auth = await requireUserAction().catch(() => null);
  if (!auth) redirect('/login');
  const podeTreinar = await contexto(auth).then(() => true, recusou);
  const podeAcompanhar = await contextoEquipe(auth).then(() => true, recusou);
  if (!podeTreinar && !podeAcompanhar) redirect('/dashboard');
  return <TreinoLideranca podeTreinar={podeTreinar} podeAcompanhar={podeAcompanhar} />;
}
