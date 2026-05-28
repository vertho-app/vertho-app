// Geração do PDF final chama gpt-image (20-60s) e o áudio chama Gemini TTS
// (dezenas de segundos, abort em 170s). Estende o budget da função serverless
// para as Server Actions deste segmento não serem mortas no meio.
export const maxDuration = 300;

export default function ConteudosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
