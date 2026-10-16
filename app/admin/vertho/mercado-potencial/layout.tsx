// O enriquecimento de contatos faz, por escola, uma busca web (até 170 s no pior caso), a leitura das páginas
// citadas (12 s) e até 4 chamadas ao Hunter (20 s cada). O lote de 5 escolas roda inteiro em paralelo, então o
// pior caso é o de UMA escola, 262 s (conta travada em tests/unit/mercado-enriquecimento-tela.test.ts).
// Sem este maxDuration a Server Action herda o teto curto da conta e morre no meio de uma busca já paga.
export const maxDuration = 300;

export default function MercadoPotencialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
