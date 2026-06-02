// Server actions pesados de IA (IA1/IA2/IA3, geração de cenário + check) rodam
// nesta rota. A página é client, então a config de segmento fica no layout.
// 300s evita que a geração de cenário (callAI + PPP + gabarito) estoure o
// limite default da função e derrube com "unexpected response from server".
export const maxDuration = 300;

export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
