/**
 * O NONO DÍGITO — por que o número que a Meta manda não é o que está no cadastro.
 *
 * 🔴 O FATO, MEDIDO EM 17/08/2026
 * ───────────────────────────────
 * O `wa_id` que a Cloud API usa para um celular brasileiro depende do DDD:
 *
 *   DDD 11  → `5511973882303` (13 dígitos, COM o nono)     — 8 envios
 *   DDD 74  → `557499225966`  (12 dígitos, SEM o nono)     — 35 envios
 *   DDD 77  → idem                                          — 1 envio
 *
 * (Lido do próprio `wamid`: os quatro primeiros caracteres codificam o tamanho do
 * telefone — `HBgN` = 13, `HBgM` = 12. Não é dedução, é o que a Meta devolveu.)
 *
 * O cadastro está em E.164 COM o nono (294 de 298 telefones brasileiros), porque é
 * assim que se disca. Resultado: **enviamos a pílula às 11:00:28 para
 * `5574999225966`, a pessoa respondeu às 11:00:40 de `557499225966`, e o app não
 * reconheceu o próprio destinatário** — `ambiguidade = 'telefone-desconhecido'`.
 *
 * Exposição no dia em que isto foi escrito: **50 pessoas** com DDD ≥ 31 em
 * Ibipeba (49 no DDD 74), das quais 37 receberam mensagem naquela manhã. Nenhuma
 * resposta delas casava com o cadastro.
 *
 * ⚠️ ESTE MÓDULO NÃO DECIDE QUAL FORMA É A "CERTA", e isso é deliberado. A faixa
 * de DDD que perde o nono é convenção da Meta, não regra publicada com garantia —
 * cravá-la aqui seria fabricar um número. O que ele faz é dizer qual é a OUTRA
 * forma do mesmo telefone; quem consulta o cadastro tenta as duas, e quem decide
 * de quem é continua sendo `decidirDono`, que segue fail-closed na ambiguidade.
 *
 * ZERO DEPENDÊNCIA de propósito: isto roda dentro do webhook, que precisa
 * responder 200 rápido — importar `libphonenumber` (1,4 MB de metadata) aqui
 * pagaria cold start em todo evento recebido.
 */

/** Só dígitos. `+55 (74) 99922-5966` → `5574999225966`. */
function digitos(telefone: unknown): string {
  return String(telefone ?? '').replace(/\D/g, '');
}

/**
 * A OUTRA forma do mesmo celular brasileiro, ou `null` quando não existe.
 *
 *   `5574999225966` (13) ⇄ `557499225966` (12)
 *
 * As duas direções importam: o `wa_id` chega sem o nono nos DDDs ≥ 31, e o
 * cadastro tem 4 telefones gravados na forma antiga, de 12 dígitos — esses são o
 * caso espelhado, em que o wa_id vem COM o nono e o cadastro está sem.
 *
 * A guarda `[6-9]` no número de 8 dígitos não é decoração: fixo brasileiro começa
 * com 2–5, e inventar um "nono dígito" para um fixo produziria um celular que não
 * existe — e um casamento de identidade com quem não é a pessoa.
 */
export function alternarNonoDigito(telefone: unknown): string | null {
  const d = digitos(telefone);
  // Fora do Brasil não existe essa dupla forma — Portugal (351) não perde dígito.
  if (!d.startsWith('55')) return null;

  const ddd = d.slice(2, 4);
  const local = d.slice(4);
  if (!/^[1-9][0-9]$/.test(ddd)) return null;

  if (local.length === 9 && local.startsWith('9')) return `55${ddd}${local.slice(1)}`;
  if (local.length === 8 && /^[6-9]/.test(local)) return `55${ddd}9${local}`;
  return null;
}

/**
 * As formas do mesmo telefone, sem duplicata e sempre com o original primeiro.
 *
 * Usada por quem BUSCA no cadastro. Ampliar a busca é seguro porque a decisão de
 * dono é conservadora: duas empresas casando ⇒ ninguém leva a conversa. Foi essa
 * separação que permitiu ligar a variante — medido antes de ligar: normalizando o
 * nono dígito, **nenhum** dos ~350 telefones do cadastro colide com outro que
 * hoje é distinto (0 colisões novas).
 */
export function formasDoTelefone(telefone: unknown): string[] {
  const d = digitos(telefone);
  if (!d) return [];
  const alt = alternarNonoDigito(d);
  return alt && alt !== d ? [d, alt] : [d];
}
