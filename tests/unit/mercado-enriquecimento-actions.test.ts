import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';

/**
 * As três actions do enriquecimento (planejar, enriquecer um lote, bloquear um e-mail) são ENDPOINTS HTTP:
 * o gate vale para cada uma, e nenhuma grava nome ou e-mail na auditoria. Banco em memória; a busca web e a
 * leitura de página são mocks nas bordas (nada de rede, nada de modelo).
 */

let emailAtual = 'rodrigo@vertho.ai';
let permissaoNegada = false;
const permissoesPedidas: Array<string | undefined> = [];
const auditoria = vi.fn(async (..._a: any[]) => true);
const buscaWeb = vi.fn();
const paginaPublica = vi.fn();

vi.mock('@/lib/auth/action-context', () => ({
  requireAdminAction: vi.fn(async (permissao?: string) => {
    permissoesPedidas.push(permissao);
    if (permissaoNegada) throw new Error('FORBIDDEN');
    return { email: emailAtual, isPlatformAdmin: true };
  }),
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: (...a: any[]) => auditoria(...a) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));
vi.mock('@/actions/ai-client', () => ({ callOpenAIWebSearch: (...a: any[]) => buscaWeb(...a) }));
vi.mock('@/lib/fetch-texto-publico', () => ({ fetchTextoPublico: (...a: any[]) => paginaPublica(...a) }));

import { enriquecerLote, planejarEnriquecimento, suprimirContato } from '@/app/admin/vertho/mercado-potencial/actions';

const FONTE = 'https://www.colegioexemplo.com.br/contato';
const RESPOSTA_DA_BUSCA = {
  escola_identificada: 'Colégio Exemplo', site_oficial: 'https://www.colegioexemplo.com.br', site_confere_com_endereco: true,
  telefones: [{ numero: '(19) 3251-0000', rotulo: 'Secretaria', fonte_url: FONTE }], emails: [{ endereco: 'secretaria@colegioexemplo.com.br', rotulo: 'Secretaria', fonte_url: FONTE }],
  whatsapp: [], responsaveis: [{ nome: 'Maria Lima', cargo: 'Diretora Geral', fonte_url: FONTE }], observacoes: '',
};

let escolas: any[];
let contatos: any[];
let sb = criarSupabaseMock();
const valorDoIn = (cadeia: Chamada[]): string[] => (cadeia.find((c) => c.metodo === 'in')?.args[1] as string[]) ?? [];

function novoBanco(n = 3) {
  escolas = Array.from({ length: n }, (_, i) => ({
    municipio_ibge: '3509502', municipio: 'Campinas', uf: 'SP', rede: 'PRIVADA', codigo_inep: String(35000000 + i), nome: `Escola ${i}`,
    qt_escolas: 1, qt_professores: 10 + i, qt_doc_0_24: 1, qt_docs_0_24: 1, qt_docs_jovens: 2, qt_docs_pos: 3, qt_coord_pedag: 1, qt_diretor_proxy: 1,
    inse_medio: 4, inse_efetivo: 4, inse_grupo: 4,
  }));
  contatos = [];
  sb = criarSupabaseMock({
    lista: (tabela, _c, cadeia) => {
      if (tabela === 'diag_mv_mercado_escola') {
        const ids = valorDoIn(cadeia);
        if (ids.length) return escolas.filter((e) => ids.includes(e.codigo_inep));
        // Como o PostgREST: a página pedida (`range`) e nada além dela.
        const faixa = cadeia.find((c) => c.metodo === 'range');
        return faixa ? escolas.slice(faixa.args[0], faixa.args[1] + 1) : escolas;
      }
      if (tabela === 'diag_censo_infra') return valorDoIn(cadeia).map((codigo_inep) => ({ codigo_inep, endereco: 'Rua A, 10', bairro: 'Centro', cep: '13000000' }));
      if (tabela === 'mercado_escola_contatos') { const ids = valorDoIn(cadeia); return ids.length ? contatos.filter((l) => ids.includes(l.codigo_inep)) : contatos; }
      return [];
    },
    contagem: (tabela) => (tabela === 'mercado_escola_contatos' ? 0 : escolas.length),
  });
}

beforeEach(() => {
  emailAtual = 'rodrigo@vertho.ai'; permissaoNegada = false; permissoesPedidas.length = 0;
  auditoria.mockClear(); buscaWeb.mockReset(); paginaPublica.mockReset();
  vi.stubEnv('HUNTER_API', '');
  buscaWeb.mockResolvedValue({ text: JSON.stringify(RESPOSTA_DA_BUSCA) });
  paginaPublica.mockResolvedValue({ texto: '<p>Diretora Geral Maria Lima. Telefone (19) 3251-0000. secretaria@colegioexemplo.com.br</p>', urlFinal: FONTE });
  novoBanco();
});

describe('gate: exports.run + conta da equipe vertho.ai, em CADA action', () => {
  it('outro domínio (ou persona de demo) é recusado antes de tocar no banco, na busca ou na auditoria', async () => {
    for (const email of ['alguem@escola.com.br', 'socio@gmail.com', 'maria.demo@vertho.ai']) {
      emailAtual = email; sb.reset();
      const r1 = await planejarEnriquecimento({});
      const r2 = await enriquecerLote(['35000000']);
      const r3 = await suprimirContato('x@y.com', 'pediu');
      for (const r of [r1, r2, r3]) expect(r.ok, email).toBe(false);
      expect(sb.chamadas, email).toHaveLength(0);
    }
    expect(buscaWeb).not.toHaveBeenCalled();
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('sem a permissão a action responde erro (não lança) e pede exports.run', async () => {
    permissaoNegada = true;
    for (const r of [await planejarEnriquecimento({}), await enriquecerLote(['35000000']), await suprimirContato('x@y.com')]) {
      expect(r.ok).toBe(false);
    }
    expect(permissoesPedidas.filter((p) => p === 'exports.run').length).toBeGreaterThanOrEqual(3);
    expect(sb.chamadas).toHaveLength(0);
  });
});

describe('enriquecerLote (action)', () => {
  it('mais de 5 escolas, INEP inválido ou lista vazia: erro, sem busca e sem auditoria', async () => {
    for (const x of [Array.from({ length: 6 }, (_, i) => `3500000${i}`), ['abc'], [], null as any]) {
      const r = await enriquecerLote(x);
      expect(r.ok).toBe(false);
    }
    expect(buscaWeb).not.toHaveBeenCalled();
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('enriquece, grava e audita só INEPs e contagens (nada de nome, e-mail ou telefone)', async () => {
    const r: any = await enriquecerLote(['35000000', '35000001']);
    expect(r.ok).toBe(true);
    expect(r.resultados.map((x: any) => x.ok)).toEqual([true, true]);
    expect(buscaWeb).toHaveBeenCalledTimes(2);
    expect(buscaWeb.mock.calls[0][2]).toMatchObject({ taskKey: 'mercado_enriquecimento_contatos' });
    expect(sb.escritas.filter((e) => e.tabela === 'mercado_escola_contatos' && e.op === 'upsert')).toHaveLength(2);

    expect(auditoria).toHaveBeenCalledTimes(1);
    const arg = auditoria.mock.calls[0][0];
    expect(arg).toMatchObject({ adminEmail: 'rodrigo@vertho.ai', acao: 'mercado.enriquecer', alvo: '2 escolas' });
    expect(arg.detalhes).toMatchObject({ escolas: ['35000000', '35000001'], buscas: 2, erros: 0, adiadas: 0 });
    expect(JSON.stringify(arg)).not.toMatch(/Maria Lima|colegioexemplo|3251/);
  });

  it('sem HUNTER_API a escola grava com o Hunter "indisponivel" e a busca web fica', async () => {
    const r: any = await enriquecerLote(['35000000']);
    expect(r.hunterConfigurado).toBe(false);
    expect(r.resultados[0]).toMatchObject({ ok: true, hunter_status: 'indisponivel', nivel: 'A' });
  });

  it('erro do núcleo (leitura do banco) volta como erro e NÃO audita um lote que não rodou', async () => {
    sb.falharEm({ tabela: 'mercado_contatos_supressao', op: 'select', mensagem: 'caiu' });
    const r = await enriquecerLote(['35000000']);
    expect(r.ok).toBe(false);
    expect(auditoria).not.toHaveBeenCalled();
    expect(buscaWeb).not.toHaveBeenCalled();
  });
});

describe('planejarEnriquecimento (action)', () => {
  it('lê o filtro INTEIRO, ordena como a tela e devolve o plano sem gastar nada', async () => {
    novoBanco(5);
    const r: any = await planejarEnriquecimento({ orderBy: 'qt_professores', orderDir: 'desc' });
    expect(r.ok).toBe(true);
    expect(r.plano.codigos).toEqual(['35000004', '35000003', '35000002', '35000001', '35000000']);
    expect(r.plano).toMatchObject({ aEnriquecer: 5, prontas: 0, buscasNovas: 5, custoBuscaUsd: 0.45, hunterConfigurado: false });
    expect(buscaWeb).not.toHaveBeenCalled();
    expect(sb.escritas.filter((e) => e.tabela === 'mercado_escola_contatos' && e.op === 'upsert')).toHaveLength(0);
  });

  it('com mais de 200 escolas lê o filtro INTEIRO antes de ordenar: a rodada traz as 200 do TOPO da tela, não as 200 primeiras por INEP', async () => {
    novoBanco(300);
    const r: any = await planejarEnriquecimento({ orderBy: 'qt_professores', orderDir: 'desc' });
    expect(r.ok).toBe(true);
    expect(r.plano.codigos).toHaveLength(200);
    expect(r.plano.codigos[0]).toBe('35000299');
    expect(r.plano.codigos[199]).toBe('35000100');
    expect(r.plano.paraDepois).toBe(100);
    expect(r.plano.lidas).toBe(300);
  });

  it('filtro sem escola devolve erro claro', async () => {
    novoBanco(0);
    const r = await planejarEnriquecimento({});
    expect(r.ok).toBe(false);
  });
});

describe('suprimirContato (action)', () => {
  it('bloqueia o e-mail, tira a pessoa das linhas e audita SEM o e-mail', async () => {
    contatos = [{ codigo_inep: '35000000', responsaveis: [{ nome: 'Quem Saiu', cargo: 'Diretor', email: 'saiu@colegioexemplo.com.br' }] }];
    const r: any = await suprimirContato('saiu@colegioexemplo.com.br', 'pediu para sair');
    expect(r).toEqual({ ok: true, escolas: 1 });
    expect(sb.escritas.find((e) => e.tabela === 'mercado_contatos_supressao')!.payload).toMatchObject({ email: 'saiu@colegioexemplo.com.br', criado_por: 'rodrigo@vertho.ai' });
    const arg = auditoria.mock.calls[0][0];
    expect(arg).toMatchObject({ acao: 'mercado.suprimir', alvo: 'e-mail bloqueado', detalhes: { escolas: 1 } });
    expect(JSON.stringify(arg)).not.toMatch(/saiu@|Quem Saiu|pediu para sair/);
  });

  it('e-mail inválido é recusado e não audita', async () => {
    const r = await suprimirContato('isto-nao-e-email');
    expect(r.ok).toBe(false);
    expect(auditoria).not.toHaveBeenCalled();
    expect(sb.escritas).toHaveLength(0);
  });
});
