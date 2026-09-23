/**
 * Import da matriz de competências: células mescladas e CÓDIGOS gerados pelo
 * sistema. Roda no navegador (`preencherCelulasMescladas`, logo depois de ler a
 * planilha) e no servidor (`atribuirCodigosDaMatriz`, antes de gravar), por isso
 * não importa nada de servidor.
 *
 * Por que existe (23/09/2026): `cod_comp` vazio virava as 10 primeiras letras do
 * nome — "Gestão de Pessoas" e "Gestão de Projetos" davam os dois "GESTÃO DE ",
 * uma competência só para a tela (mesmo cartão, o excluir apaga as duas) e para o
 * cenário (descritores das duas misturados). E `cod_desc` vazio ficava nulo: o
 * descritor era gravado, mas a tela não o mostrava e as leituras da régua
 * (`.not('cod_desc', 'is', null)`) o ignoravam. Medido no mesmo dia: 0 de 233
 * códigos de competência no banco tinham saído da regra antiga; toda matriz até
 * então veio com código digitado.
 *
 * Formato gerado = o que domina no banco: 3 letras do cargo + 2 dígitos
 * (`COO01`) e `<competência>-D<2 dígitos>` (`COO01-D01`).
 */
import { chaveDescritor } from '@/lib/descritores';

export interface LinhaDaMatrizImportada {
  nome?: string | null;
  cargo?: string | null;
  cod_comp?: string | null;
  cod_desc?: string | null;
  nome_curto?: string | null;
  descritor_completo?: string | null;
  n1_gap?: string | null;
  n2_desenvolvimento?: string | null;
  n3_meta?: string | null;
  n4_referencia?: string | null;
}

export type LinhaDaMatrizGravada = Pick<
  LinhaDaMatrizImportada,
  'nome' | 'cargo' | 'cod_comp' | 'cod_desc' | 'nome_curto' | 'descritor_completo'
>;

const texto = (s?: string | null) => String(s ?? '').trim();
const semAcento = (s?: string | null) => texto(s).normalize('NFD').replace(/\p{M}/gu, '');
const chaveNome = (s?: string | null) => semAcento(s).toLowerCase().replace(/\s+/g, ' ');
const chaveCargo = (s?: string | null) => texto(s).toLowerCase();
const chaveCodigo = (s?: string | null) => texto(s).toUpperCase();
const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Colunas da COMPETÊNCIA: célula vazia herda da linha de cima (células mescladas). */
const CAMPOS_COMP = ['nome', 'cod_comp', 'pilar', 'cargo', 'descricao', 'evidencias_esperadas', 'perguntas_alvo'];
/** ...mas estas só herdam dentro da MESMA competência: uma competência nova sem
 *  código, logo abaixo de outra, herdava o código de cima e se fundia com ela. */
const SO_NA_MESMA_COMPETENCIA = new Set(['cod_comp', 'descricao']);

/**
 * Linhas da planilha → linhas de competência. Célula vazia nas colunas da
 * competência é copiada da linha de cima; linha sem nome (nem herdado) sai.
 */
export function preencherCelulasMescladas(linhas: Record<string, string>[]): Record<string, string>[] {
  const saida: Record<string, string>[] = [];
  let anterior: Record<string, string> = {};
  for (const linha of linhas) {
    const preenchida: Record<string, string> = { ...linha };
    const mesmaCompetencia = !texto(linha.nome) || chaveNome(linha.nome) === chaveNome(anterior.nome);
    for (const campo of CAMPOS_COMP) {
      if (SO_NA_MESMA_COMPETENCIA.has(campo) && !mesmaCompetencia) continue;
      if (!texto(preenchida[campo]) && texto(anterior[campo])) preenchida[campo] = anterior[campo];
    }
    if (texto(preenchida.nome)) {
      saida.push(preenchida);
      anterior = preenchida;
    }
  }
  return saida;
}

/** Linha com qualquer campo da régua é um DESCRITOR; sem nenhum, é a linha-cabeçalho da competência. */
function ehDescritor(l: LinhaDaMatrizImportada): boolean {
  return [l.nome_curto, l.descritor_completo, l.n1_gap, l.n2_desenvolvimento, l.n3_meta, l.n4_referencia]
    .some((v) => texto(v));
}

/** Identidade do descritor para reusar o código numa reimportação. Vazia = não reusa. */
function identidadeDoDescritor(l: { nome_curto?: string | null; descritor_completo?: string | null }): string {
  return chaveDescritor(texto(l.nome_curto) || texto(l.descritor_completo));
}

/** "Coordenador(a) de Equipe" → "COO". Sem cargo (ou sem letra) → "CMP". */
export function prefixoDoCargo(cargo?: string | null): string {
  return semAcento(cargo).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'CMP';
}

/** Maior número capturado pelo padrão (`/^COO(\d+)$/` em `COO03` → 3; `/(\d+)$/` em `COO01_D6` → 6). */
function maiorNumero(codigos: Iterable<string>, padrao: RegExp): number {
  let maior = 0;
  for (const c of codigos) {
    const m = padrao.exec(c);
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return maior;
}

export interface CodigosDaMatriz<T> {
  /** Cópias das linhas com `cod_comp` sempre e `cod_desc` em toda linha de descritor. */
  linhas: (T & { cod_comp: string; cod_desc: string | null })[];
  /** Mesmo código digitado para competências de nomes diferentes no mesmo cargo. */
  conflitos: string[];
  /** Códigos NOVOS criados (reusar o código de algo que já existe não conta). */
  gerados: number;
}

/**
 * Preenche os códigos que vieram vazios. Código digitado é respeitado.
 *
 * Competência (`cod_comp`), na ordem: o código da competência de MESMO NOME no
 * mesmo cargo (banco ou arquivo); o de mesmo nome em outro cargo, se for um só —
 * a mesma matriz em 2 cargos são cópias com o mesmo código, e o módulo-base é
 * feito uma vez por matriz (lib/matriz-por-cargo); senão, um código novo, único
 * na empresa inteira.
 *
 * Descritor (`cod_desc`): o do descritor de mesmo nome na mesma competência (é
 * o que faz a reimportação cair no dedup em vez de duplicar); o da cópia em
 * outro cargo; senão `<competência>-D<próximo número do grupo>`.
 */
export function atribuirCodigosDaMatriz<T extends LinhaDaMatrizImportada>(
  linhas: T[],
  existentes: LinhaDaMatrizGravada[],
): CodigosDaMatriz<T> {
  const nomeDoCodigo = new Map<string, { chave: string; nome: string }>(); // cargo::COD
  const codigoDoNomeNoCargo = new Map<string, string>();                   // cargo::nome
  const codigosDoNome = new Map<string, Set<string>>();                    // nome → códigos (qualquer cargo)
  const usados = new Set<string>();                                        // COD, empresa inteira
  const descritoresDoGrupo = new Map<string, Set<string>>();               // cargo::COD → cod_desc
  const descritorNoGrupo = new Map<string, string>();                      // cargo::COD::identidade
  const descritorEmOutroCargo = new Map<string, string>();                 // COD::identidade
  const conflitos = new Set<string>();
  let gerados = 0;

  const registrarCompetencia = (cargo: string | null | undefined, cod: string, nome: string | null | undefined) => {
    const cg = chaveCargo(cargo);
    const cc = chaveCodigo(cod);
    const n = chaveNome(nome);
    if (!nomeDoCodigo.has(`${cg}::${cc}`)) nomeDoCodigo.set(`${cg}::${cc}`, { chave: n, nome: texto(nome) });
    if (!codigoDoNomeNoCargo.has(`${cg}::${n}`)) codigoDoNomeNoCargo.set(`${cg}::${n}`, texto(cod));
    if (!codigosDoNome.has(n)) codigosDoNome.set(n, new Set());
    codigosDoNome.get(n)!.add(texto(cod));
    usados.add(cc);
  };
  const registrarDescritor = (cargo: string | null | undefined, cod: string, codDesc: string, identidade: string) => {
    const grupo = `${chaveCargo(cargo)}::${chaveCodigo(cod)}`;
    if (!descritoresDoGrupo.has(grupo)) descritoresDoGrupo.set(grupo, new Set());
    descritoresDoGrupo.get(grupo)!.add(chaveCodigo(codDesc));
    if (!identidade) return;
    if (!descritorNoGrupo.has(`${grupo}::${identidade}`)) descritorNoGrupo.set(`${grupo}::${identidade}`, codDesc);
    const outro = `${chaveCodigo(cod)}::${identidade}`;
    if (!descritorEmOutroCargo.has(outro)) descritorEmOutroCargo.set(outro, codDesc);
  };
  const livreNoCargo = (cargo: string | null | undefined, cod: string, nome: string | null | undefined) => {
    const dono = nomeDoCodigo.get(`${chaveCargo(cargo)}::${chaveCodigo(cod)}`);
    return !dono || dono.chave === chaveNome(nome);
  };
  const codigoNovo = (cargo: string | null | undefined) => {
    const prefixo = prefixoDoCargo(cargo);   // só A-Z: seguro dentro do RegExp
    let n = maiorNumero(usados, new RegExp(`^${prefixo}(\\d+)$`)) + 1;
    while (usados.has(`${prefixo}${doisDigitos(n)}`)) n++;
    gerados++;
    return `${prefixo}${doisDigitos(n)}`;
  };
  const descritorNovo = (cargo: string | null | undefined, cod: string) => {
    const doGrupo = descritoresDoGrupo.get(`${chaveCargo(cargo)}::${chaveCodigo(cod)}`) || new Set<string>();
    let n = maiorNumero(doGrupo, /(\d+)$/) + 1;
    while (doGrupo.has(chaveCodigo(`${cod}-D${doisDigitos(n)}`))) n++;
    gerados++;
    return `${cod}-D${doisDigitos(n)}`;
  };

  for (const e of existentes) {
    if (!texto(e.cod_comp)) continue;
    registrarCompetencia(e.cargo, texto(e.cod_comp), e.nome);
    if (texto(e.cod_desc)) registrarDescritor(e.cargo, texto(e.cod_comp), texto(e.cod_desc), identidadeDoDescritor(e));
  }

  const saida = linhas.map((l) => ({ ...l, cod_comp: texto(l.cod_comp), cod_desc: texto(l.cod_desc) }));

  // 1ª passada: o código de competência DIGITADO ocupa o lugar antes de qualquer gerado.
  for (const l of saida) {
    if (!l.cod_comp) continue;
    const dono = nomeDoCodigo.get(`${chaveCargo(l.cargo)}::${chaveCodigo(l.cod_comp)}`);
    if (dono && dono.chave !== chaveNome(l.nome)) {
      conflitos.add(`${l.cod_comp} (${texto(l.cargo) || 'sem cargo'}): "${dono.nome}" e "${texto(l.nome)}"`);
      continue;
    }
    registrarCompetencia(l.cargo, l.cod_comp, l.nome);
  }

  // 2ª passada: competência sem código.
  for (const l of saida) {
    if (l.cod_comp) continue;
    const doNome = [...(codigosDoNome.get(chaveNome(l.nome)) || [])];
    const candidatos = [
      codigoDoNomeNoCargo.get(`${chaveCargo(l.cargo)}::${chaveNome(l.nome)}`),
      doNome.length === 1 ? doNome[0] : undefined,
    ];
    l.cod_comp = candidatos.find((c): c is string => !!c && livreNoCargo(l.cargo, c, l.nome)) || codigoNovo(l.cargo);
    registrarCompetencia(l.cargo, l.cod_comp, l.nome);
  }

  // 3ª passada: o código de descritor DIGITADO, agora que toda linha tem competência.
  for (const l of saida) {
    if (l.cod_desc) registrarDescritor(l.cargo, l.cod_comp, l.cod_desc, identidadeDoDescritor(l));
  }

  // 4ª passada: descritor sem código (a linha-cabeçalho da competência fica sem).
  for (const l of saida) {
    if (l.cod_desc || !ehDescritor(l)) continue;
    const identidade = identidadeDoDescritor(l);
    const grupo = `${chaveCargo(l.cargo)}::${chaveCodigo(l.cod_comp)}`;
    const daCopia = identidade ? descritorEmOutroCargo.get(`${chaveCodigo(l.cod_comp)}::${identidade}`) : undefined;
    l.cod_desc = (identidade && descritorNoGrupo.get(`${grupo}::${identidade}`))
      || (daCopia && !descritoresDoGrupo.get(grupo)?.has(chaveCodigo(daCopia)) ? daCopia : '')
      || descritorNovo(l.cargo, l.cod_comp);
    registrarDescritor(l.cargo, l.cod_comp, l.cod_desc, identidade);
  }

  return {
    linhas: saida.map((l) => ({ ...l, cod_desc: l.cod_desc || null })),
    conflitos: [...conflitos],
    gerados,
  };
}
