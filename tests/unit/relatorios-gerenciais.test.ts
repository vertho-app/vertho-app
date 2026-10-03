import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Os relatórios gerenciais que o RH consome (RH · Perfil Organizacional · DNA).
 *
 * O DNA e o Perfil Organizacional não têm índice em tabela: são arquivos. Desde
 * o R-74 (03/10/2026) nascem no bucket PRIVADO
 * (`relatorios-pdf/{empresaId}/{dna,perfil-org}/{timestamp}.pdf`); os antigos
 * seguem em `conteudos/final/{dna,perfil-org}/{empresaId}-{timestamp}.pdf` até
 * a migração. O que está testado:
 *
 *  1. **`search` do Storage é SUBSTRING, não prefixo.** Na pasta antiga, um
 *     arquivo cujo nome apenas CONTÉM o id do tenant passa pelo filtro do
 *     servidor. Confiar só nele entregaria o relatório de uma empresa dentro de
 *     outra: a classe de vazamento que esta base trata como inegociável.
 *  2. **O mais recente é o que vale**, somando os dois lugares. Ibipeba tem 11
 *     perfis organizacionais acumulados; devolver o primeiro da lista mostraria
 *     um retrato velho como se fosse o de hoje.
 *  3. **O link é a rota que autoriza, nunca uma URL do Storage.** A URL pública
 *     permanente era o defeito do R-74.
 */

const EMP = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';
let ARQUIVOS: Record<string, { name: string }[]> = {};

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'relatorios' ? { id: 'rel-rh-1', gerado_em: '2026-08-20T10:00:00Z' } : null),
  storage: { list: (bucket, pasta) => ARQUIVOS[`${bucket}:${pasta}`] || [] },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { carregarRelatoriosGerenciais } from '@/lib/home/loaders';
import { interpretarRefRelatorio } from '@/lib/relatorios/relatorio-privado';

/** O caminho que o link da tela carrega (o `ref` da rota). */
const refDe = (url: string | undefined) => {
  const u = new URL(String(url), 'https://acme.vertho.ai');
  expect(u.pathname).toBe('/api/relatorios/organizacional');
  return u.searchParams.get('ref');
};

describe('relatórios gerenciais do RH', () => {
  beforeEach(() => { sb.reset(); ARQUIVOS = {}; });

  it('ignora arquivo de outro tenant que só CONTÉM o id no nome (pasta antiga)', async () => {
    ARQUIVOS['conteudos:final/dna'] = [
      { name: `${OUTRA}-${EMP}-999.pdf` }, // passa no `search`, não é nosso
      { name: `${EMP}-100.pdf` },
    ];
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(refDe(r.dna?.url)).toBe(`final/dna/${EMP}-100.pdf`);
    expect(r.dna?.url).not.toContain(OUTRA);
  });

  it('pega o mais recente pelo timestamp do nome, não o primeiro da lista', async () => {
    ARQUIVOS['conteudos:final/perfil-org'] = [
      { name: `${EMP}-100.pdf` },
      { name: `${EMP}-300.pdf` },
      { name: `${EMP}-200.pdf` },
    ];
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(refDe(r.perfilOrg?.url)).toBe(`final/perfil-org/${EMP}-300.pdf`);
    expect(r.perfilOrg?.em).toBe(new Date(300).toISOString());
  });

  it('soma os dois lugares: o novo (bucket privado) vence quando é mais recente', async () => {
    ARQUIVOS['conteudos:final/perfil-org'] = [{ name: `${EMP}-300.pdf` }];
    ARQUIVOS[`relatorios-pdf:${EMP}/perfil-org`] = [{ name: '500.pdf' }, { name: '200.pdf' }];
    const r = await carregarRelatoriosGerenciais(EMP);
    const ref = interpretarRefRelatorio(refDe(r.perfilOrg?.url));
    expect(ref).toMatchObject({ bucket: 'relatorios-pdf', empresaId: EMP, caminho: `${EMP}/perfil-org/500.pdf` });
    expect(r.perfilOrg?.em).toBe(new Date(500).toISOString());
  });

  it('…e o antigo continua abrindo quando é o mais recente (antes da migração)', async () => {
    ARQUIVOS['conteudos:final/dna'] = [{ name: `${EMP}-900.pdf` }];
    ARQUIVOS[`relatorios-pdf:${EMP}/dna`] = [{ name: '500.pdf' }];
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(interpretarRefRelatorio(refDe(r.dna?.url))).toMatchObject({ bucket: 'conteudos', legado: true, empresaId: EMP });
  });

  it('🔴 nenhum link da tela é URL do Storage, e ninguém pede URL pública', async () => {
    ARQUIVOS['conteudos:final/dna'] = [{ name: `${EMP}-900.pdf` }];
    ARQUIVOS[`relatorios-pdf:${EMP}/perfil-org`] = [{ name: '500.pdf' }];
    const r = await carregarRelatoriosGerenciais(EMP);
    for (const doc of [r.dna, r.perfilOrg]) {
      expect(doc?.url).toMatch(/^\/api\/relatorios\/organizacional\?ref=/);
      expect(doc?.urlDownload).toMatch(/&download=1$/);
      expect(doc?.url).not.toMatch(/supabase|object\/public|https?:/);
    }
    expect(sb.storageChamadas.some((c) => c.metodo === 'getPublicUrl')).toBe(false);
    // Lista, não assina: o link só nasce no clique, depois da autorização.
    expect(sb.storageChamadas.some((c) => c.metodo === 'createSignedUrl')).toBe(false);
  });

  it('pasta vazia devolve null, nada de card apontando para o nada', async () => {
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(r.dna).toBeNull();
    expect(r.perfilOrg).toBeNull();
  });

  it('falha de listagem num dos lugares não apaga o que o outro achou', async () => {
    ARQUIVOS[`relatorios-pdf:${EMP}/dna`] = [{ name: '500.pdf' }];
    sb.falharEm({ tabela: '__storage__:conteudos', metodo: 'list', mensagem: 'timeout' });
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(refDe(r.dna?.url)).toBe(`${EMP}/dna/500.pdf`);
  });

  it('o relatório de RH aponta para a rota que já autoriza o papel rh', async () => {
    const r = await carregarRelatoriosGerenciais(EMP);
    expect(r.rh?.url).toBe('/api/relatorios/pdf?id=rel-rh-1');
    expect(sb.usou('relatorios', 'eq', 'tipo')).toBe(true);
  });
});
