// "Gerar exemplo" no painel de revisão chama o gerador de cenário (Sonnet gera, outro modelo
// audita): uma rodada leva de 1 a 2 minutos. Estende o budget da função serverless para a
// Server Action deste segmento não ser morta no meio.
export const maxDuration = 300;

export default function OrcamentoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
