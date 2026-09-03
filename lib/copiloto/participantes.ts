/**
 * Quem está na sala, com a cadeira que cada um ocupa.
 *
 * O planejamento já recebia os participantes, mas como texto solto
 * ("Maria Souza, Head de T&D; Paulo Reis, CFO"). O modelo lia isso e escolhia a
 * `seat` das rotas de objeção sem nenhuma relação com quem estaria presente: a
 * objeção do financeiro e a do RH viravam a mesma conversa.
 *
 * A cadeira sai do CARGO, e o cargo vem do CRM quando a pessoa está lá
 * (`sales_contacts.role`, preenchido em 7 de 7 contatos hoje) ou do que o
 * vendedor digitou. Nada aqui vai para a internet: é organização do que já
 * estava no briefing privado.
 */

/** As mesmas cinco cadeiras que `ObjectionRoute.seat` usa no dossiê. */
export const SEATS = ['financeiro', 'RH', 'operações', 'TI', 'patrocinador'] as const;
export type Seat = (typeof SEATS)[number];

export type Participante = {
  nome: string;
  cargo: string;
  seat: Seat | null;
};

/**
 * Cargo → cadeira, por palavra do cargo.
 *
 * A ordem importa: um "Diretor de RH" é RH antes de ser patrocinador, e um
 * "CFO" é financeiro antes de ser diretoria. Quem não casa fica `null`, e o
 * prompt trata isso como cadeira não identificada em vez de chutar uma.
 */
const REGRAS: Array<{ seat: Seat; padrao: RegExp }> = [
  { seat: 'RH', padrao: /\b(rh|recursos humanos|people|gente e gest|dho|t&d|treinamento|desenvolvimento humano|capital humano|talent|educacao corporativa|universidade corporativa|pedagogic)/ },
  { seat: 'financeiro', padrao: /\b(cfo|financ|controlad|contabil|tesourar|orcament|compras|suprimentos|procurement)/ },
  { seat: 'TI', padrao: /\b(ti|cto|cio)\b|\b(tecnologia|sistemas|infraestrutura|dados|digital|seguranca da informa)/ },
  { seat: 'operações', padrao: /\b(coo)\b|\b(operac|producao|logistica|supply|manufatura|industrial|fabrica|loja|campo)/ },
  { seat: 'patrocinador', padrao: /\b(ceo|vp)\b|\b(presiden|socio|fundador|owner|vice-presiden|conselho|superintenden|mantenedor|diretor[ae]?[- ]geral|diretoria executiva)/ },
  // Diretor/gerente sem área é quem banca a decisão, não quem executa.
  { seat: 'patrocinador', padrao: /\b(diretor|gerente geral|head)\b/ },
];

/**
 * Sem acento e em minúsculas ANTES de casar.
 *
 * O `\b` do JavaScript não conhece acento: em "Sócio-fundador" ele enxerga uma
 * fronteira entre "ó" e "c", e o padrão de CIO casava no meio da palavra. O
 * sócio virava cadeira de TI. Por isso os padrões acima são escritos sem
 * diacrítico: eles nunca veem o texto original.
 */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function cadeiraDoCargo(cargo: string): Seat | null {
  const texto = normalizar((cargo || '').trim());
  if (!texto) return null;
  for (const regra of REGRAS) {
    if (regra.padrao.test(texto)) return regra.seat;
  }
  return null;
}

/**
 * Lê o campo livre de participantes no formato que os chips do CRM produzem:
 * "Nome, Cargo; Outro Nome, Outro Cargo".
 *
 * Quem foi digitado sem cargo entra com cargo vazio: saber que existe uma
 * terceira pessoa na sala já muda a conversa, mesmo sem saber o papel dela.
 */
export function parseParticipantes(audience: string): Participante[] {
  return (audience || '')
    .split(/[;\n]+/)
    .map((pedaco) => pedaco.trim())
    .filter(Boolean)
    .map((pedaco) => {
      const virgula = pedaco.indexOf(',');
      const nome = (virgula >= 0 ? pedaco.slice(0, virgula) : pedaco).trim();
      const cargo = virgula >= 0 ? pedaco.slice(virgula + 1).trim() : '';
      return { nome, cargo, seat: cadeiraDoCargo(cargo) };
    })
    .filter((p) => p.nome)
    .slice(0, 8);
}

/**
 * Completa o cargo pelo CRM quando o campo trouxe só o nome.
 *
 * O cargo do CRM vence o digitado por ser a fonte que o próprio cliente
 * confirmou, e porque é ele que alimenta a cadeira.
 */
export function enriquecerComContatos(
  participantes: Participante[],
  contatos: Array<{ name: string; role: string | null }>,
): Participante[] {
  const porNome = new Map(
    contatos
      .filter((c) => c?.name)
      .map((c) => [c.name.trim().toLocaleLowerCase('pt-BR'), (c.role || '').trim()]),
  );
  return participantes.map((p) => {
    const doCrm = porNome.get(p.nome.toLocaleLowerCase('pt-BR'));
    const cargo = doCrm || p.cargo;
    return { ...p, cargo, seat: cadeiraDoCargo(cargo) };
  });
}

export function formatarParticipantes(participantes: Participante[]): string {
  if (!participantes.length) return 'não informados';
  return participantes
    .map((p) => `- ${p.nome}${p.cargo ? ` | ${p.cargo}` : ' | cargo não informado'} | cadeira: ${p.seat || 'não identificada'}`)
    .join('\n');
}

/** As cadeiras presentes, sem repetir, para as rotas de objeção priorizarem. */
export function cadeirasPresentes(participantes: Participante[]): Seat[] {
  return [...new Set(participantes.map((p) => p.seat).filter((s): s is Seat => !!s))];
}
