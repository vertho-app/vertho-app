import { requireUserAction } from '@/lib/auth/action-context';
import { contexto } from '@/lib/simulador-lideranca/access';
import TreinoLideranca from '@/components/simulador-lideranca/treino';
export default async function Page() {
  const auth = await requireUserAction();
  try {
    await contexto(auth);
  } catch (e) {
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold">Simulador de liderança</h1>
        <p className="mt-4">
          {e instanceof Error ? e.message : 'Não foi possível abrir o treino.'}
        </p>
      </main>
    );
  }
  return <TreinoLideranca />;
}
