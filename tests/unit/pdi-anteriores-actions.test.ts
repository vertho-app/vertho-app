import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * PDIs anteriores na tela da pessoa (18/10/2026, pedido do dono na 2ª jornada de Ibipeba).
 *
 *  - o PDI ATIVO é o da jornada atual: na Temporada 2, antes do PDI novo, o da Temporada 1 não aparece como o plano de
 *    agora, e sim na lista de anteriores;
 *  - `loadPdiAnterior` e `baixarPdiAnteriorPdf` são endpoints ('use server'): a `ref` vem do cliente, então só vale se
 *    estiver na lista de anteriores DA PESSOA, recalculada no servidor (nunca um rascunho, nunca o de outra pessoa);
 *  - o histórico é mostrado inclusive com a empresa pausada (é o que a pessoa já fez).
 */
const MARCO = '2026-10-07T12:22:33Z';
const h = vi.hoisted(() => ({
  email: 'ana@acme.com' as string | null,
  colab: { id: 'c1', nome_completo: 'Ana Souza', cargo: 'Analista', empresa_id: 'emp-1', email: 'ana@acme.com' } as any,
  tabelas: {} as Record<string, any[]>,
  sysConfig: {} as any,
  renders: [] as any[],
  uploads: [] as string[],
  sb: null as any,
}));

vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: async () => h.email }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: async () => h.colab }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/pdf-marca', () => ({ resolverMarcaPdf: async () => ({ logoBase64: null, mostrarVertho: true }), nomeArquivoMarca: (v: string) => v }));
vi.mock('@/lib/pdf-locale', async (original) => ({
  ...(await original<typeof import('@/lib/pdf-locale')>()),
  idiomaDaPessoa: async () => 'pt-BR',
}));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: async (el: any) => { h.renders.push(el.props); return Buffer.from('%PDF-1.7'); } }));
vi.mock('@/components/pdf/RelatorioIndividual', () => ({ default: () => null }));
vi.mock('@/lib/demo/convidado-demo', () => ({ totalDoMapeamento: (top5: any) => (Array.isArray(top5) ? top5.length : 0) }));
vi.mock('@/lib/demo/degustacao-mapeamento', () => ({ colaboradorEmDegustacao: async () => false }));

import { baixarPdiAnteriorPdf, loadPDI, loadPdiAnterior } from '@/app/dashboard/pdi/pdi-actions';

const montar = () => {
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => (tabela === 'empresas' ? { nome: 'Acme', sys_config: h.sysConfig } : tabela === 'cargos_empresa' ? { top5_workshop: ['Comunicação'] } : null),
    lista: (tabela: string) => h.tabelas[tabela] || [],
    contagem: () => 0,
  });
  h.sb.client.storage = {
    from: () => ({
      upload: async (path: string) => { h.uploads.push(path); return { error: null }; },
      createSignedUrl: async (path: string, _s: number, o: any) => ({ data: { signedUrl: `https://storage/${path}?download=${o?.download}` }, error: null }),
    }),
  };
};

const PARTS = [
  { id: 'p1', turma_id: 't1', colaborador_id: 'c1', status: 'concluido', created_at: '2026-07-13T00:00:00Z', marco_jornada: null },
  { id: 'p2', turma_id: 't2', colaborador_id: 'c1', status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
];
const TURMAS = [{ id: 't1', nome: 'Turma 1' }, { id: 't2', nome: 'Ibipeba - Temporada 2' }];
const PDI_T1 = { id: 'r1', conteudo: { acolhimento: 'plano da T1' }, gerado_em: '2026-07-20T19:55:12Z', pdf_path: 'emp-1/individual-ana-1.pdf' };

beforeEach(() => {
  h.email = 'ana@acme.com';
  h.sysConfig = {};
  h.renders = [];
  h.uploads = [];
  h.tabelas = { turma_membros: PARTS, turmas: TURMAS, relatorios: [PDI_T1], artefatos_jornada_historico: [] };
  montar();
});

describe('loadPDI na jornada nova', () => {
  it('🔴 Temporada 2 antes do PDI novo: o da Temporada 1 não é o ativo, é o anterior da Turma 1', async () => {
    const r: any = await loadPDI();
    expect(r.pdiAtivo).toBe(false);
    expect(r.anteriores).toEqual([{ ref: 'vivo:r1', geradoEm: PDI_T1.gerado_em, turma: 'Turma 1' }]);
  });

  it('depois do PDI novo: o novo é o ativo e o arquivado da Temporada 1 é o anterior', async () => {
    h.tabelas.relatorios = [{ id: 'r1', conteudo: { acolhimento: 'plano da T2' }, gerado_em: '2026-10-20T10:00:00Z', pdf_path: null }];
    h.tabelas.artefatos_jornada_historico = [{ ...PDI_T1, id: 'h1' }];
    const r: any = await loadPDI();
    expect(r.pdiAtivo).toBe(true);
    expect(r.conteudo.acolhimento).toBe('plano da T2');
    expect(r.anteriores.map((a: any) => a.ref)).toEqual(['hist:h1']);
  });

  it('com a empresa PAUSADA, o PDI novo fica "em preparação" e o anterior continua na lista', async () => {
    h.sysConfig = { envios_pausados: { motivo: 'teste' } };
    h.tabelas.relatorios = [{ id: 'r1', conteudo: { acolhimento: 'plano da T2' }, gerado_em: '2026-10-20T10:00:00Z', pdf_path: null }];
    h.tabelas.artefatos_jornada_historico = [{ ...PDI_T1, id: 'h1' }];
    const r: any = await loadPDI();
    expect(r.pdiAtivo).toBe(false);
    expect(r.anteriores.map((a: any) => a.ref)).toEqual(['hist:h1']);
  });

  it('🔴 quem só respondeu na jornada ANTERIOR não aparece com "mapeamento completo" na nova', async () => {
    // 2 respostas da Temporada 1; da Temporada 2 (a partir do marco), nenhuma. O Top 5 novo tem 1 competência.
    h.sb = null;
    h.sb = criarSupabaseMock({
      resolver: (tabela: string) => (tabela === 'empresas' ? { nome: 'Acme', sys_config: {} } : tabela === 'cargos_empresa' ? { top5_workshop: ['Comunicação'] } : null),
      lista: (tabela: string) => h.tabelas[tabela] || [],
      contagem: (tabela: string, cadeia: any[]) => (tabela !== 'respostas' ? null
        : cadeia.some((c) => c.metodo === 'gte' && c.args[0] === 'created_at' && Date.parse(c.args[1]) === Date.parse(MARCO)) ? 0 : 2),
    });
    const r: any = await loadPDI();
    expect(r.pdiAtivo).toBe(false);
    expect(r.respondidas).toBe(0);
    expect(r.concluiuAvaliacao).toBe(false);
  });

  it('sem turma (a conta de sempre): o PDI vivo é o ativo e não há anteriores', async () => {
    h.tabelas.turma_membros = [];
    const r: any = await loadPDI();
    expect(r.pdiAtivo).toBe(true);
    expect(r.anteriores).toEqual([]);
  });
});

describe('loadPdiAnterior / baixarPdiAnteriorPdf: só o que está na lista da pessoa', () => {
  it('abre o anterior da lista, com a turma e a data', async () => {
    const r: any = await loadPdiAnterior('vivo:r1');
    expect(r.error).toBeUndefined();
    expect(r.conteudo.acolhimento).toBe('plano da T1');
    expect(r.turma).toBe('Turma 1');
    expect(r.criadoEm).toBe(PDI_T1.gerado_em);
  });

  it('🔴 ref fora da lista (rascunho, outra pessoa, inventada): "não encontrado", sem conteúdo', async () => {
    h.tabelas.artefatos_jornada_historico = [{ id: 'rascunho-t2', conteudo: { acolhimento: 'rascunho' }, gerado_em: '2026-10-19T00:00:00Z', pdf_path: null }];
    for (const ref of ['hist:rascunho-t2', 'hist:de-outra-pessoa', 'vivo:outro', '', 'qualquer']) {
      const r: any = await loadPdiAnterior(ref);
      expect(r, ref).toEqual({ error: 'PDI não encontrado', codigo: 'pdi_nao_encontrado' });
      const b: any = await baixarPdiAnteriorPdf(ref);
      expect(b.codigo, ref).toBe('pdi_nao_encontrado');
    }
  });

  it('sem sessão: não autenticado', async () => {
    h.email = null;
    expect(await loadPdiAnterior('vivo:r1')).toMatchObject({ codigo: 'nao_autenticado' });
    expect(await baixarPdiAnteriorPdf('vivo:r1')).toMatchObject({ codigo: 'nao_autenticado' });
  });

  it('baixa o PDF guardado do anterior, com a data no nome do arquivo', async () => {
    const r: any = await baixarPdiAnteriorPdf('vivo:r1');
    expect(r.success).toBe(true);
    expect(r.url).toContain('emp-1/individual-ana-1.pdf');
    expect(r.filename).toBe('vertho-pdi-ana-souza-2026-07-20.pdf');
    expect(h.renders).toHaveLength(0);
  });

  it('anterior do histórico SEM PDF guardado: gera, sobe e grava o caminho na linha do HISTÓRICO', async () => {
    h.tabelas.relatorios = [{ id: 'r1', conteudo: {}, gerado_em: '2026-10-20T10:00:00Z', pdf_path: null }];
    h.tabelas.artefatos_jornada_historico = [{ ...PDI_T1, id: 'h1', pdf_path: null }];
    const r: any = await baixarPdiAnteriorPdf('hist:h1');
    expect(r.success).toBe(true);
    expect(h.renders).toHaveLength(1);
    const troca = h.sb.escritas.find((e: any) => e.op === 'update');
    expect(troca.tabela).toBe('artefatos_jornada_historico');
    expect(troca.payload.pdf_path).toBe(h.uploads[0]);
    expect(h.sb.escritas.some((e: any) => e.tabela === 'relatorios')).toBe(false);
  });
});

describe('a tela', () => {
  it('mostra os anteriores nos dois estados (sem PDI ativo e com PDI ativo) e abre o anterior com o aviso', () => {
    const pagina = readFileSync('app/dashboard/pdi/page.tsx', 'utf8');
    expect(pagina.match(/\{listaAnteriores\}/g)?.length).toBe(2);
    expect(pagina).toContain("t('previous.viewingNotice')");
    expect(pagina).toContain('<PdiConteudo c={anterior.conteudo || {}} t={t} />');
    expect(pagina).toContain('<PdiConteudo c={c} t={t} />');
  });

  it('os textos novos existem nos quatro idiomas, com as mesmas chaves', () => {
    const chaves = (l: string) => Object.keys(JSON.parse(readFileSync(`messages/${l}.json`, 'utf8')).Pdi.previous).sort();
    const base = chaves('pt-BR');
    expect(base).toEqual(['back', 'download', 'eyebrow', 'loadError', 'subtitle', 'title', 'untitled', 'view', 'viewingNotice']);
    for (const l of ['pt-PT', 'en-US', 'es-ES']) expect(chaves(l), l).toEqual(base);
  });
});
