/**
 * Normalização de NOMES DE DESCRITOR — fonte única.
 *
 * Por que existe: `descriptor_assessments.descritor` é chave de agrupamento
 * (upsert por colaborador+competência+descritor e dedup nos relatórios), mas a
 * IA4 persiste o nome ECOADO PELO MODELO, que muda de formato a cada rodada —
 * medido em 20/07/2026, no MESMO dia e código: "COO03_D6 — Busca de apoio"
 * (prefixo, 13:09) e "Busca de apoio (COO03_D6)" (sufixo, 13:02), convivendo
 * com "Busca de apoio" (grid admin). Cada variante virava uma linha nova no
 * Retrato de Competências.
 *
 * Regra: eco de modelo NUNCA vira chave — resolva contra a régua oficial
 * (`resolverNomeOficial`) ao PERSISTIR, e normalize (`chaveDescritor`) ao LER.
 */

/** Remove código de descritor em PREFIXO ("COO03_D6 — X", "G09.6 - X") e em
 *  SUFIXO parentético ("X (COO03_D6)"). O sufixo exige dígito no código para
 *  não comer parênteses legítimos de conteúdo. */
export function stripCodigoDescritor(s: string): string {
  return String(s || '')
    .replace(/^[A-Z0-9][A-Z0-9_.-]*\s*[—–-]\s*/i, '')
    .replace(/\s*\(\s*[A-Z][A-Z0-9_.-]*\d[A-Z0-9_.-]*\s*\)\s*$/i, '')
    .trim();
}

/** Chave canônica p/ AGRUPAR (nunca exibir): sem código, sem acento, minúscula,
 *  espaços colapsados. */
export function chaveDescritor(s: string): string {
  return stripCodigoDescritor(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface DescritorOficial { cod_desc?: string | null; nome_curto?: string | null }

/**
 * Resolve o nome ECOADO pelo modelo contra a régua oficial da competência:
 * 1º pelo código presente no eco (prefixo ou sufixo), 2º pela chave canônica
 * do nome. Sem match → devolve o eco sem código (melhor esforço, nunca perde
 * a avaliação por causa do rótulo).
 */
export function resolverNomeOficial(eco: string, oficiais: DescritorOficial[]): string {
  const s = String(eco || '');
  for (const d of oficiais || []) {
    const cod = String(d.cod_desc || '').trim();
    if (cod && s.toUpperCase().includes(cod.toUpperCase()) && d.nome_curto) return d.nome_curto;
  }
  const chave = chaveDescritor(s);
  for (const d of oficiais || []) {
    if (d.nome_curto && chaveDescritor(d.nome_curto) === chave) return d.nome_curto;
  }
  return stripCodigoDescritor(s);
}
