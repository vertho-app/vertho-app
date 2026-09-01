/**
 * A Server Action do mapeamento faz trabalho pesado DEPOIS da resposta:
 * `after()` gera os textos do relatório, o PDF, o roteiro da devolutiva e o
 * TTS. Somados, passam com folga do orçamento padrão de uma função — e o que
 * estoura no `after()` não falha na cara de ninguém: some em silêncio, e a
 * pessoa só descobre ao clicar em "Ouvir" e esperar tudo de novo.
 *
 * 300s é o mesmo teto que as telas de lote do admin já usam.
 */
export const maxDuration = 300;

export default function MapeamentoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
