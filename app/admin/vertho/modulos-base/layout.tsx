// Refino e rascunho de módulo-base são SÍNCRONOS e pedem até 64.000 tokens de
// saída (o módulo inteiro reescrito). O prazo da chamada é de 10 min
// (`TIMEOUT_ESCRITA_MODULO_MS`), então o segmento precisa de fôlego maior que o
// default — senão a lambda morre antes da IA responder e o botão fica preso.
// Mesmo motivo do layout irmão de `extracao-video`.
export const maxDuration = 800;

export default function ModulosBaseVerthoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
