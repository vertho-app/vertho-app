// Geração de kit faz várias chamadas de IA em sequência (núcleo + desafio + 4
// formatos, com expansão/PDF) → passa do timeout padrão (60s). Estende a função
// desta rota. Server Actions invocadas a partir da página herdam este limite.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export default function KitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
