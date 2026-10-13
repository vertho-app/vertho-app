/**
 * Import de cargos (Empresas › Gerenciar › Importar Cargos): os títulos da
 * planilha (na tela) e a coluna de liderança (no servidor).
 */
import { chaveSemAcento, traduzirTitulos } from '@/lib/planilha-titulos';
import { chaveCargo, idDoCargo, mapaDeCargos } from '@/lib/simuladores/acesso-cargo';

/**
 * Título → coluna de `cargos_empresa`. Os títulos do modelo (25/09/2026) e os
 * antigos (`nome`, `area_depto`, `entregas`, `lideranca`...) valem igual.
 */
const COLUNA_DO_TITULO: Record<string, string> = {
  'cargo': 'nome',
  'nome': 'nome',
  'nome do cargo': 'nome',
  'area': 'area_depto',
  'area depto': 'area_depto',
  'departamento': 'area_depto',
  'descricao': 'descricao',
  'descricao do cargo': 'descricao',
  'principais entregas': 'principais_entregas',
  'entregas': 'principais_entregas',
  'stakeholders': 'stakeholders',
  'decisoes recorrentes': 'decisoes_recorrentes',
  'decisoes': 'decisoes_recorrentes',
  'tensoes comuns': 'tensoes_comuns',
  'tensoes': 'tensoes_comuns',
  'contexto cultural': 'contexto_cultural',
  'contexto': 'contexto_cultural',
  'cargo de lideranca': 'eh_lideranca',
  'eh lideranca': 'eh_lideranca',
  'lideranca': 'eh_lideranca',
  // Mig 286 (plano de cenários de 11/10/2026, Fase 3): o que o cargo NÃO faz e os casos reais.
  'fronteiras': 'fronteiras',
  'fronteiras do cargo': 'fronteiras',
  'o que o cargo nao faz': 'fronteiras',
};

/**
 * Casos reais por cargo na planilha: os pares "Competência N" + "Caso real N", N de 1 a 8 (o
 * modelo vem com a competência N já escrita, na ordem do Top 5 do cargo). "Caso N" também vale.
 */
export const MAX_CASOS_DA_PLANILHA = 8;
for (let n = 1; n <= MAX_CASOS_DA_PLANILHA; n++) {
  COLUNA_DO_TITULO[`caso real ${n}`] = `caso_real_${n}`;
  COLUNA_DO_TITULO[`caso ${n}`] = `caso_real_${n}`;
  COLUNA_DO_TITULO[`competencia ${n}`] = `competencia_${n}`;
}

export function colunasDoCargo(linhas: Record<string, string>[]): Record<string, string>[] {
  return traduzirTitulos(linhas, COLUNA_DO_TITULO);
}

/** Teto de um caso GRAVADO (o prompt corta mais curto): protege o banco de colagem acidental. */
export const MAX_CARACTERES_CASO_GRAVADO = 4000;

/**
 * Um caso como fica gravado em `cargos_empresa.casos_reais`: o texto e a competência para a
 * qual o gestor o escreveu. Sem competência, é um caso geral do cargo.
 *
 * Por que a competência vai junto (13/10/2026): o casamento era pela POSIÇÃO e os casos em
 * branco eram compactados ao gravar. Preencher os casos 1 e 3 e deixar o 2 vazio entregava o
 * caso 3 à competência 2, em silêncio; reordenar o Top 5 depois deslocava todos.
 */
export interface CasoGravado { texto: string; competencia?: string }

/**
 * Casos no formato gravado, a partir do que vier (planilha, formulário ou o próprio valor
 * gravado): só texto não vazio, na ordem, no máximo `MAX_CASOS_DA_PLANILHA`, com a competência
 * quando houver. `null` quando não sobra nenhum: a coluna fica vazia, não `[]`.
 */
export function casosReaisParaGravar(valor: unknown): CasoGravado[] | null {
  const lista = Array.isArray(valor) ? valor : [];
  const casos = lista
    .map((c) => (typeof c === 'string' ? { texto: c } : c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .map((c) => ({
      texto: String(c.texto ?? '').trim().slice(0, MAX_CARACTERES_CASO_GRAVADO),
      competencia: String(c.competencia ?? '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((c) => c.texto)
    .slice(0, MAX_CASOS_DA_PLANILHA)
    .map((c): CasoGravado => (c.competencia ? { texto: c.texto, competencia: c.competencia } : { texto: c.texto }));
  return casos.length ? casos : null;
}

/**
 * As colunas da mig 286 no "Salvar cargo": só entram no registro se vieram no pedido. Quem
 * salva sem elas (outra tela, cliente antigo em cache) não zera o que o gestor preencheu.
 */
export function camposNovosDoCargo(cargo: { fronteiras?: string | null; casos_reais?: unknown }): {
  fronteiras?: string | null; casos_reais?: CasoGravado[] | null;
} {
  return {
    ...(cargo.fronteiras !== undefined ? { fronteiras: cargo.fronteiras?.trim() || null } : {}),
    ...(cargo.casos_reais !== undefined ? { casos_reais: casosReaisParaGravar(cargo.casos_reais) } : {}),
  };
}

/** Um caso como sai da planilha: com a COLUNA de origem, para o servidor achar a competência pelo Top 5. */
export interface CasoDaPlanilha extends CasoGravado { coluna: number }

/**
 * Os casos de UMA linha da planilha (já com `colunasDoCargo`). Cada "Caso real N" leva a
 * "Competência N" da mesma linha e o próprio N: caso em branco não desloca os outros.
 */
export function casosReaisDaLinha(linha: Record<string, unknown>): CasoDaPlanilha[] | null {
  const casos: CasoDaPlanilha[] = [];
  for (let n = 1; n <= MAX_CASOS_DA_PLANILHA; n++) {
    const texto = String(linha?.[`caso_real_${n}`] ?? '').trim();
    if (!texto) continue;
    const competencia = String(linha?.[`competencia_${n}`] ?? '').replace(/\s+/g, ' ').trim();
    casos.push({ texto, ...(competencia ? { competencia } : {}), coluna: n });
  }
  return casos.length ? casos : null;
}

const chaveComp = (s: unknown) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Um campo de caso no formulário: a competência a que se refere (`null` = caso geral) e o texto. */
export interface SlotDeCaso { competencia: string | null; texto: string }

/**
 * Os campos de caso no formulário. Com Top 5: um campo por competência, na ordem, e depois os
 * casos gerais que já existirem (sem campo vazio a mais). Sem Top 5: os casos gerais e um campo
 * em branco no fim, até o máximo. O texto vai CRU (sem aparar): a pessoa está digitando, e
 * aparar a cada tecla comeria o espaço entre as palavras. Quem limpa é `casosReaisParaGravar`.
 */
export function slotsDosCasos(valor: unknown, top5?: unknown): SlotDeCaso[] {
  const lista = (Array.isArray(valor) ? valor : []).map((c) => {
    const o = typeof c === 'string' ? { texto: c } : c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
    return { texto: String(o.texto ?? ''), competencia: String(o.competencia ?? '').trim() || null };
  });
  const comps = (Array.isArray(top5) ? top5 : []).map((n) => String(n ?? '').trim()).filter(Boolean).slice(0, MAX_CASOS_DA_PLANILHA);
  const slots: SlotDeCaso[] = comps.map((nome) => ({
    competencia: nome,
    texto: lista.find((c) => c.competencia && chaveComp(c.competencia) === chaveComp(nome))?.texto ?? '',
  }));
  // Caso de competência que saiu do Top 5 segue visível (e editável) como estava gravado.
  const fora = lista.filter((c) => !c.competencia ? false : !comps.some((n) => chaveComp(n) === chaveComp(c.competencia)));
  const gerais = lista.filter((c) => !c.competencia);
  slots.push(...fora.map((c) => ({ competencia: c.competencia, texto: c.texto })), ...gerais.map((c) => ({ competencia: null, texto: c.texto })));
  if (comps.length) return slots.slice(0, Math.max(MAX_CASOS_DA_PLANILHA, comps.length));
  while (slots.length && !slots[slots.length - 1].texto.trim()) slots.pop();
  return slots.length < MAX_CASOS_DA_PLANILHA ? [...slots, { competencia: null, texto: '' }] : slots;
}

/** Troca o texto do campo `i` do formulário, guardando a competência dele (o vazio some ao salvar). */
export function comCasoTrocado(valor: unknown, top5: unknown, i: number, texto: string): CasoGravado[] {
  const slots = slotsDosCasos(valor, top5);
  if (slots[i]) slots[i] = { ...slots[i], texto };
  return slots.map((s) => (s.competencia ? { texto: s.texto, competencia: s.competencia } : { texto: s.texto }));
}

export interface PlanoDoImportDeCargos {
  /** Cargos novos, já no formato da tabela (sem `empresa_id`, que o servidor põe). */
  novos: Record<string, any>[];
  /** Cargos que já existem: só os casos reais e as fronteiras vindos da planilha. */
  atualizar: { id: string; nome: string; campos: { fronteiras?: string; casos_reais?: CasoGravado[] } }[];
  /** Linhas de cargo já existente sem caso nem fronteira: nada a fazer. */
  ignorados: number;
  /** Casos cuja competência não está no Top 5 do cargo: gravados, mas nenhum cenário os usará. */
  avisos: string[];
}

/**
 * O que o import de cargos faz com cada linha. Cargo novo entra inteiro. Cargo que já existe
 * só ganha os casos reais e as fronteiras que a planilha trouxer: é assim que o gestor devolve a
 * planilha preenchida (plano, 3.2). O resto da ficha de um cargo existente não é tocado pela
 * planilha, como sempre foi. Nome repetido dentro da planilha vale a primeira linha.
 *
 * "Já existe" é pela régua ÚNICA de casamento de cargo (`mapaDeCargos` / `idDoCargo`: o nome
 * exato vence, o normalizado cobre caixa, acento e espaços), a mesma com que a ficha é lida.
 * Planilha devolvida sem acento ("MANUTENCAO") casava só por caixa e virava um cargo NOVO com os
 * casos, que a ficha nunca leria (ela fica com o cargo original, de menor id).
 */
export function planoDoImportDeCargos(
  existentes: Array<{ id: string; nome: string | null; top5_workshop?: unknown }>,
  linhas: Array<Record<string, any>>,
): PlanoDoImportDeCargos {
  const indice = mapaDeCargos((existentes || []).map((c) => ({ id: c.id, nome: c.nome })));
  const porId = new Map((existentes || []).map((c) => [String(c.id), c]));
  const vistos = new Set<string>();
  const plano: PlanoDoImportDeCargos = { novos: [], atualizar: [], ignorados: 0, avisos: [] };
  for (const c of linhas || []) {
    const nome = String(c?.nome ?? '').trim();
    if (!nome || vistos.has(chaveCargo(nome))) continue;
    vistos.add(chaveCargo(nome));
    const fronteiras = String(c.fronteiras ?? '').trim();
    const idExistente = idDoCargo(indice, nome);
    const existente = idExistente ? porId.get(idExistente) : undefined;
    // Caso sem "Competência N" na planilha herda a competência N do Top 5 do cargo, pela COLUNA
    // (não pela posição depois de tirar os vazios). Competência fora do Top 5 vira aviso.
    const top5 = (Array.isArray(existente?.top5_workshop) ? existente.top5_workshop : []).map((n: unknown) => String(n ?? '').trim());
    const brutos = (Array.isArray(c.casos_reais) ? c.casos_reais : []).map((caso: any) => {
      if (!caso || typeof caso !== 'object' || caso.competencia || !caso.coluna) return caso;
      const doTop5 = top5[Number(caso.coluna) - 1];
      return doTop5 ? { ...caso, competencia: doTop5 } : caso;
    });
    const casos = casosReaisParaGravar(brutos);
    if (casos && top5.length) {
      for (const caso of casos) {
        if (caso.competencia && !top5.some((n) => chaveComp(n) === chaveComp(caso.competencia))) {
          plano.avisos.push(`${existente?.nome || nome}: a competência "${caso.competencia}" não está no Top 5 do cargo; o caso foi gravado, mas nenhum cenário o usará`);
        }
      }
    }
    if (existente) {
      const campos: { fronteiras?: string; casos_reais?: CasoGravado[] } = {};
      if (fronteiras) campos.fronteiras = fronteiras;
      if (casos) campos.casos_reais = casos;
      if (Object.keys(campos).length) plano.atualizar.push({ id: existente.id, nome: existente.nome || nome, campos });
      else plano.ignorados++;
      continue;
    }
    plano.novos.push({
      nome,
      area_depto: c.area_depto?.trim() || null,
      descricao: c.descricao?.trim() || null,
      principais_entregas: c.principais_entregas?.trim() || null,
      stakeholders: c.stakeholders?.trim() || null,
      decisoes_recorrentes: c.decisoes_recorrentes?.trim() || null,
      tensoes_comuns: c.tensoes_comuns?.trim() || null,
      contexto_cultural: c.contexto_cultural?.trim() || null,
      // Só é líder o marcado como sim ("sim", "Sim", "SIM"...); em branco é não-líder.
      eh_lideranca: liderancaDaPlanilha(c.eh_lideranca),
      fronteiras: fronteiras || null,
      casos_reais: casos,
    });
  }
  return plano;
}

const SIM = new Set(['sim', 's', 'x', 'yes', 'y', 'si', 'true', '1']);

/**
 * "Cargo de liderança?" da planilha: só é líder o que a planilha marca como
 * sim, em qualquer caixa e com ou sem acento. Em branco, "não" ou qualquer
 * outra coisa é NÃO-líder (decisão do dono, 25/09/2026). O formulário do cargo
 * continua abrindo marcado como líder: lá a pessoa vê a caixa, aqui não.
 * Até 25/09/2026 "Sim" com maiúscula também virava não-líder; e o fit tira o
 * bloco de liderança do cargo não-líder (actions/fit-v2.ts).
 */
export function liderancaDaPlanilha(valor: unknown): boolean {
  if (typeof valor === 'boolean') return valor;
  return SIM.has(chaveSemAcento(valor));
}
