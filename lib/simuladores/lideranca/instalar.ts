/**
 * Materializa a matriz global de liderança NO TENANT. Núcleo sem gate (padrão
 * de `lib/blueprint/core.ts`): quem chama já autorizou.
 *
 * Por que materializar, se a matriz é global: os três motores do caminho leem
 * por empresa, e nenhum é opcional.
 *   1. IA4 lê a régua com `tdb.from('competencias')` (`lib/ia4-avaliacao.ts`);
 *   2. a fila da IA3 sai de `cargos_empresa.top5_workshop` (`actions/fase1.ts`),
 *      e o par (cargo, nome) precisa existir em `competencias` para gerar;
 *   3. o cenário é chaveado por `(empresa_id, cargo, competencia_id)`.
 * Um catálogo que vivesse só no código não seria enxergado por nenhum dos três.
 *
 * Idempotente: roda quantas vezes precisar. Cargo casa por `(empresa_id, nome)`
 * (a UNIQUE da tabela) e competência por `(cod_comp, cod_desc)`, a mesma chave
 * de dedupe que o importador de `/admin/competencias` usa.
 *
 * ⚠️ NÃO reusa `importarCompetenciasCSV`: aquilo é INSERT puro que ignora
 * duplicata em SILÊNCIO, é server action com gate próprio, e o parse das 14
 * colunas mora no cliente. Reinstalar por lá nunca atualizaria um texto.
 */
import { VARIANTES, linhasDaVariante, COMPETENCIAS_LIDERANCA, type VarianteLideranca, type LinhaMatriz } from './matriz-global';

/**
 * Marca gravada na `descricao` do cargo-âncora. É o que distingue uma âncora
 * NOSSA de um cargo real homônimo, e precisa ser estável entre VERSÕES da
 * matriz: o `top5_workshop` não serve para isso, porque muda junto com ela.
 *
 * Medido em 14/09/2026, trocando a matriz comercial pela transversal: a âncora
 * gravada na versão anterior ficou com o Top 5 antigo, o instalador a leu como
 * cargo real da empresa e RECUSOU a instalação inteira. A matriz nunca
 * atualizaria, e o motivo não aparecia em lugar nenhum.
 */
export const MARCA_ANCORA = 'Âncora da matriz global de liderança.';

export interface ResultadoInstalacao {
  ok: boolean;
  erro?: string;
  /** Cargos criados ou já existentes, por variante. */
  cargos: { variante: VarianteLideranca; nome: string; criado: boolean }[];
  descritoresInseridos: number;
  descritoresAtualizados: number;
  /**
   * Âncoras de uma versão ANTERIOR da matriz: trazem a marca, mas o nome não é
   * mais o de nenhuma variante. Ficam como lixo (competências que ninguém mede
   * e um cargo que não é de ninguém). São RELATADAS, nunca apagadas sozinhas:
   * apagar cargo e competência de um tenant é decisão de quem opera.
   */
  ancorasOrfas: string[];
}

/** Colunas que a instalação escreve em `competencias`. */
const COLUNAS_COMPETENCIA = [
  'cod_comp', 'nome', 'pilar', 'cargo', 'descricao',
  'cod_desc', 'nome_curto', 'descritor_completo',
  'n1_gap', 'n2_desenvolvimento', 'n3_meta', 'n4_referencia',
  'evidencias_esperadas', 'perguntas_alvo',
] as const;

const linhaParaRegistro = (l: LinhaMatriz, empresaId: string) => {
  const o: Record<string, unknown> = { empresa_id: empresaId };
  for (const c of COLUNAS_COMPETENCIA) o[c] = l[c] || null;
  return o;
};

const chaveDesc = (cod_comp: unknown, cod_desc: unknown) =>
  `${String(cod_comp ?? '').trim()}||${String(cod_desc ?? '').trim()}`.toLowerCase();

/**
 * Instala (ou atualiza) as duas variantes da matriz no tenant.
 *
 * Fail-loud em três pontos, porque o silêncio aqui corrompe dado de cliente:
 * erro de leitura nunca vira "instalado"; cargo HOMÔNIMO de um cargo real da
 * empresa recusa a instalação inteira; e escrita que falha volta como erro.
 */
export async function instalarMatrizLideranca(sb: any, empresaId: string): Promise<ResultadoInstalacao> {
  const vazio: ResultadoInstalacao = { ok: false, cargos: [], descritoresInseridos: 0, descritoresAtualizados: 0, ancorasOrfas: [] };

  const nomes = Object.values(VARIANTES) as string[];
  const { data: cargosExistentes, error: erroCargos } = await sb.from('cargos_empresa')
    .select('id, nome, top5_workshop, gabarito, descricao')
    .eq('empresa_id', empresaId);
  if (erroCargos) return { ...vazio, erro: `não foi possível ler os cargos: ${erroCargos.message}` };

  const porNome = new Map<string, any>((cargosExistentes || []).map((c: any) => [String(c.nome || '').trim(), c]));

  /**
   * 🔴 Um cargo com o nome da variante que NÃO seja nosso é um cargo real da
   * empresa. Gravar por cima reescreveria o `top5_workshop` e o `gabarito` dele
   * em silêncio, e o gabarito é o que alimenta o eixo de estilo do Ranking.
   *
   * Nosso é o que traz a MARCA na descrição (estável entre versões da matriz)
   * ou o que já tem exatamente as 5 competências da versão atual no Top 5. Só
   * o segundo critério não bastava: na troca de matriz a âncora antiga carrega
   * o Top 5 antigo e seria lida como cargo de verdade.
   */
  const nossas = new Set(COMPETENCIAS_LIDERANCA);
  const ehNosso = (c: any) => {
    if (String(c?.descricao ?? '').startsWith(MARCA_ANCORA)) return true;
    const t5 = Array.isArray(c?.top5_workshop) ? c.top5_workshop.map((s: unknown) => String(s ?? '').trim()) : [];
    return t5.length === nossas.size && t5.every((n: string) => nossas.has(n));
  };
  const conflitos = nomes.filter((n) => porNome.has(n) && !ehNosso(porNome.get(n)));
  if (conflitos.length) {
    return {
      ...vazio,
      erro: `Esta empresa já tem cargo com o nome da matriz de liderança: ${conflitos.join(', ')}. `
        + 'Instalar sobrescreveria o Top 5 e o gabarito desse cargo. Renomeie o cargo da empresa antes.',
    };
  }

  const cargos: ResultadoInstalacao['cargos'] = [];
  for (const [variante, nome] of Object.entries(VARIANTES) as [VarianteLideranca, string][]) {
    const existente = porNome.get(nome);
    const campos = {
      nome,
      top5_workshop: [...COMPETENCIAS_LIDERANCA],
      // Sem gabarito de propósito: o eixo de estilo usa o gabarito do cargo-alvo
      // REAL da empresa, não o desta âncora. `eh_vaga`/`eh_pool_candidatos`
      // ficam no default (false) para não entrar em tela de seleção.
      descricao: `${MARCA_ANCORA} Criado pela plataforma; não é um cargo da empresa.`,
    };
    if (existente) {
      const { error } = await sb.from('cargos_empresa').update(campos).eq('id', existente.id).eq('empresa_id', empresaId);
      if (error) return { ...vazio, erro: `não foi possível atualizar o cargo "${nome}": ${error.message}` };
      cargos.push({ variante, nome, criado: false });
    } else {
      const { error } = await sb.from('cargos_empresa').insert({ ...campos, empresa_id: empresaId });
      if (error) return { ...vazio, erro: `não foi possível criar o cargo "${nome}": ${error.message}` };
      cargos.push({ variante, nome, criado: true });
    }
  }

  // Competências: lê o que já existe para decidir insert x update por linha.
  const { data: jaTem, error: erroComp } = await sb.from('competencias')
    .select('id, cod_comp, cod_desc, cargo')
    .eq('empresa_id', empresaId)
    .in('cargo', nomes);
  if (erroComp) return { ...vazio, erro: `não foi possível ler as competências: ${erroComp.message}` };

  const porChave = new Map<string, any>((jaTem || []).map((c: any) => [chaveDesc(c.cod_comp, c.cod_desc), c]));

  let inseridos = 0;
  let atualizados = 0;
  const novos: Record<string, unknown>[] = [];
  for (const variante of Object.keys(VARIANTES) as VarianteLideranca[]) {
    for (const linha of linhasDaVariante(variante)) {
      const registro = linhaParaRegistro(linha, empresaId);
      const existente = porChave.get(chaveDesc(linha.cod_comp, linha.cod_desc));
      if (existente) {
        const { error } = await sb.from('competencias').update(registro).eq('id', existente.id).eq('empresa_id', empresaId);
        if (error) return { ...vazio, erro: `não foi possível atualizar ${linha.cod_desc}: ${error.message}` };
        atualizados += 1;
      } else {
        novos.push(registro);
      }
    }
  }
  if (novos.length) {
    const { error } = await sb.from('competencias').insert(novos);
    if (error) return { ...vazio, erro: `não foi possível gravar a matriz: ${error.message}` };
    inseridos = novos.length;
  }

  const ancorasOrfas = (cargosExistentes || [])
    .filter((c: any) => String(c?.descricao ?? '').startsWith(MARCA_ANCORA) && !nomes.includes(String(c?.nome || '').trim()))
    .map((c: any) => String(c.nome));

  return { ok: true, cargos, descritoresInseridos: inseridos, descritoresAtualizados: atualizados, ancorasOrfas };
}

/** A matriz está instalada e completa neste tenant? Leitura barata, para a tela. */
export async function estadoMatrizLideranca(sb: any, empresaId: string): Promise<{ instalada: boolean; descritores: number; esperado: number; erro?: string }> {
  const esperado = (Object.keys(VARIANTES).length) * COMPETENCIAS_LIDERANCA.length * 6;
  const { count, error } = await sb.from('competencias')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .in('cargo', Object.values(VARIANTES) as string[])
    .not('cod_desc', 'is', null);
  if (error) return { instalada: false, descritores: 0, esperado, erro: error.message };
  const descritores = Number(count) || 0;
  return { instalada: descritores >= esperado, descritores, esperado };
}
