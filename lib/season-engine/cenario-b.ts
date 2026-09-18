/**
 * Escolha do Cenário B do fechamento: o B tem que ser DA COMPETÊNCIA da trilha.
 *
 * Até 18/09/2026 a busca era por empresa + cargo, o mais recente (com fallback
 * para `cargo='todos'`). A competência não entrava em lugar nenhum, e isso só
 * não mordia porque quase todo cargo tinha um B só. Com a Jornada (uma
 * competência por trilha) deixou de ser verdade: os diretores de Macaé têm duas
 * competências de foco, e o B mais recente do cargo seria servido para as duas
 * jornadas. `Medido:` no acme-demo, 10 trilhas de Representante Comercial em 2
 * competências e 5 B no cargo, um por competência; todas receberiam o último.
 * O scorer então pontua os descritores da trilha contra o cenário de OUTRA
 * competência, e o relatório sai sobre ela, sem erro nenhum na tela.
 *
 * A régua:
 * - ELEGÍVEL é só o B que cobre TODAS as competências da trilha. Um B cobre a
 *   competência da sua âncora (`competencia_id`, pelo NOME) e as de
 *   `alternativas.competencias_integradas` (os integradores de Ibipeba, que
 *   cobrem as duas competências do DUO).
 * - Entre elegíveis: cargo específico antes de `todos`; depois o que cobre MENOS
 *   competências fora da trilha (numa jornada de uma competência, o B dela vence
 *   o integrador que também a cobre); depois o mais recente.
 * - Sem elegível: devolve `null` e registra degradação CRÍTICA. Servir o B de
 *   outra competência não é degradar, é avaliar a coisa errada.
 *
 * Por que casar pelo NOME e não por id: `competencias` tem uma linha por
 * descritor (em Macaé, "Gerenciamento de Conflitos" tem 9), e a trilha guarda a
 * competência pelo nome. Dentro do cargo o nome é único (a competência é única
 * por cargo), então nome normalizado + cargo basta como chave aqui. NÃO é uma
 * identidade universal: em `todos`, réguas diferentes com o mesmo nome não se
 * distinguem (fica para o M05, versão da matriz).
 *
 * Erro de leitura LANÇA (a rota devolve 500): transformar falha de banco em
 * "não há B" mandaria a pessoa para um 424 com a mensagem errada.
 */
import { normalizarComp } from '@/lib/workshop-competencias';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

export interface CenarioBRow {
  id: string;
  titulo: string | null;
  descricao: string | null;
  alternativas: any;
  cargo: string | null;
  competencia_id: string | null;
  created_at: string | null;
}

export interface CandidatoCenarioB extends CenarioBRow {
  /** Competências (normalizadas) que este B cobre. */
  cobertas: string[];
}

export type MotivoCenarioB = 'ok' | 'sem-competencia-na-trilha' | 'sem-elegivel';

export interface EscolhaCenarioB {
  cenario: CenarioBRow | null;
  motivo: MotivoCenarioB;
  /** B usáveis (com texto e ao menos uma pergunta) do cargo e de `todos`. */
  candidatos: number;
}

const PERGUNTAS = ['p1', 'p2', 'p3', 'p4'];

/** B sem texto ou sem nenhuma pergunta não serve ao fechamento, seja de qual competência for. */
export function cenarioBUsavel(row: Pick<CenarioBRow, 'descricao' | 'alternativas'>): boolean {
  if (!String(row?.descricao || '').trim()) return false;
  const alt = row?.alternativas && typeof row.alternativas === 'object' ? row.alternativas : {};
  return PERGUNTAS.some((k) => String(alt[k] || '').trim().length > 0);
}

/** Competências (normalizadas) cobertas por um B: a da âncora + as integradas. */
export function competenciasCobertas(row: Pick<CenarioBRow, 'competencia_id' | 'alternativas'>, nomePorId: Map<string, string>): string[] {
  const cobertas = new Set<string>();
  const ancora = row?.competencia_id ? nomePorId.get(row.competencia_id) : undefined;
  if (ancora) cobertas.add(normalizarComp(ancora));
  const integradas = row?.alternativas?.competencias_integradas;
  if (Array.isArray(integradas)) {
    for (const c of integradas) {
      const k = normalizarComp(c);
      if (k) cobertas.add(k);
    }
  }
  return [...cobertas];
}

/**
 * Núcleo puro da escolha. `alvo` são as competências da trilha; `cargo` é o do
 * colaborador. Devolve o B elegível preferido ou `null`.
 */
export function escolherEntreCandidatos(candidatos: CandidatoCenarioB[], alvo: string[], cargo: string): CandidatoCenarioB | null {
  const alvoNorm = [...new Set(alvo.map(normalizarComp).filter(Boolean))];
  if (!alvoNorm.length) return null;
  const cargoNorm = normalizarComp(cargo);
  const elegiveis = candidatos.filter((c) => alvoNorm.every((a) => c.cobertas.includes(a)));
  const fora = (c: CandidatoCenarioB) => c.cobertas.filter((x) => !alvoNorm.includes(x)).length;
  const doCargo = (c: CandidatoCenarioB) => (normalizarComp(c.cargo) === cargoNorm && cargoNorm !== 'todos' ? 0 : 1);
  elegiveis.sort((a, b) =>
    doCargo(a) - doCargo(b)
    || fora(a) - fora(b)
    || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return elegiveis[0] ?? null;
}

export interface OpcoesEscolhaCenarioB {
  /** `false` para simulação/ensaio: não polui o `degradacao_log`. Default `true`. */
  registrar?: boolean;
  colaboradorId?: string | null;
  trilhaId?: string | null;
}

/**
 * Escolhe o Cenário B de uma trilha. `competenciasDaTrilha` = `competencias_foco`
 * (ou `[competencia_foco]` nas trilhas antigas), pelo nome.
 */
export async function escolherCenarioB(
  sb: any,
  empresaId: string,
  cargo: string,
  competenciasDaTrilha: Array<string | null | undefined>,
  opts: OpcoesEscolhaCenarioB = {},
): Promise<EscolhaCenarioB> {
  const alvo = [...new Set((competenciasDaTrilha || []).map(normalizarComp).filter(Boolean))];
  const cargos = cargo && normalizarComp(cargo) !== 'todos' ? [cargo, 'todos'] : ['todos'];

  const { data: rows, error } = await sb.from('banco_cenarios')
    .select('id, titulo, descricao, alternativas, cargo, competencia_id, created_at')
    .eq('empresa_id', empresaId)
    .eq('tipo_cenario', 'cenario_b')
    .in('cargo', cargos)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Cenário B: leitura de banco_cenarios falhou (${error.message})`);

  const usaveis = ((rows || []) as CenarioBRow[]).filter(cenarioBUsavel);

  const ids = [...new Set(usaveis.map((r) => r.competencia_id).filter(Boolean))] as string[];
  const nomePorId = new Map<string, string>();
  if (ids.length) {
    const { data: comps, error: errComp } = await sb.from('competencias')
      .select('id, nome')
      .eq('empresa_id', empresaId)
      .in('id', ids);
    if (errComp) throw new Error(`Cenário B: leitura de competencias falhou (${errComp.message})`);
    for (const c of comps || []) if (c?.id && c?.nome) nomePorId.set(c.id, c.nome);
  }

  if (!alvo.length) return { cenario: null, motivo: 'sem-competencia-na-trilha', candidatos: usaveis.length };

  const candidatos: CandidatoCenarioB[] = usaveis.map((r) => ({ ...r, cobertas: competenciasCobertas(r, nomePorId) }));
  const escolhido = escolherEntreCandidatos(candidatos, alvo, cargo);
  if (escolhido) {
    const { cobertas: _cobertas, ...cenario } = escolhido;
    return { cenario, motivo: 'ok', candidatos: candidatos.length };
  }

  if (opts.registrar !== false) {
    await registrarDegradacao({
      fluxo: 'trilha',
      tipo: DEGRADACAO.CENARIO_B_SEM_ELEGIVEL,
      chave: `${empresaId}:${normalizarComp(cargo)}:${alvo.join('+')}`,
      empresaId,
      colaboradorId: opts.colaboradorId ?? null,
      severidade: 'critico',
      detalhe: {
        cargo,
        competencias: competenciasDaTrilha,
        trilhaId: opts.trilhaId ?? null,
        candidatos: candidatos.map((c) => ({ id: c.id, cargo: c.cargo, cobertas: c.cobertas })),
      },
    }, sb);
  }
  return { cenario: null, motivo: 'sem-elegivel', candidatos: candidatos.length };
}

/** B integrador: cobre mais de uma competência (Ibipeba, 01/09/2026). */
export function ehIntegrador(alternativas: any): boolean {
  const integradas = alternativas?.competencias_integradas;
  return Array.isArray(integradas) && integradas.filter((c) => normalizarComp(c)).length > 1;
}

export interface CenarioALote {
  id: string;
  titulo: string | null;
  descricao: string | null;
  cargo: string | null;
  competencia_id: string | null;
  ppp_escola_id?: string | null;
  alternativas?: any;
  created_at?: string | null;
}

export interface CelulaSemCenarioB {
  /** `competencia_id::cargo`. */
  chave: string;
  /** O cenário A que o B vai complementar: o de rede, senão o mais recente. */
  referencia: CenarioALote;
  /** Quantos cenários A a célula tem (um por PPP numa rede). */
  totalA: number;
}

/**
 * Células (competência × cargo) que ainda precisam de um Cenário B.
 *
 * O lote gerava um B por cenário A. Numa rede, a mesma célula tem um A por PPP,
 * e o resultado foi N B para a mesma célula (FMEA F-C14: 12 B de uma vez em
 * Ibipeba, 01/09/2026). Agora é um B por célula, e a célula conta como coberta
 * se já existe B do MESMO cargo que cobre a competência, pela âncora ou como
 * integrador (a mesma régua de `escolherCenarioB`). B de `todos` não cobre
 * célula de cargo: o do cargo, com o contexto dele, é o preferido.
 */
export function celulasSemCenarioB(
  cenariosA: CenarioALote[],
  cenariosB: Array<Pick<CenarioBRow, 'competencia_id' | 'cargo' | 'alternativas'>>,
  nomePorId: Map<string, string>,
  opts: { excluirCargo?: (cargo: string) => boolean } = {},
): CelulaSemCenarioB[] {
  const idsCobertos = new Set<string>();
  const nomesCobertosPorCargo = new Map<string, Set<string>>();
  for (const b of cenariosB || []) {
    if (b?.competencia_id && b?.cargo) idsCobertos.add(`${b.competencia_id}::${b.cargo}`);
    const cargo = normalizarComp(b?.cargo);
    const nomes = nomesCobertosPorCargo.get(cargo) ?? new Set<string>();
    for (const c of competenciasCobertas(b, nomePorId)) nomes.add(c);
    nomesCobertosPorCargo.set(cargo, nomes);
  }

  const porCelula = new Map<string, CenarioALote[]>();
  for (const a of cenariosA || []) {
    if (!a?.competencia_id || !a?.cargo) continue;
    if (opts.excluirCargo?.(a.cargo)) continue;
    const chave = `${a.competencia_id}::${a.cargo}`;
    const lista = porCelula.get(chave) ?? [];
    lista.push(a);
    porCelula.set(chave, lista);
  }

  const celulas: CelulaSemCenarioB[] = [];
  for (const [chave, lista] of porCelula) {
    if (idsCobertos.has(chave)) continue;
    const { competencia_id, cargo } = lista[0];
    const nome = competencia_id ? nomePorId.get(competencia_id) : undefined;
    if (nome && nomesCobertosPorCargo.get(normalizarComp(cargo))?.has(normalizarComp(nome))) continue;
    const referencia = [...lista].sort((x, y) =>
      (x.ppp_escola_id ? 1 : 0) - (y.ppp_escola_id ? 1 : 0)
      || String(y.created_at || '').localeCompare(String(x.created_at || '')))[0];
    celulas.push({ chave, referencia, totalA: lista.length });
  }
  return celulas;
}
