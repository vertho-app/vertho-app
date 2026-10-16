import { REGIOES_METROPOLITANAS } from '@/lib/mercado-potencial/regioes-metropolitanas';

/**
 * Planilha de exportação do Mercado Potencial: o TEMPLATE FIXO.
 *
 * Três abas: `Base` (uma linha por escola, rede ou município, na visão da tela),
 * `Resumo` (filtros, quem exportou, totais e corte) e `Leia-me` (como ler as colunas).
 * As colunas abaixo são o contrato do arquivo: quem monta macro ou tabela dinâmica em
 * cima dele depende da ordem e do título. Mudar uma delas é mudar o contrato; o teste
 * `mercado-potencial-exportar-xlsx.test.ts` trava a lista de propósito.
 *
 * Função pura (sem banco, sem sessão): a action carrega as linhas e chama aqui.
 */

export type VisaoMercado = 'municipio' | 'rede' | 'escola';

export const ROTULO_VISAO: Record<VisaoMercado, string> = { municipio: 'Município', rede: 'Rede', escola: 'Escola' };

/**
 * Teto de linhas por exportação. O arquivo volta numa resposta de action (base64, ~33% maior)
 * e a resposta tem teto na Vercel (~4,5 MB); com 10.000 linhas o arquivo fica bem abaixo disso.
 */
export const LIMITE_EXPORTACAO = 10_000;

/** Acima disto (bytes do .xlsx) a resposta em base64 passaria do teto: recusa em vez de falhar no meio. */
export const TAMANHO_MAXIMO_BYTES = 3_000_000;

/** Só o que a aba Resumo descreve dos filtros (a `MercadoFilters` da action cabe aqui por estrutura). */
export interface FiltrosParaPlanilha {
  uf?: string[];
  regioesMetropolitanas?: string[];
  redes?: string[];
  municipioBusca?: string;
  inseMin?: number;
  inseMax?: number;
  professoresMin?: number;
  gestoresMin?: number;
  precoProf?: number;
  precoGestor?: number;
  idadeOnboarding?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

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
const temContato = (r: any): boolean => {
  const c = r?.contato as ContatoEnriquecido | undefined;
  return !!c && !!(c.site || lista(c.telefones) || lista(c.emails) || (c.responsaveis ?? []).some((p) => p?.nome || p?.email));
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

const ORDEM_ROTULO: Record<string, string> = {
  score_completo: 'Score', nome: 'Nome', rede: 'Rede', uf: 'UF', qt_escolas: 'Escolas', qt_professores_onboarding: 'Profs jovens',
  qt_professores: 'Professores', qt_gestores: 'Gestores', pct_jovens: '% jovens', pct_sem_pos: '% sem pós', inse_medio: 'INSE',
  tam_mensal_mentor_ia: 'TAM Mentor IA', tam_mensal_onboarding: 'TAM Onboarding', fit_pedagogico: 'Fit pedagógico',
};

export interface OpcoesPlanilha {
  visao: VisaoMercado;
  linhas: any[];
  filtros: FiltrosParaPlanilha;
  exportadoPor: string;
  geradoEm: Date;
  /** Linhas que existem no banco para estes filtros (count exato); null se não veio. */
  totalNoBanco: number | null;
  /** O teto da exportação cortou linhas. */
  truncado: boolean;
  limiteExportacao: number;
}

/** "16/10/2026 08:15" no fuso de Brasília, nunca o do servidor (UTC). */
export function dataBRT(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

/** Linhas "Filtro: valor" para a aba Resumo; só aparece o que foi usado. */
export function descreverFiltros(f: FiltrosParaPlanilha): Array<[string, string]> {
  const nomeRegiao = (id: string) => REGIOES_METROPOLITANAS.find((r) => r.id === id)?.nome ?? id;
  const out: Array<[string, string]> = [];
  if (f.uf?.length) out.push(['UF', f.uf.join(', ')]);
  if (f.regioesMetropolitanas?.length) out.push(['Região metropolitana', f.regioesMetropolitanas.map(nomeRegiao).join('; ')]);
  if (f.redes?.length) out.push(['Rede administrativa', f.redes.join(', ')]);
  if (f.municipioBusca?.trim()) out.push(['Cidades (busca por nome)', f.municipioBusca.trim()]);
  if (f.inseMin != null) out.push(['INSE mínimo', String(f.inseMin)]);
  if (f.inseMax != null) out.push(['INSE máximo', String(f.inseMax)]);
  if (f.professoresMin != null && f.professoresMin > 0) out.push(['Nº de professores (≥)', String(f.professoresMin)]);
  if (f.gestoresMin != null && f.gestoresMin > 0) out.push(['Nº de gestores (≥)', String(f.gestoresMin)]);
  out.push(['Idade-corte do onboarding', `até ${f.idadeOnboarding ?? 29} anos`]);
  out.push(['R$ por professor por mês', String(f.precoProf ?? 100)]);
  out.push(['R$ por gestor por mês', String(f.precoGestor ?? 100)]);
  const col = ORDEM_ROTULO[f.orderBy || 'score_completo'] ?? f.orderBy ?? 'Score';
  out.push(['Ordenado por', `${col} (${(f.orderDir || 'desc') === 'desc' ? 'maior para menor' : 'menor para maior'})`]);
  if (!out.some(([k]) => ['UF', 'Região metropolitana', 'Rede administrativa', 'Cidades (busca por nome)'].includes(k))) {
    out.unshift(['Recorte', 'sem filtro de UF, região, rede ou cidade']);
  }
  return out;
}

const LEIA_ME: Array<[string, string]> = [
  ['O que é', 'Base do Mercado Potencial da vertho.ai exportada com os filtros da tela, na visão indicada na aba Resumo. Fonte: Censo Escolar do INEP (docentes e infraestrutura) e INSE. Uso interno.'],
  ['Professores', 'Total de docentes da educação básica da linha.'],
  ['Profs jovens', 'Docentes até a idade-corte do onboarding (24 ou 29 anos, ver Resumo). É a base do TAM Onboarding.'],
  ['Gestores', 'Escola: coordenadores pedagógicos mais um diretor por escola. Município e rede: a soma das escolas.'],
  ['% jovens e % sem pós', 'Parte dos professores até a idade-corte e parte sem pós-graduação.'],
  ['INSE', 'Nível socioeconômico de 1 (baixo) a 6 (alto). "INSE inferido? sim" é estimativa feita a partir do Censo, para escolas privadas sem INSE oficial.'],
  ['TAM Mentor IA/mês', 'Professores x R$ por professor + gestores x R$ por gestor (valores no Resumo).'],
  ['TAM Onboarding/mês', 'Profs jovens x R$ por professor + gestores x R$ por gestor.'],
  ['Fit pedagógico', 'Quanto maior a parte de jovens e de professores sem pós, maior o encaixe. Vai de 40% a 100%.'],
  ['Score', 'TAM Mentor IA x fit pedagógico x fit financeiro (o fit financeiro depende do INSE e da rede). Serve para ordenar, não é um valor em reais.'],
  ['Região metropolitana', 'Composição do IBGE (regiões metropolitanas e RIDEs). Um município fora de qualquer uma fica em branco.'],
  ['Corte de linhas', 'Quando o Resumo diz que a exportação foi cortada, os totais somam só as linhas exportadas. Refine os filtros para ver o resto.'],
  ['Contato institucional', 'Site, telefones e e-mails institucionais (secretaria, direção, matrícula) confirmados na página oficial da escola. Em branco quer dizer que a escola ainda não foi enriquecida. Só existe na visão Escola.'],
  ['Responsável', 'Nome, cargo e e-mail de quem a escola publica como direção, coordenação ou mantenedora. Com mais de um responsável, vai um por linha dentro da célula, na mesma ordem nas três colunas ("-" quando falta o dado).'],
  ['Dados pessoais', 'As colunas de números não têm dado pessoal. As colunas de Responsável, quando preenchidas, têm nome, cargo e e-mail de pessoas: uso restrito à equipe vertho.ai, com a origem e a data da coleta guardadas. Quem pedir para não ser contatado sai da base.'],
];

export async function montarPlanilhaMercado(op: OpcoesPlanilha): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'vertho.ai';
  wb.created = op.geradoEm;

  // ---- Base ----
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

  // ---- Resumo ----
  const rs = wb.addWorksheet('Resumo');
  const soma = (f: (r: any) => number | null) => op.linhas.reduce((a, r) => a + (f(r) ?? 0), 0);
  const idxProf = COLUNAS_BASE.findIndex((c) => c.titulo === 'Professores');
  const idxGest = COLUNAS_BASE.findIndex((c) => c.titulo === 'Gestores');
  const idxMentor = COLUNAS_BASE.findIndex((c) => c.titulo === 'TAM Mentor IA/mês (R$)');
  const idxOnb = COLUNAS_BASE.findIndex((c) => c.titulo === 'TAM Onboarding/mês (R$)');
  const total = (i: number) => soma((r) => num(COLUNAS_BASE[i].valor(r, op.visao)));
  const brl = (x: number) => `R$ ${Math.round(x).toLocaleString('pt-BR')}`;
  const info: Array<[string, string]> = [
    ['Mercado Potencial, exportação', ''],
    ['Visão', ROTULO_VISAO[op.visao]],
    ['Gerado em (horário de Brasília)', dataBRT(op.geradoEm)],
    ['Exportado por', op.exportadoPor],
    ['', ''],
    ['Filtros aplicados', ''],
    ...descreverFiltros(op.filtros),
    ['', ''],
    ['Linhas exportadas', op.linhas.length.toLocaleString('pt-BR')],
    ['Com contato enriquecido', `${op.linhas.filter(temContato).length.toLocaleString('pt-BR')} de ${op.linhas.length.toLocaleString('pt-BR')}`],
    ['Linhas no banco para estes filtros', op.totalNoBanco == null ? 'não informado' : op.totalNoBanco.toLocaleString('pt-BR')],
    ['Corte', op.truncado
      ? `SIM. A exportação vai até ${op.limiteExportacao.toLocaleString('pt-BR')} linhas; os totais abaixo somam só as linhas exportadas.`
      : 'não'],
    ['', ''],
    ['Totais das linhas exportadas', ''],
    ['Professores', total(idxProf).toLocaleString('pt-BR')],
    ['Gestores', total(idxGest).toLocaleString('pt-BR')],
    ['TAM Mentor IA por mês', brl(total(idxMentor))],
    ['TAM Onboarding por mês', brl(total(idxOnb))],
  ];
  for (const [a, b] of info) rs.addRow([a, b]);
  rs.getColumn(1).width = 38;
  rs.getColumn(2).width = 90;
  rs.getRow(1).font = { bold: true, size: 14 };
  rs.eachRow((row, i) => {
    row.getCell(1).font = { bold: true, size: i === 1 ? 14 : 11 };
    row.eachCell((c) => { c.alignment = { wrapText: true, vertical: 'top' }; });
  });

  // ---- Leia-me ----
  const lm = wb.addWorksheet('Leia-me');
  lm.addRow(['Como ler esta planilha', '']);
  for (const [a, b] of LEIA_ME) lm.addRow([a, b]);
  lm.getColumn(1).width = 26;
  lm.getColumn(2).width = 110;
  lm.getRow(1).font = { bold: true, size: 14 };
  lm.eachRow((row, i) => {
    if (i > 1) row.getCell(1).font = { bold: true };
    row.eachCell((c) => { c.alignment = { wrapText: true, vertical: 'top' }; });
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
