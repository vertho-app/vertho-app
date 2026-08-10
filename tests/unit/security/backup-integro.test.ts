import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F14 da auditoria de 09-10/08/2026 — dois defeitos independentes no backup:
 *
 *  1. `select('*')` sem paginação. O PostgREST corta em 1000 linhas e o `limit`
 *     explícito NÃO passa disso (medido contra este projeto: limit=5000,
 *     limit=100000 e sem limit devolveram 1000 nas três). `totalLinhas` somava o
 *     truncado, então a mensagem de sucesso reportava o número errado.
 *     `competencias` estava em 935 com +237/30d — cruzaria o teto em ~7 dias.
 *  2. Tabela que falhava virava `console.warn` + `continue`: sumia do dump e o
 *     backup seguia reportando sucesso. Não era hipótese — a lista pedia
 *     `preferencias_aprendizagem`, que não existe no banco.
 *
 * O mock aqui IMITA O CAP de propósito: um mock que devolve tudo de uma vez faz
 * o teste passar tanto na versão certa quanto na quebrada. Ele também produz
 * `error` não-nulo quando pedido — 34 de 38 mocks do repo hardcodam `error: null`
 * e por isso não conseguem exercitar o ramo de falha.
 */

const CAP = 1000;

// 2500 linhas: 3 páginas (1000 + 1000 + 500). Trunca em 1000 sem paginação.
const GRANDE = Array.from({ length: 2500 }, (_, i) => ({ id: `id-${String(i).padStart(5, '0')}`, v: i }));

let tabelas: Record<string, any[]> = {};
let erroDe: Record<string, string> = {};
let ordenacoes: string[] = [];

const { uploadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async (_path: string, _buf: Buffer, _opts?: any) => ({ error: null })),
}));

function makeClient() {
  const from = (tabela: string) => {
    const st: any = { head: false, range: null };
    const b: any = {
      select: (_cols: string, opts?: any) => { st.head = Boolean(opts?.head); st.count = opts?.count; return b; },
      order: (col: string) => { ordenacoes.push(`${tabela}.${col}`); return b; },
      range: (de: number, ate: number) => { st.range = [de, ate]; return b; },
      eq: () => b, in: () => b,
      then: undefined,
    };
    // head:true → só o count
    b.then = (resolve: any) => {
      const err = erroDe[tabela];
      if (err) return resolve({ data: null, error: { message: err }, count: null });
      const linhas = tabelas[tabela];
      if (!linhas) return resolve({ data: null, error: { message: `relation "${tabela}" does not exist` }, count: null });
      if (st.head) return resolve({ data: null, error: null, count: linhas.length });
      const [de, ate] = st.range ?? [0, CAP - 1];
      // O CAP é do servidor: mesmo pedindo mais, ele nunca devolve além disso.
      const fim = Math.min(ate, de + CAP - 1);
      return resolve({ data: linhas.slice(de, fim + 1), error: null, count: null });
    };
    return b;
  };
  return {
    from,
    storage: {
      from: () => ({
        upload: uploadMock,
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  };
}

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => makeClient() }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminOrCronAction: async () => ({ email: 'cron' }) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => makeClient() }));

import { executarBackupDiario } from '@/actions/backup';
import { gunzipSync } from 'node:zlib';

/** Todas as tabelas que a action pede, com 1 linha — o piso para "backup completo". */
function tabelasMinimas() {
  const nomes = [
    'empresas', 'colaboradores', 'cargos_empresa', 'competencias', 'competencias_base',
    'top10_cargos', 'banco_cenarios', 'respostas', 'fit_resultados', 'descriptor_assessments',
    'trilhas', 'temporada_semana_progresso', 'micro_conteudos', 'relatorios', 'evolucao',
    'evolucao_descritores', 'sessoes_avaliacao', 'reavaliacao_sessoes', 'platform_admins', 'trash',
  ];
  return Object.fromEntries(nomes.map((n) => [n, [{ id: `${n}-1` }]]));
}

const dumpEnviado = () => JSON.parse(gunzipSync(uploadMock.mock.calls[0][1] as Buffer).toString());

beforeEach(() => { tabelas = tabelasMinimas(); erroDe = {}; ordenacoes = []; uploadMock.mockClear(); });

describe('executarBackupDiario — nada some, nada trunca', () => {
  it('exporta as 2500 linhas de uma tabela grande (o cap de 1000 é do servidor)', async () => {
    tabelas.competencias = GRANDE;
    const r: any = await executarBackupDiario();

    expect(r.success).toBe(true);
    const dump = dumpEnviado();
    expect(dump.tabelas.competencias).toHaveLength(2500);
    expect(dump.manifesto.competencias).toEqual({ esperado: 2500, exportado: 2500, paginas: 3 });
    // o número reportado tem que ser o real, não o truncado
    expect(r.linhas).toBeGreaterThanOrEqual(2500);
  });

  it('pagina com ordenação estável — sem ela as páginas repetem e pulam linha', async () => {
    tabelas.competencias = GRANDE;
    await executarBackupDiario();
    expect(ordenacoes).toContain('competencias.id');
  });

  it('tabela que não existe DERRUBA o backup (era console.warn + continue)', async () => {
    delete tabelas.competencias;   // é o que acontecia com preferencias_aprendizagem
    const r: any = await executarBackupDiario();

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/INCOMPLETO/);
    expect(r.error).toMatch(/competencias/);
    expect(uploadMock).not.toHaveBeenCalled();   // não grava dump parcial
  });

  it('erro de query numa tabela também derruba, com o nome dela', async () => {
    erroDe.respostas = 'timeout no pool';
    const r: any = await executarBackupDiario();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/respostas/);
    expect(r.error).toMatch(/timeout no pool/);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('backup completo grava o manifesto de TODAS as tabelas no artefato', async () => {
    const r: any = await executarBackupDiario();
    expect(r.success).toBe(true);
    const dump = dumpEnviado();
    expect(dump.versao).toBe(2);
    expect(Object.keys(dump.manifesto).sort()).toEqual(Object.keys(tabelasMinimas()).sort());
    for (const [t, m] of Object.entries<any>(dump.manifesto)) {
      expect(m.exportado, t).toBe(m.esperado);
    }
  });
});
