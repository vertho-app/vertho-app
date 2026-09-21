/**
 * Próximo passo da degustação: a conversa com quem convidou.
 *
 * 🔴 POR QUE EXISTE. `Medido 18/09/2026`: a primeira convidada que atravessou a
 * experiência inteira (DISC às 09:05, as três visões até 09:21) terminou numa
 * página que não oferecia saída nenhuma. Para falar com a Vertho ela teria que
 * voltar ao WhatsApp e procurar a conversa por conta própria.
 *
 * Quem manda a mensagem é a PESSOA, não a plataforma: o link abre a conversa com
 * o texto pronto e ela decide enviar. Por isso o tenant de demonstração não
 * dispara nada (o guardrail de `lib/demo/envio-guard` nem entra em cena), nada
 * novo é guardado sobre o lead e o robô de preview do WhatsApp não tem o que
 * carimbar: o único efeito do clique acontece no aparelho dela.
 */

/** Contato comercial da degustação. E.164 sem "+", como exige o `wa.me`. */
export const WHATSAPP_VERTHO = '5511973882303';

/**
 * Quem responde por convite criado, pelo `created_by_email` da linha do
 * passaporte. Quem não estiver aqui cai no número público, então o mapa pode
 * ficar pequeno: ele existe para o dia em que mais de uma pessoa criar convite.
 */
export const WHATSAPP_DO_COMERCIAL: Record<string, string> = {
  'rodrigo@vertho.ai': WHATSAPP_VERTHO,
};

/**
 * ⚠️ Busca por `hasOwnProperty`, nunca `in`: com `in`, um `created_by_email`
 * gravado como "constructor" acharia a função do protótipo e o link sairia com
 * lixo no lugar do número.
 */
export function numeroDoComercial(criadoPor: string | null | undefined): string {
  const chave = String(criadoPor || '').trim().toLowerCase();
  const registrado = Object.prototype.hasOwnProperty.call(WHATSAPP_DO_COMERCIAL, chave)
    ? String(WHATSAPP_DO_COMERCIAL[chave] || '')
    : '';
  return (registrado.replace(/\D/g, '') || WHATSAPP_VERTHO);
}

export type DadosDoContato = {
  /** Nome como o comercial escreveu no convite; só o primeiro nome vai no texto. */
  nome: string;
  /** Empresa do convite. Entra entre parênteses, e some se vier vazia. */
  empresa: string;
  /** Como a pessoa chama o próprio lugar: "na minha empresa", "na minha rede". */
  minhaCasa: string;
  /** `created_by_email` da linha do passaporte. */
  criadoPor?: string | null;
};

function primeiroNome(nome: string): string {
  const limpo = String(nome || '').trim();
  return limpo.split(/\s+/)[0] || '';
}

/**
 * O texto que a PESSOA envia. Ela se apresenta, então fala em primeira pessoa.
 *
 * A empresa vai entre parênteses de propósito: "da Boehringer" e "do Grupo
 * Sinal" pedem artigos diferentes, e campo livre montado com artigo sai errado
 * em metade dos casos (a mesma régua da cópia do convite). "Onde" a pessoa quer
 * ver vem escrito por extenso de cada ambiente, pela mesma razão.
 */
export function mensagemDeContato({ nome, empresa, minhaCasa }: DadosDoContato): string {
  const identificacao = [primeiroNome(nome), String(empresa || '').trim() && `(${String(empresa).trim()})`]
    .filter(Boolean)
    .join(' ');
  const apresentacao = identificacao ? ` Aqui é ${identificacao}.` : '';
  return `Olá!${apresentacao} Acabei de ver a Vertho por dentro e quero entender como isso funcionaria `
    + `${String(minhaCasa || '').trim()}.`;
}

/** Link único do próximo passo: conversa certa, texto pronto, envio dela. */
export function linkDeContatoDaDegustacao(dados: DadosDoContato): string {
  return `https://wa.me/${numeroDoComercial(dados.criadoPor)}?text=${encodeURIComponent(mensagemDeContato(dados))}`;
}
