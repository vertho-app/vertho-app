import type { ReactNode } from 'react';
/** Mantém o treino disponível para consulta sem esconder a devolutiva atrás dele. */
export default function DetalhesTreino({
  concluido,
  titulo,
  children,
}: {
  concluido: boolean;
  titulo: string;
  children: ReactNode;
}) {
  return concluido ? (
    <details className="my-5">
      <summary className="cursor-pointer py-3 font-medium">{titulo}</summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  );
}
