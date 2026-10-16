import { REGIOES_METROPOLITANAS } from '@/lib/mercado-potencial/regioes-metropolitanas';

/**
 * Planilha de exportação do Mercado Potencial: o TEMPLATE FIXO.
 *
 * Uma aba só, `Base`: uma linha por escola, rede ou município, na visão da tela (as abas
 * Resumo e Leia-me saíram a pedido do dono, 16/10/2026; o aviso de corte vive no toast da tela
 * e a exportação fica na auditoria). As colunas abaixo são o contrato do arquivo: quem monta
 * macro ou tabela dinâmica em cima dele depende da ordem e do título. Mudar uma delas é mudar o
 * contrato; o teste `mercado-potencial-exportar-xlsx.test.ts` trava a lista de propósito.
 *
 * Função pura (sem banco, sem sessão): a action carrega as linhas e chama aqui.
 */

export type VisaoMercado = 'municipio' | 'rede' | 'escola';

/**
 * Teto de linhas por exportação. O arquivo volta numa resposta de action (base64, ~33% maior)
 * e a resposta tem teto na Vercel (~4,5 MB); com 10.000 linhas o arquivo fica bem abaixo disso.
 */
export const LIMITE_EXPORTACAO = 10_000;

/** Acima disto (bytes do .xlsx) a resposta em base64 passaria do teto: recusa em vez de falhar no meio. */
export const TAMANHO_MAXIMO_BYTES = 3_000_000;

type Formato = 'texto' | 'inteiro' | 'pct' | 'brl' | 'decimal1';

/**
 * Contato enriquecido de uma ESCOLA (vem do enriquecimento guardado no banco; só a visão Escola tem).
 * A linha da tabela leva isto em `contato`. Sem `contato`, as colunas de contato saem em branco.
 */
export interface ContatoEnriquecido {
  site?: string | null;
  telefones?: Array<string | null | undefined> | null;
  emails?: Array<string | null | undefined> | null;
  responsaveis?: Array<{ nome?: string | null; cargo?: string | null; email?: string | null }> | null;
}

type Grupo = 'Identificação' | 'Mercado' | 'Contato institucional' | 'Responsável';

const COR_DO_GRUPO: Record<Grupo, string> = {
  'Identificação': 'FF34C5CC', 'Mercado': 'FF7C3AED', 'Contato institucional': 'FF059669', 'Responsável': 'FFD97706',
};

interface Coluna {
  grupo: Grupo;
  titulo: string;
  largura: number;
  formato: Formato;
  valor: (r: any, v: VisaoMercado) => string | number | null;
}

const REGIOES_POR_MUNICIPIO = new Map<string, string[]>();
for (const reg of REGIOES_METROPOLITANAS) {
  for (const m of reg.municipios) REGIOES_POR_MUNICIPIO.set(m, [...(REGIOES_POR_MUNICIPIO.get(m) ?? []), reg.nome]);
}

/** Região(ões) metropolitana(s) do município (RM e RIDE), por código IBGE; vazio se não pertence a nenhuma. */
export function regioesDoMunicipio(ibge: unknown): string {
  return (REGIOES_POR_MUNICIPIO.get(String(ibge ?? '')) ?? []).join('; ');
}

const num = (x: unknown): number | null => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));

/** Vários valores numa célula, um por linha; vazios saem. Sem nenhum valor, a célula fica em branco. */
const lista = (xs?: Array<string | null | undefined> | null): string | null => {
  const v = (xs ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
  return v.length ? v.join('\n') : null;
};
/** Igual, mas MANTÉM a posição de quem não tem o dado ("-"): nome, cargo e e-mail do responsável se alinham linha a linha. */
const listaAlinhada = (xs?: Array<string | null | undefined> | null): string | null => {
  const v = (xs ?? []).map((x) => String(x ?? '').trim() || '-');
  return v.length && v.some((x) => x !== '-') ? v.join('\n') : null;
};
const ibgeDe = (r: any, v: VisaoMercado) => (v === 'municipio' ? r.id : r.municipio_ibge);

export const COLUNAS_BASE: readonly Coluna[] = [
  { grupo: 'Identificação', titulo: 'INEP', largura: 11, formato: 'texto', valor: (r, v) => (v === 'escola' ? (r.codigo_inep ?? r.id ?? null) : null) },
  { grupo: 'Identificação', titulo: 'Nome', largura: 38, formato: 'texto', valor: (r, v) => (v === 'rede' ? (r.municipio ?? r.nome) : r.nome) ?? null },
  { grupo: 'Identificação', titulo: 'Rede', largura: 12, formato: 'texto', valor: (r, v) => (v === 'municipio' ? null : (r.rede ?? null)) },
  { grupo: 'Identificação', titulo: 'UF', largura: 5, formato: 'texto', valor: (r) => r.uf ?? null },
  { grupo: 'Identificação', titulo: 'Município', largura: 24, formato: 'texto', valor: (r, v) => (v === 'municipio' ? r.nome : r.municipio) ?? null },
  { grupo: 'Identificação', titulo: 'Cód. IBGE', largura: 10, formato: 'texto', valor: (r, v) => ibgeDe(r, v) ?? null },
  { grupo: 'Identificação', titulo: 'Região metropolitana', largura: 30, formato: 'texto', valor: (r, v) => regioesDoMunicipio(ibgeDe(r, v)) || null },
  { grupo: 'Mercado', titulo: 'Escolas', largura: 9, formato: 'inteiro', valor: (r) => num(r.qt_escolas) },
  { grupo: 'Mercado', titulo: 'Professores', largura: 12, formato: 'inteiro', valor: (r) => num(r.qt_professores_total ?? r.qt_professores) },
  { grupo: 'Mercado', titulo: 'Profs jovens', largura: 12, formato: 'inteiro', valor: (r) => num(r.qt_professores_onboarding ?? r.qt_jovens_efetivo) },
  { grupo: 'Mercado', titulo: 'Gestores', largura: 10, formato: 'inteiro', valor: (r) => num(r.qt_gestores) },
  { grupo: 'Mercado', titulo: '% jovens', largura: 9, formato: 'pct', valor: (r) => num(r.pct_jovens) },
  { grupo: 'Mercado', titulo: '% sem pós', largura: 10, formato: 'pct', valor: (r) => num(r.pct_sem_pos) },
  { grupo: 'Mercado', titulo: 'INSE', largura: 7, formato: 'decimal1', valor: (r) => num(r.inse_medio) },
  { grupo: 'Mercado', titulo: 'INSE inferido?', largura: 12, formato: 'texto', valor: (r) => (r.inse_fonte === 'inferido' ? 'sim' : null) },
  { grupo: 'Mercado', titulo: 'TAM Mentor IA/mês (R$)', largura: 18, formato: 'brl', valor: (r) => num(r.tam_mensal_mentor_ia) },
  { grupo: 'Mercado', titulo: 'TAM Onboarding/mês (R$)', largura: 19, formato: 'brl', valor: (r) => num(r.tam_mensal_onboarding) },
  { grupo: 'Mercado', titulo: 'Fit pedagógico', largura: 12, formato: 'pct', valor: (r) => num(r.fit_pedagogico) },
  { grupo: 'Mercado', titulo: 'Score', largura: 10, formato: 'inteiro', valor: (r) => num(r.score_completo) },
  { grupo: 'Contato institucional', titulo: 'Site', largura: 32, formato: 'texto', valor: (r) => r.contato?.site || null },
  { grupo: 'Contato institucional', titulo: 'Telefones confirmados', largura: 24, formato: 'texto', valor: (r) => lista(r.contato?.telefones) },
  { grupo: 'Contato institucional', titulo: 'E-mails institucionais', largura: 38, formato: 'texto', valor: (r) => lista(r.contato?.emails) },
  { grupo: 'Responsável', titulo: 'Responsável', largura: 30, formato: 'texto', valor: (r) => listaAlinhada((r.contato?.responsaveis ?? []).map((p: any) => p?.nome)) },
  { grupo: 'Responsável', titulo: 'Cargo do responsável', largura: 32, formato: 'texto', valor: (r) => listaAlinhada((r.contato?.responsaveis ?? []).map((p: any) => p?.cargo)) },
  { grupo: 'Responsável', titulo: 'E-mail do responsável', largura: 38, formato: 'texto', valor: (r) => listaAlinhada((r.contato?.responsaveis ?? []).map((p: any) => p?.email)) },
];

const FORMATO_EXCEL: Record<Formato, string | undefined> = {
  texto: undefined, inteiro: '#,##0', pct: '0%', brl: '"R$" #,##0', decimal1: '0.0',
};

export interface OpcoesPlanilha {
  visao: VisaoMercado;
  linhas: any[];
}

export async function montarPlanilhaMercado(op: OpcoesPlanilha): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'vertho.ai';

  const ws = wb.addWorksheet('Base');
  const n = COLUNAS_BASE.length;
  const grupos: Array<{ nome: string; de: number; ate: number }> = [];
  COLUNAS_BASE.forEach((c, i) => {
    const ult = grupos[grupos.length - 1];
    if (ult && ult.nome === c.grupo) ult.ate = i + 1;
    else grupos.push({ nome: c.grupo, de: i + 1, ate: i + 1 });
  });
  const linhaGrupo = ws.addRow(new Array(n).fill(''));
  for (const g of grupos) {
    ws.mergeCells(1, g.de, 1, g.ate);
    const cel = ws.getCell(1, g.de);
    cel.value = g.nome;
    cel.alignment = { horizontal: 'center', vertical: 'middle' };
    cel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_DO_GRUPO[g.nome as Grupo] } };
  }
  linhaGrupo.height = 20;
  const cab = ws.addRow(COLUNAS_BASE.map((c) => c.titulo));
  cab.height = 32;
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1D36' } };
    c.alignment = { wrapText: true, vertical: 'middle' };
  });
  for (const l of op.linhas) ws.addRow(COLUNAS_BASE.map((c) => c.valor(l, op.visao)));
  COLUNAS_BASE.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.largura;
    const fmt = FORMATO_EXCEL[c.formato];
    if (fmt) for (let r = 3; r <= ws.rowCount; r++) ws.getCell(r, i + 1).numFmt = fmt;
  });
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: n } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
