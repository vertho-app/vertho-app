import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';
import {
  COLUNAS_BASE, LIMITE_EXPORTACAO, TAMANHO_MAXIMO_BYTES, dataBRT, descreverFiltros, montarPlanilhaMercado, regioesDoMunicipio,
} from '@/lib/mercado-potencial/exportar-xlsx';

/**
 * Exportação XLSX do Mercado Potencial (template FIXO).
 *
 * Provas: (1) a lista de colunas é um contrato e fica travada aqui; (2) cada visão preenche as colunas
 * certas; (3) só a equipe vertho.ai exporta, e cada exportação vai para a auditoria; (4) a exportação
 * lê a base inteira do filtro (não o "Limite" da tela) até o teto, e o arquivo cabe na resposta.
 */
const ExcelJS = async () => (await import('exceljs')).default;
async function ler(buf: Buffer) {
  const wb = new (await ExcelJS()).Workbook();
  await wb.xlsx.load(buf as any);
  return wb;
}
const textoDe = (ws: any) => {
  const out: string[] = [];
  ws.eachRow((row: any) => row.eachCell((c: any) => { if (typeof c.value === 'string') out.push(c.value); }));
  return out.join('\n');
};

const TITULOS_FIXOS = [
  'INEP', 'Nome', 'Rede', 'UF', 'Município', 'Cód. IBGE', 'Região metropolitana',
  'Escolas', 'Professores', 'Profs jovens', 'Gestores', '% jovens', '% sem pós', 'INSE', 'INSE inferido?',
  'TAM Mentor IA/mês (R$)', 'TAM Onboarding/mês (R$)', 'Fit pedagógico', 'Score',
  'Site', 'Telefones confirmados', 'E-mails institucionais', 'Responsável', 'Cargo do responsável', 'E-mail do responsável',
];

const ESCOLA = {
  id: '35112562', nome: 'NOTRE DAME DE CAMPINAS COLEGIO', uf: 'SP', rede: 'PRIVADA', municipio: 'Campinas', municipio_ibge: '3509502', codigo_inep: '35112562',
  qt_escolas: 1, qt_professores: 122, qt_professores_total: 122, qt_professores_onboarding: 15, qt_gestores: 19, pct_jovens: 0.12, pct_sem_pos: 0.8,
  inse_medio: 5, inse_fonte: 'inferido', tam_mensal_mentor_ia: 14100, tam_mensal_onboarding: 3400, fit_pedagogico: 0.68, score_completo: 8411.4,
};
const MUNICIPIO = { id: '3509502', nome: 'Campinas', uf: 'SP', qt_escolas: 735, qt_professores: 12948, qt_professores_total: 12948, qt_professores_onboarding: 1477, qt_gestores: 2095, pct_jovens: 0.11, pct_sem_pos: 0.72, inse_medio: 3.5, tam_mensal_mentor_ia: 1504300, tam_mensal_onboarding: 357200, fit_pedagogico: 0.65, score_completo: 487956 };
const REDE = { id: '3509502::PRIVADA', nome: 'Campinas — PRIVADA', uf: 'SP', rede: 'PRIVADA', municipio: 'Campinas', municipio_ibge: '3509502', qt_escolas: 318, qt_professores: 5000, qt_professores_total: 5000, qt_professores_onboarding: 600, qt_gestores: 900, pct_jovens: 0.12, pct_sem_pos: 0.5, inse_medio: 4.2, tam_mensal_mentor_ia: 650000, tam_mensal_onboarding: 150000, fit_pedagogico: 0.7, score_completo: 400000 };

const base = (over: any = {}) => ({
  visao: 'escola' as const, linhas: [ESCOLA], filtros: {}, exportadoPor: 'rodrigo@vertho.ai', geradoEm: new Date('2026-10-16T12:00:00Z'),
  totalNoBanco: 1, truncado: false, limiteExportacao: LIMITE_EXPORTACAO, ...over,
});

describe('template fixo da planilha', () => {
  it('as colunas da aba Base são um contrato: títulos e ordem travados', async () => {
    expect(COLUNAS_BASE.map((c) => c.titulo)).toEqual(TITULOS_FIXOS);
    const wb = await ler(await montarPlanilhaMercado(base()));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Base', 'Resumo', 'Leia-me']);
    const ws = wb.getWorksheet('Base')!;
    expect((ws.getRow(2).values as any[]).slice(1)).toEqual(TITULOS_FIXOS);
    expect(ws.getCell(1, 1).value).toBe('Identificação');
    expect(ws.getCell(1, 8).value).toBe('Mercado');
    expect(ws.getCell(1, 20).value).toBe('Contato institucional');
    expect(ws.getCell(1, 23).value).toBe('Responsável');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 });
  });

  it('contato: sem enriquecimento as 6 colunas saem em branco; com ele, vários valores vão um por linha e o responsável se alinha', async () => {
    const enriquecida = {
      ...ESCOLA, id: '35000001', codigo_inep: '35000001', nome: 'ESCOLA FICTICIA',
      contato: {
        site: 'https://escola-ficticia.example.br',
        telefones: ['(19) 3000-0001', null, '(19) 3000-0002'],
        emails: ['secretaria@escola-ficticia.example.br'],
        responsaveis: [{ nome: 'Fulana de Tal', cargo: 'Diretora Geral', email: 'fulana@escola-ficticia.example.br' }, { nome: 'Beltrano Souza', cargo: null, email: null }],
      },
    };
    const wb = await ler(await montarPlanilhaMercado(base({ linhas: [enriquecida, ESCOLA] })));
    const ws = wb.getWorksheet('Base')!;
    const com = (ws.getRow(3).values as any[]).slice(1);
    expect(com[19]).toBe('https://escola-ficticia.example.br');
    expect(com[20]).toBe('(19) 3000-0001\n(19) 3000-0002');
    expect(com[21]).toBe('secretaria@escola-ficticia.example.br');
    expect(com[22]).toBe('Fulana de Tal\nBeltrano Souza');
    expect(com[23]).toBe('Diretora Geral\n-');
    expect(com[24]).toBe('fulana@escola-ficticia.example.br\n-');
    const sem = (ws.getRow(4).values as any[]).slice(1);
    expect(sem.slice(19, 25).every((v) => v == null || v === '')).toBe(true);
    expect(textoDe(wb.getWorksheet('Resumo'))).toContain('1 de 2');
  });

  it('escola: preenche INEP, rede e IBGE; números ficam números (não texto) e % em fração', async () => {
    const ws = (await ler(await montarPlanilhaMercado(base()))).getWorksheet('Base')!;
    const l = (ws.getRow(3).values as any[]).slice(1);
    expect(l[0]).toBe('35112562');
    expect(l[1]).toBe('NOTRE DAME DE CAMPINAS COLEGIO');
    expect(l[2]).toBe('PRIVADA');
    expect(l[4]).toBe('Campinas');
    expect(l[5]).toBe('3509502');
    expect(l[6]).toBe('Campinas (SP)');
    expect(l[8]).toBe(122);
    expect(l[9]).toBe(15);
    expect(l[11]).toBeCloseTo(0.12);
    expect(l[14]).toBe('sim');
    expect(l[15]).toBe(14100);
    expect(ws.getCell(3, 12).numFmt).toBe('0%');
    expect(ws.getCell(3, 16).numFmt).toBe('"R$" #,##0');
  });

  it('município e rede: cada visão põe nome, município e IBGE nas colunas certas', async () => {
    const mun = (await ler(await montarPlanilhaMercado(base({ visao: 'municipio', linhas: [MUNICIPIO] })))).getWorksheet('Base')!;
    const m = (mun.getRow(3).values as any[]).slice(1);
    expect([m[0], m[1], m[2], m[4], m[5]]).toEqual([undefined, 'Campinas', undefined, 'Campinas', '3509502']);
    const red = (await ler(await montarPlanilhaMercado(base({ visao: 'rede', linhas: [REDE] })))).getWorksheet('Base')!;
    const r = (red.getRow(3).values as any[]).slice(1);
    expect([r[1], r[2], r[4], r[5]]).toEqual(['Campinas', 'PRIVADA', 'Campinas', '3509502']);
  });

  it('região metropolitana: preenche pelo IBGE e fica vazia fora de qualquer RM', () => {
    expect(regioesDoMunicipio('3509502')).toContain('Campinas (SP)');
    expect(regioesDoMunicipio('9999999')).toBe('');
    expect(regioesDoMunicipio(undefined)).toBe('');
  });

  it('Resumo traz quem exportou, filtros, corte e totais; Leia-me avisa que não há dado pessoal', async () => {
    const wb = await ler(await montarPlanilhaMercado(base({
      filtros: { uf: ['SP'], professoresMin: 50, gestoresMin: 5, redes: ['PRIVADA'], idadeOnboarding: 24, precoProf: 120 },
      totalNoBanco: 4632, truncado: true, limiteExportacao: 10000,
    })));
    const r = textoDe(wb.getWorksheet('Resumo'));
    expect(r).toContain('rodrigo@vertho.ai');
    expect(r).toContain('Nº de professores (≥)');
    expect(r).toContain('até 24 anos');
    expect(r).toContain('Corte');
    expect(r).toMatch(/SIM\./);
    expect(r).toContain('4.632');
    expect(textoDe(wb.getWorksheet('Leia-me'))).toContain('uso restrito à equipe vertho.ai');
  });

  it('dataBRT usa Brasília, não o fuso do servidor (02:30 UTC ainda é a noite anterior)', () => {
    expect(dataBRT(new Date('2026-10-16T02:30:00Z'))).toMatch(/15\/10\/2026.*23:30/);
  });

  it('sem filtro de lugar o Resumo diz "Recorte", e nenhum texto tem caractere de controle', async () => {
    expect(descreverFiltros({}).map(([k]) => k)).toContain('Recorte');
    const wb = await ler(await montarPlanilhaMercado(base()));
    for (const ws of wb.worksheets) expect(textoDe(ws), ws.name).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
  });
});

// ── a action ────────────────────────────────────────────────────────────────

let emailAtual = 'rodrigo@vertho.ai';
let permissaoNegada = false;
const permissoesPedidas: Array<string | undefined> = [];
const auditoria = vi.fn(async (..._a: any[]) => true);

vi.mock('@/lib/auth/action-context', () => ({
  requireAdminAction: vi.fn(async (permissao?: string) => {
    permissoesPedidas.push(permissao);
    if (permissaoNegada) throw new Error('FORBIDDEN');
    return { email: emailAtual, isPlatformAdmin: true };
  }),
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: (...a: any[]) => auditoria(...a) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));

const LINHAS = (n: number) => Array.from({ length: n }, (_, i) => ({
  municipio_ibge: '3509502', municipio: 'Campinas', uf: 'SP', rede: 'PRIVADA', codigo_inep: String(35000000 + i), nome: `Escola ${i}`,
  qt_escolas: 1, qt_professores: 10 + (i % 90), qt_doc_0_24: 1, qt_docs_0_24: 1, qt_docs_jovens: 2 + (i % 5), qt_docs_pos: 3,
  qt_coord_pedag: 1 + (i % 4), qt_diretor_proxy: 1, inse_medio: 4, inse_efetivo: 4, inse_grupo: 4,
}));
let banco: any[] = [];
let sb = criarSupabaseMock();
const intervalo = (cadeia: Chamada[]): [number, number] => { const r = cadeia.find((c) => c.metodo === 'range'); return r ? [r.args[0], r.args[1]] : [0, banco.length - 1]; };
function novoBanco(n: number) {
  banco = LINHAS(n);
  sb = criarSupabaseMock({
    lista: (_t, _c, cadeia) => { const [de, ate] = intervalo(cadeia); return banco.slice(de, Math.min(ate, de + 999, banco.length - 1) + 1); },
    contagem: () => banco.length,
  });
}
import { exportarMercadoXLSX } from '@/app/admin/vertho/mercado-potencial/actions';

beforeEach(() => {
  emailAtual = 'rodrigo@vertho.ai'; permissaoNegada = false; permissoesPedidas.length = 0; auditoria.mockClear(); novoBanco(3);
});

describe('exportarMercadoXLSX: gate, auditoria e leitura da base inteira', () => {
  it('só a equipe vertho.ai exporta: outro domínio recusa antes de tocar o banco e sem auditoria', async () => {
    for (const email of ['alguem@escola.com.br', 'socio@gmail.com', 'maria.demo@vertho.ai']) {
      emailAtual = email; sb.reset();
      const r = await exportarMercadoXLSX('escola', {});
      expect(r.ok, email).toBe(false);
      expect(sb.chamadas, email).toHaveLength(0);
    }
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('exige a permissão exports.run e responde erro (sem lançar) quando falta', async () => {
    permissaoNegada = true;
    const r = await exportarMercadoXLSX('escola', {});
    expect(r).toEqual({ ok: false, error: 'Sem permissão para exportar.' });
    expect(permissoesPedidas[0]).toBe('exports.run');
    expect(sb.chamadas).toHaveLength(0);
  });

  it('equipe vertho.ai: devolve o xlsx em base64 com as linhas e registra na auditoria', async () => {
    const r: any = await exportarMercadoXLSX('escola', { uf: ['SP'], professoresMin: 5 });
    expect(r.ok).toBe(true);
    expect(r.n).toBe(3);
    expect(r.nomeArquivo).toMatch(/^mercado-potencial-escola-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const ws = (await ler(Buffer.from(r.base64, 'base64'))).getWorksheet('Base')!;
    expect(ws.rowCount).toBe(2 + 3);
    expect(auditoria).toHaveBeenCalledTimes(1);
    const entrada = auditoria.mock.calls[0][0];
    expect(entrada).toMatchObject({ adminEmail: 'rodrigo@vertho.ai', acao: 'mercado.export', alvo: '3 linhas (escola)' });
    expect(entrada.detalhes).toMatchObject({ visao: 'escola', n: 3, truncado: false, filtros: { uf: ['SP'], professoresMin: 5 } });
  });

  it('ignora o "Limite" da tela: lê a base inteira do filtro, em páginas', async () => {
    novoBanco(2500);
    const r: any = await exportarMercadoXLSX('escola', { limit: 1000 });
    expect(r.n).toBe(2500);
    const ranges = sb.chamadas.filter((c) => c.metodo === 'range').map((c) => [c.args[0], c.args[1]]);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('visão inválida e filtro sem linhas viram erro, sem auditoria', async () => {
    expect(await exportarMercadoXLSX('xx' as any, {})).toMatchObject({ ok: false });
    novoBanco(0);
    expect(await exportarMercadoXLSX('escola', {})).toMatchObject({ ok: false, error: 'Nenhuma linha para exportar com estes filtros.' });
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('no teto: corta em LIMITE_EXPORTACAO, avisa o corte com o total do banco, e o arquivo cabe na resposta', async () => {
    novoBanco(LIMITE_EXPORTACAO + 500);
    const r: any = await exportarMercadoXLSX('escola', {});
    expect(r.ok).toBe(true);
    expect(r.n).toBe(LIMITE_EXPORTACAO);
    expect(r.truncado).toBe(true);
    expect(r.totalNoBanco).toBe(LIMITE_EXPORTACAO + 500);
    const bytes = Buffer.from(r.base64, 'base64');
    expect(bytes.length, 'tamanho do .xlsx no teto').toBeLessThan(TAMANHO_MAXIMO_BYTES);
    expect(r.base64.length, 'base64 abaixo do teto da resposta (~4,5 MB)').toBeLessThan(4_500_000);
    const wb = await ler(bytes);
    expect(textoDe(wb.getWorksheet('Resumo'))).toMatch(/SIM\./);
    expect(auditoria.mock.calls[0][0].detalhes).toMatchObject({ n: LIMITE_EXPORTACAO, truncado: true });
  }, 60_000);
});

describe('a tela chama a exportação', () => {
  const tela = readFileSync(join(process.cwd(), 'app/admin/vertho/mercado-potencial/page.tsx'), 'utf8');
  it('manda a visão aberta e os filtros, baixa pelo nome devolvido e desabilita sem linhas', () => {
    expect(tela).toMatch(/exportarMercadoXLSX\(tab, filtros\)/);
    expect(tela).toContain('a.download = r.nomeArquivo');
    expect(tela).toMatch(/disabled=\{exportando \|\| loading \|\| rows\.length === 0\}/);
    expect(tela).toContain("t('actions.exportXlsx')");
  });
});
