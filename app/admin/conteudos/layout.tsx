// Geração do PDF final chama gpt-image-1 (20-60s). Estende o budget da função
// serverless para as Server Actions deste segmento não serem mortas no meio.
export const maxDuration = 120;

export default function ConteudosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
