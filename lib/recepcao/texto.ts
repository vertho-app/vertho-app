// Referências a mensagens em texto para pessoas. O avaliador trabalha com ids (m0, m1…) para citar
// com precisão, mas quem lê o relatório não vê id nenhum na conversa: aqui o id vira posição
// ("3ª resposta da secretária", "2ª fala de Marina"). Módulo puro, usado no servidor e na tela.
export type MensagemRef = { id: string; role: 'user' | 'assistant' };

export function descreverMensagem(historico: MensagemRef[], id: string, nomePaciente?: string): string | null {
  const i = historico.findIndex(m => m.id === id);
  if (i < 0) return null;
  const papel = historico[i].role;
  const ordem = historico.slice(0, i + 1).filter(m => m.role === papel).length;
  return papel === 'user' ? `${ordem}ª resposta da secretária` : `${ordem}ª fala ${nomePaciente ? `de ${nomePaciente}` : 'da paciente'}`;
}

// "Em m11, ao dizer…" → "Na 6ª resposta da secretária, ao dizer…"; "(m0)" → "(1ª fala de Marina)".
// Id que não existe na conversa fica como está; "10m2" não é id (sem fronteira de palavra).
export function humanizarReferencias(texto: string, historico: MensagemRef[], nomePaciente?: string): string {
  return texto.replace(/(\b[Ee]m |\b[Nn]a |\b[Nn]o )?\bm(\d+)\b/g, (tudo, prep: string | undefined, n: string) => {
    const d = descreverMensagem(historico, `m${n}`, nomePaciente);
    if (!d) return tudo;
    if (!prep) return d;
    return `${/^[EN]/.test(prep) ? 'Na' : 'na'} ${d}`;
  });
}
