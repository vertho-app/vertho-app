/**
 * ABM camada 4b — núcleo PURO da extração de sinal do Instagram.
 *
 * Sem `server-only` e sem rede de propósito: é o que os testes exercitam.
 * A chamada da Graph API vive em `lib/abm/instagram.ts`, que importa daqui.
 *
 * ⚠️ LGPD — a regra que rege este arquivo:
 * Post de escola frequentemente mostra CRIANÇA (nome, foto, turma). Isso é dado
 * pessoal de menor, e a Vertho vende PARA escolas: errar aqui é caro em dobro.
 * Por construção, este módulo devolve apenas SINAL ORGANIZACIONAL, nunca mídia
 * e nunca nome de pessoa — os tipos abaixo não têm campo para isso.
 */

export type TipoSinal =
  | 'expansao'
  | 'contratacao'
  | 'formacao_docente'
  | 'mudanca_lideranca'
  | 'reconhecimento';

export interface SinalInstagram {
  tipo: TipoSinal;
  /** Trecho curto e sanitizado, só para auditoria humana do sinal. */
  evidencia: string;
  data: string | null;
  permalink: string | null;
}

// ── Léxico dos sinais ────────────────────────────────────────────────────────
// Português, calibrado para ESCOLA. A armadilha do domínio está em "vaga":
// em escola, "vagas abertas" quase sempre é MATRÍCULA de aluno, não contratação.
// Por isso contratação exige termo inequívoco de emprego.

const PADROES: Array<{ tipo: TipoSinal; re: RegExp }> = [
  {
    tipo: 'expansao',
    re: /\b(nova unidade|novas unidades|inaugura(?:mos|ção|remos|da)?|nova sede|nosso novo (?:campus|pr[ée]dio|espaço)|chegando em|agora (?:também )?em)\b/i,
  },
  {
    tipo: 'contratacao',
    // NÃO usar "vaga(s)" solto — ver comentário acima.
    re: /\b(trabalhe conosco|banco de talentos|processo seletivo (?:para|de) (?:professor|coordenador|docente|educador)|estamos contratando|vagas? de emprego|vagas? para (?:professor|coordenador|docente|educador|auxiliar)|fa[çc]a parte (?:d[oa]|da nossa) (?:time|equipe))\b/i,
  },
  {
    tipo: 'formacao_docente',
    re: /\b(forma[çc][ãa]o (?:continuada|de professores|docente|da equipe)|semana pedag[óo]gica|capacita[çc][ãa]o (?:de|da) equipe|jornada pedag[óo]gica)\b/i,
  },
  {
    tipo: 'mudanca_lideranca',
    re: /\b(nov[ao] (?:diretor|diretora|coordenador|coordenadora|gestor|gestora)|assume a (?:dire[çc][ãa]o|coordena[çc][ãa]o)|boas-vindas [àa] nova)\b/i,
  },
  {
    tipo: 'reconhecimento',
    re: /\b(pr[êe]mio|premiad[ao]|melhor escola|1º lugar|medalha de ouro|destaque (?:nacional|estadual))\b/i,
  },
];

/** Sinal de MATRÍCULA — se a legenda é sobre isso, "vaga" nunca é contratação. */
const RE_MATRICULA =
  /\b(matr[íi]cula|matr[íi]culas|rematr[íi]cula|vagas? (?:abertas? )?para (?:20\d\d|o (?:infantil|fundamental|m[ée]dio)|alunos?)|processo seletivo (?:de|para) (?:alunos?|bolsistas?))\b/i;

/**
 * Remove o que não pode ser guardado: @menções, e-mails, telefones e nomes
 * próprios prováveis (duas ou mais palavras Capitalizadas seguidas).
 *
 * Deliberadamente agressivo: perder um sinal por excesso de zelo é barato;
 * persistir o nome de uma criança não é.
 */
export function sanitizarLegenda(texto: string): string {
  return texto
    .replace(/@[\w.]+/g, '')                     // menções
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')     // e-mails
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '')       // telefones
    // Nome próprio provável: 2+ palavras capitalizadas em sequência,
    // aceitando preposição no meio ("Ana de Souza").
    .replace(
      /\b[A-ZÀ-Þ][a-zà-þ]{2,}(?:\s+(?:d[aeo]s?|d[aeo]|e)\s+|\s+)[A-ZÀ-Þ][a-zà-þ]{2,}(?:(?:\s+(?:d[aeo]s?|d[aeo]|e)\s+|\s+)[A-ZÀ-Þ][a-zà-þ]{2,})*/g,
      '[nome]',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Extrai sinais organizacionais de uma legenda. Pura. */
export function extrairSinais(
  legenda: string | null | undefined,
  meta: { data?: string | null; permalink?: string | null } = {},
): SinalInstagram[] {
  if (!legenda || typeof legenda !== 'string') return [];
  const limpa = sanitizarLegenda(legenda);
  if (!limpa) return [];

  const ehSobreMatricula = RE_MATRICULA.test(limpa);
  const achados: SinalInstagram[] = [];

  for (const { tipo, re } of PADROES) {
    // Legenda de matrícula não gera sinal de contratação, mesmo citando "vaga".
    if (tipo === 'contratacao' && ehSobreMatricula) continue;
    const m = limpa.match(re);
    if (!m) continue;
    achados.push({
      tipo,
      evidencia: trecho(limpa, m.index ?? 0),
      data: meta.data ?? null,
      permalink: meta.permalink ?? null,
    });
  }
  return achados;
}

/** Janela curta em volta do match — evidência para humano, não corpus. */
function trecho(texto: string, pos: number, raio = 70): string {
  const ini = Math.max(0, pos - raio);
  const fim = Math.min(texto.length, pos + raio);
  return (ini > 0 ? '…' : '') + texto.slice(ini, fim).trim() + (fim < texto.length ? '…' : '');
}

/** Um sinal por tipo — o mais recente. A ficha quer "houve", não "quantos". */
export function dedupPorTipo(sinais: SinalInstagram[]): SinalInstagram[] {
  const porTipo = new Map<TipoSinal, SinalInstagram>();
  for (const s of sinais) {
    const atual = porTipo.get(s.tipo);
    if (!atual) { porTipo.set(s.tipo, s); continue; }
    if ((s.data ?? '') > (atual.data ?? '')) porTipo.set(s.tipo, s);
  }
  return [...porTipo.values()];
}
