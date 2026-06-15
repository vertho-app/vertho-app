// Estruturação de vídeo (síncrona) via IA: 1 chamada normalmente leva ~90-150s,
// mas sob lentidão/rate limit a segmentação pode re-tentar (2× o timeoutMs de
// 180s = 360s). 300s era apertado e estourava (504 + botão preso); 800s dá folga
// real. (O material grande é assíncrono — não depende deste limite.)
export const maxDuration = 800;

export default function ExtracaoVideoVerthoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
