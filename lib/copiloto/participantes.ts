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

/**
 * Aceita, descarta ou rebaixa o que a trilha de pessoas trouxe.
 *
 * Três regras, e cada uma existe por um motivo medido:
 *
 * `incerto` sai. Homônimo é o modo de falha desta trilha: sem a fonte ligando
 * nome + cargo + organização, o Play passa a falar de outra pessoa com o mesmo
 * nome, e isso é pior do que não ter a informação.
 *
 * Sem URL sai. É a mesma régua do resto do dossiê: afirmação sobre pessoa sem
 * fonte não vira frase de abertura.
 *
 * Fonte de rede social entra marcada como NÃO verificável. O buscador lê o
 * perfil pelo índice e a mesma URL devolve bloqueio para leitura direta: o
 * vendedor consegue abrir no navegador, a plataforma não consegue revalidar.
 */
export type PessoaDescoberta = {
  name: string;
  role: string;
  publicStance: string;
  sourceUrl: string | null;
  confidence: 'confirmado' | 'inferencia' | 'nao_confirmado';
  verifiable: boolean;
};

const HOSTS_NAO_REVALIDAVEIS = /(^|\.)(linkedin|instagram|facebook|x|twitter|tiktok)\.com$/i;

function textoCurto(valor: unknown, max: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

function urlPublica(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizarPessoas(bruto: unknown, maxPessoas = 4): PessoaDescoberta[] {
  const lista = Array.isArray(bruto) ? bruto : [];
  const vistos = new Set<string>();
  const saida: PessoaDescoberta[] = [];

  for (const item of lista) {
    if (saida.length >= maxPessoas) break;
    const name = textoCurto((item as any)?.nome, 160);
    const role = textoCurto((item as any)?.cargo, 200);
    const sourceUrl = urlPublica((item as any)?.fonte_url);
    const confianca = (item as any)?.confianca_identidade;
    if (!name || !role) continue;
    if (confianca === 'incerto') continue;
    if (!sourceUrl) continue;

    const chave = name.toLocaleLowerCase('pt-BR');
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    let host = '';
    try {
      host = new URL(sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }

    saida.push({
      name,
      role,
      publicStance: textoCurto((item as any)?.defende_publicamente, 600),
      sourceUrl,
      confidence: confianca === 'confirmado' ? 'confirmado' : 'inferencia',
      verifiable: !HOSTS_NAO_REVALIDAVEIS.test(host),
    });
  }
  return saida;
}

/**
 * Junta quem o vendedor informou com quem a pesquisa descobriu.
 *
 * Quem o vendedor escreveu vem primeiro e nunca é sobrescrito: ele sabe quem
 * confirmou presença, e a pesquisa não sabe. O descoberto completa o cargo de
 * quem veio sem cargo e acrescenta os que não estavam na lista, marcados como
 * possíveis participantes, e não como presentes.
 */
export function fundirComDescobertos(
  informados: Participante[],
  descobertos: PessoaDescoberta[],
): Array<Participante & { descoberto?: boolean }> {
  const porNome = new Map(descobertos.map((p) => [p.name.toLocaleLowerCase('pt-BR'), p]));
  const usados = new Set<string>();

  const lista: Array<Participante & { descoberto?: boolean }> = informados.map((p) => {
    const chave = p.nome.toLocaleLowerCase('pt-BR');
    const achado = porNome.get(chave);
    if (achado) usados.add(chave);
    const cargo = p.cargo || achado?.role || '';
    return { ...p, cargo, seat: cadeiraDoCargo(cargo) };
  });

  for (const p of descobertos) {
    const chave = p.name.toLocaleLowerCase('pt-BR');
    if (usados.has(chave)) continue;
    lista.push({ nome: p.name, cargo: p.role, seat: cadeiraDoCargo(p.role), descoberto: true });
  }
  return lista.slice(0, 8);
}

/**
 * Perfil de PESSOA, que aqui é âncora de identidade e não fonte.
 *
 * A leitura direta do perfil é impossível (o LinkedIn devolve bloqueio, medido em
 * 03/09) e não é isso que se quer dele: com a URL na mão, a busca desambigua
 * homônimo, que é o maior risco de pesquisar pessoa. Sem âncora, "Ana Silva" na
 * empresa certa e "Ana Silva" de outro estado chegam com a mesma cara.
 *
 * Só perfil de pessoa entra: `/in/` no LinkedIn. Perfil de empresa é o outro
 * campo, com outra régua, e misturá-los faria a trilha social buscar no lugar
 * errado.
 */
export function parsePerfisDePessoa(texto: string): string[] {
  const pedacos = (texto || '').split(/[\s,;]+/).filter(Boolean);
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const pedaco of pedacos) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(pedaco) ? pedaco : `https://${pedaco}`);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase().replace(/^(www\.|[a-z]{2}\.)/, '');
    const ehPerfilDePessoa = host.endsWith('linkedin.com') && /^\/in\/[^/]+/i.test(url.pathname);
    if (!ehPerfilDePessoa) continue;
    const slug = url.pathname.split('/').filter(Boolean)[1];
    const canonica = `https://www.linkedin.com/in/${slug.toLowerCase()}`;
    if (vistos.has(canonica)) continue;
    vistos.add(canonica);
    saida.push(canonica);
    if (saida.length >= 8) break;
  }
  return saida;
}

/**
 * O nome que o slug do perfil sugere, para casar com quem já está na lista.
 *
 * `linkedin.com/in/maria-souza-1a2b3c` vira "maria souza": os sufixos que o
 * LinkedIn acrescenta são hexadecimais ou números, nunca sobrenome.
 */
export function nomeDoPerfil(url: string): string {
  const slug = url.split('/in/')[1]?.replace(/\/$/, '') || '';
  return slug
    .split('-')
    .filter((parte) => parte && !/^[0-9a-f]{4,}$/i.test(parte) && !/^\d+$/.test(parte))
    .join(' ')
    .trim();
}

/**
 * O que a pesquisa NÃO achou sobre quem estará na reunião.
 *
 * Ausência aqui é informação, não vazio: significa que a abertura tem que vir da
 * empresa, e não da pessoa. Sem essa linha o vendedor não distingue "não
 * pesquisamos" de "pesquisamos e ela não publica", e a segunda é a que impede
 * de inventar intimidade que não existe.
 */
export function marcarSemAchado(
  participantes: Participante[],
  encontrados: PessoaDescoberta[],
): PessoaDescoberta[] {
  const achados = new Set(encontrados.map((p) => p.name.toLocaleLowerCase('pt-BR')));
  const faltantes = participantes
    .filter((p) => p.nome && !achados.has(p.nome.toLocaleLowerCase('pt-BR')))
    .map((p) => ({
      name: p.nome,
      role: p.cargo,
      publicStance: '',
      sourceUrl: null,
      confidence: 'nao_confirmado' as const,
      verifiable: false,
    }));
  return [...encontrados, ...faltantes];
}
