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

/** Casos reais por cargo na planilha: colunas "Caso real 1" a "Caso real 8" (ou "Caso 1"...). */
export const MAX_CASOS_DA_PLANILHA = 8;
for (let n = 1; n <= MAX_CASOS_DA_PLANILHA; n++) {
  COLUNA_DO_TITULO[`caso real ${n}`] = `caso_real_${n}`;
  COLUNA_DO_TITULO[`caso ${n}`] = `caso_real_${n}`;
}

export function colunasDoCargo(linhas: Record<string, string>[]): Record<string, string>[] {
  return traduzirTitulos(linhas, COLUNA_DO_TITULO);
}

/** Teto de um caso GRAVADO (o prompt corta mais curto): protege o banco de colagem acidental. */
export const MAX_CARACTERES_CASO_GRAVADO = 4000;

/**
 * Casos reais no formato gravado em `cargos_empresa.casos_reais` (`[{ texto }]`), a partir do
 * que vier (planilha, formulário ou o próprio valor gravado): só texto não vazio, na ordem, no
 * máximo `MAX_CASOS_DA_PLANILHA`. `null` quando não sobra nenhum: a coluna fica vazia, não `[]`.
 */
export function casosReaisParaGravar(valor: unknown): { texto: string }[] | null {
  const lista = Array.isArray(valor) ? valor : [];
  const textos = lista
    .map((c) => (typeof c === 'string' ? c : c && typeof c === 'object' ? (c as Record<string, unknown>).texto : ''))
    .map((t) => String(t ?? '').trim().slice(0, MAX_CARACTERES_CASO_GRAVADO))
    .filter(Boolean)
    .slice(0, MAX_CASOS_DA_PLANILHA);
  return textos.length ? textos.map((texto) => ({ texto })) : null;
}

/**
 * As colunas da mig 286 no "Salvar cargo": só entram no registro se vieram no pedido. Quem
 * salva sem elas (outra tela, cliente antigo em cache) não zera o que o gestor preencheu.
 */
export function camposNovosDoCargo(cargo: { fronteiras?: string | null; casos_reais?: unknown }): {
  fronteiras?: string | null; casos_reais?: { texto: string }[] | null;
} {
  return {
    ...(cargo.fronteiras !== undefined ? { fronteiras: cargo.fronteiras?.trim() || null } : {}),
    ...(cargo.casos_reais !== undefined ? { casos_reais: casosReaisParaGravar(cargo.casos_reais) } : {}),
  };
}

/** Os casos de UMA linha da planilha (já com `colunasDoCargo`), na ordem das colunas 1 a 8. */
export function casosReaisDaLinha(linha: Record<string, unknown>): { texto: string }[] | null {
  const textos: unknown[] = [];
  for (let n = 1; n <= MAX_CASOS_DA_PLANILHA; n++) textos.push(linha?.[`caso_real_${n}`]);
  return casosReaisParaGravar(textos);
}

/**
 * Os campos de caso no formulário: os que existem e mais um em branco no fim, até o máximo.
 * O texto vai CRU (sem aparar): a pessoa está digitando, e aparar a cada tecla comeria o
 * espaço entre as palavras. Quem limpa é `casosReaisParaGravar`, ao salvar.
 */
export function slotsDosCasos(valor: unknown): string[] {
  const lista = Array.isArray(valor) ? valor : [];
  const textos = lista
    .map((c) => (typeof c === 'string' ? c : c && typeof c === 'object' ? String((c as Record<string, unknown>).texto ?? '') : ''))
    .slice(0, MAX_CASOS_DA_PLANILHA);
  while (textos.length && !textos[textos.length - 1].trim()) textos.pop();
  return textos.length < MAX_CASOS_DA_PLANILHA ? [...textos, ''] : textos;
}

/** Troca o caso `i` do formulário (o vazio some ao salvar, por `casosReaisParaGravar`). */
export function comCasoTrocado(valor: unknown, i: number, texto: string): { texto: string }[] {
  const atuais = slotsDosCasos(valor);
  atuais[i] = texto;
  return atuais.map((t) => ({ texto: t }));
}

export interface PlanoDoImportDeCargos {
  /** Cargos novos, já no formato da tabela (sem `empresa_id`, que o servidor põe). */
  novos: Record<string, any>[];
  /** Cargos que já existem: só os casos reais e as fronteiras vindos da planilha. */
  atualizar: { id: string; nome: string; campos: { fronteiras?: string; casos_reais?: { texto: string }[] } }[];
  /** Linhas de cargo já existente sem caso nem fronteira: nada a fazer. */
  ignorados: number;
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
  existentes: Array<{ id: string; nome: string | null }>,
  linhas: Array<Record<string, any>>,
): PlanoDoImportDeCargos {
  const indice = mapaDeCargos((existentes || []).map((c) => ({ id: c.id, nome: c.nome })));
  const porId = new Map((existentes || []).map((c) => [String(c.id), c]));
  const vistos = new Set<string>();
  const plano: PlanoDoImportDeCargos = { novos: [], atualizar: [], ignorados: 0 };
  for (const c of linhas || []) {
    const nome = String(c?.nome ?? '').trim();
    if (!nome || vistos.has(chaveCargo(nome))) continue;
    vistos.add(chaveCargo(nome));
    const fronteiras = String(c.fronteiras ?? '').trim();
    const casos = casosReaisParaGravar(c.casos_reais);
    const idExistente = idDoCargo(indice, nome);
    const existente = idExistente ? porId.get(idExistente) : undefined;
    if (existente) {
      const campos: { fronteiras?: string; casos_reais?: { texto: string }[] } = {};
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
