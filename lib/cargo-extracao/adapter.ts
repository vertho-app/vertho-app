/**
 * Adaptador extração → colunas de `cargos_empresa` (a cola entre o EXTRATOR de descrição
 * de cargo e a IA2 que gera o gabarito).
 *
 * O extrator devolve estrutura RICA (itens com confiança + fonte) — feita pra REVISÃO
 * humana. A IA2 (`buildUserPrompt`, actions/fase1.ts) consome os campos como STRING. Este
 * módulo ACHATA o rico → colunas canônicas, aplicando duas travas de segurança:
 *
 *  1. APROVAÇÃO: só entra o que o revisor deixou entrar. Default doutrinário (alinhado ao
 *     "campo suposto não contamina a régua"): item `alta` entra sozinho; `media`/`baixa`
 *     SÓ com aprovação explícita. `aprovado:false` sempre exclui. Assim uma leitura frágil
 *     nunca vira faixa/DISC sem alguém ter olhado.
 *  2. PATCH PARCIAL: o retorno só traz colunas COM conteúdo aprovado. Campo vazio NÃO vai
 *     no patch — um update parcial jamais apaga dado que já existe no cargo com "".
 *
 * Puro (sem IA, sem Supabase): recebe o objeto do extrator, devolve patch + diagnóstico.
 */

export type Confianca = 'alta' | 'media' | 'baixa';

/** Item extraído com evidência. `aprovado` é setado na tela de revisão (undefined = não tocado). */
export interface ItemEvid {
  texto: string;
  confianca: Confianca;
  fonte: string;        // trecho literal do documento
  aprovado?: boolean;   // revisão humana: true=entra, false=descarta, undefined=política default
}

/** Saída bruta do extrator (nomes já canônicos = colunas de cargos_empresa). */
export interface ExtracaoCargo {
  documento_valido: boolean;
  cargo_titulo?: ItemEvid;
  area_depto?: ItemEvid;
  descricao?: ItemEvid;
  contexto_cultural?: ItemEvid;
  principais_entregas?: ItemEvid[];
  stakeholders?: ItemEvid[];
  decisoes_recorrentes?: ItemEvid[];
  tensoes_comuns?: ItemEvid[];
  campos_faltantes?: string[];
  elicitar_na_revisao?: string[];
  trechos_ambiguos?: string[];
}

/** Colunas de contexto de `cargos_empresa` que a IA2 lê (todas string). NÃO inclui `cargo`
 *  (nome = chave; o extrator só SUGERE o título, quem confirma é o revisor). */
export interface CargoColunas {
  area_depto: string;
  descricao: string;
  principais_entregas: string;
  stakeholders: string;
  decisoes_recorrentes: string;
  tensoes_comuns: string;
  contexto_cultural: string;
}

const ESCALARES = ['area_depto', 'descricao', 'contexto_cultural'] as const;
const ARRAYS = ['principais_entregas', 'stakeholders', 'decisoes_recorrentes', 'tensoes_comuns'] as const;

export interface AchatarOpts {
  /** Confiança mínima que entra SEM aprovação explícita. Default 'alta'. 'media' afrouxa
   *  (alta+media entram sozinhos); 'nunca' exige aprovado:true em TUDO (revisão estrita). */
  autoAceitaAte?: 'alta' | 'media' | 'nunca';
  /** Separador ao juntar itens de array numa string única. Default '; '. */
  sep?: string;
}

export interface Diagnostico {
  documentoInvalido: boolean;
  vazios: string[];                 // colunas que ficaram sem conteúdo (não vão no patch)
  incluidos: Record<string, number>;// coluna → nº de itens que entraram
  rejeitados: { campo: string; texto: string; motivo: 'reprovado' | 'baixa_confianca_sem_aprovacao' }[];
  cargoTituloSugerido: ItemEvid | null; // NÃO entra no patch — revisor confirma o nome à parte
  elicitar: string[];               // perguntas dirigidas p/ o revisor (decisões/tensões ausentes)
  faltantes: string[];
  ambiguos: string[];
}

/** Um item entra? alta ≤ limiar → auto; senão precisa aprovado===true. aprovado===false veta. */
function entra(item: ItemEvid, autoAte: 'alta' | 'media' | 'nunca'): boolean {
  if (item.aprovado === true) return true;
  if (item.aprovado === false) return false;
  if (autoAte === 'nunca') return false;
  if (autoAte === 'media') return item.confianca === 'alta' || item.confianca === 'media';
  return item.confianca === 'alta';
}

const motivoRejeicao = (item: ItemEvid): 'reprovado' | 'baixa_confianca_sem_aprovacao' =>
  item.aprovado === false ? 'reprovado' : 'baixa_confianca_sem_aprovacao';

/**
 * Achata a extração revisada em um PATCH parcial das colunas + diagnóstico da triagem.
 * `patch` = só colunas com conteúdo aprovado (update parcial NÃO apaga dado existente).
 */
export function achatarExtracao(ext: ExtracaoCargo, opts: AchatarOpts = {}): { patch: Partial<CargoColunas>; diagnostico: Diagnostico } {
  const autoAte = opts.autoAceitaAte ?? 'alta';
  const sep = opts.sep ?? '; ';
  const patch: Partial<CargoColunas> = {};
  const diag: Diagnostico = {
    documentoInvalido: !ext.documento_valido,
    vazios: [], incluidos: {}, rejeitados: [],
    cargoTituloSugerido: ext.cargo_titulo && ext.cargo_titulo.texto.trim() ? ext.cargo_titulo : null,
    elicitar: ext.elicitar_na_revisao ?? [],
    faltantes: ext.campos_faltantes ?? [],
    ambiguos: ext.trechos_ambiguos ?? [],
  };

  // Documento inválido → não deriva nada. Patch vazio; o caller mostra o porquê.
  if (!ext.documento_valido) {
    diag.vazios = [...ESCALARES, ...ARRAYS];
    return { patch, diagnostico: diag };
  }

  for (const campo of ESCALARES) {
    const item = ext[campo];
    if (item && item.texto.trim() && entra(item, autoAte)) {
      patch[campo] = item.texto.trim();
      diag.incluidos[campo] = 1;
    } else {
      if (item && item.texto.trim()) diag.rejeitados.push({ campo, texto: item.texto.trim(), motivo: motivoRejeicao(item) });
      diag.vazios.push(campo);
    }
  }

  for (const campo of ARRAYS) {
    const itens = ext[campo] ?? [];
    const aceitos: string[] = [];
    for (const item of itens) {
      if (!item.texto.trim()) continue;
      if (entra(item, autoAte)) aceitos.push(item.texto.trim());
      else diag.rejeitados.push({ campo, texto: item.texto.trim(), motivo: motivoRejeicao(item) });
    }
    if (aceitos.length) {
      patch[campo] = aceitos.join(sep);
      diag.incluidos[campo] = aceitos.length;
    } else {
      diag.vazios.push(campo);
    }
  }

  return { patch, diagnostico: diag };
}

/**
 * Pré-marca a extração para a tela de revisão: itens `alta` já entram marcados (aprovado
 * true), `media`/`baixa` ficam SEM marca (força o revisor a decidir). Conveniência de UI —
 * NÃO muda a política de `achatarExtracao` (que já trata undefined), só materializa o
 * default no formulário pra o revisor ver o que está prestes a entrar.
 */
export function prepararRevisao(ext: ExtracaoCargo): ExtracaoCargo {
  // alta → true (pré-aceito); media/baixa → undefined (PENDENTE, não `false`): senão viram
  // "reprovado" no diagnóstico e a UI os riscaria em vez de destacá-los pra decisão.
  const auto = (i: ItemEvid): boolean | undefined => i.aprovado ?? (i.confianca === 'alta' ? true : undefined);
  const marca = (i?: ItemEvid): ItemEvid | undefined => i && ({ ...i, aprovado: auto(i) });
  const marcaArr = (a?: ItemEvid[]): ItemEvid[] | undefined => a && a.map((i) => ({ ...i, aprovado: auto(i) }));
  return {
    ...ext,
    cargo_titulo: marca(ext.cargo_titulo),
    area_depto: marca(ext.area_depto),
    descricao: marca(ext.descricao),
    contexto_cultural: marca(ext.contexto_cultural),
    principais_entregas: marcaArr(ext.principais_entregas),
    stakeholders: marcaArr(ext.stakeholders),
    decisoes_recorrentes: marcaArr(ext.decisoes_recorrentes),
    tensoes_comuns: marcaArr(ext.tensoes_comuns),
  };
}
