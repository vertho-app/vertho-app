import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { carregarIdiomasDaEmpresa } from '@/lib/idioma-do-destinatario';
import { DEGRADACAO } from '@/lib/degradacao';

/**
 * Onda D, d-mail (04/10/2026): o idioma de cada pessoa de uma empresa, para quem
 * manda e-mail em lote. A régua é a do app: a pessoa, senão a empresa, senão pt-BR.
 */

function mockDe(opts: { padrao?: string | null; pessoas?: Array<{ id: string; locale: string | null }> }) {
  return criarSupabaseMock({
    resolver: (t) => (t === 'empresas' ? { default_locale: opts.padrao ?? null } : null),
    lista: (t, _cols, cadeia) => {
      if (t !== 'colaboradores') return [];
      // como o PostgREST: a janela do `.range(de, ate)` da cadeia
      const r = cadeia.find((c) => c.metodo === 'range')?.args;
      const todas = opts.pessoas || [];
      return r ? todas.slice(r[0], r[1] + 1) : todas;
    },
  });
}

describe('carregarIdiomasDaEmpresa: a pessoa, senão a empresa, senão pt-BR', () => {
  it('a ordem de precedência', async () => {
    const sb = mockDe({ padrao: 'es-ES', pessoas: [{ id: 'a', locale: 'en-US' }, { id: 'b', locale: 'pt-PT' }, { id: 'c', locale: 'klingon' }] });
    const i = await carregarIdiomasDaEmpresa(sb.client, 'emp-1');
    expect(i.falhou).toBe(false);
    expect(i.padrao).toBe('es-ES');
    expect(i.de('a')).toBe('en-US');
    expect(i.de('b')).toBe('pt-PT');
    expect(i.de('c')).toBe('es-ES'); // idioma inválido na pessoa: o da empresa
    expect(i.de('quem-nao-tem-idioma')).toBe('es-ES');
    expect(i.de(null)).toBe('es-ES');
    expect(i.de(undefined)).toBe('es-ES');
  });

  it('sem idioma na empresa nem na pessoa, pt-BR', async () => {
    const i = await carregarIdiomasDaEmpresa(mockDe({}).client, 'emp-1');
    expect(i.padrao).toBeNull();
    expect(i.de('x')).toBe('pt-BR');
  });

  it('o idioma da empresa aceita as variantes que o app aceita ("en", "pt")', async () => {
    const i = await carregarIdiomasDaEmpresa(mockDe({ padrao: 'en' }).client, 'emp-1');
    expect(i.padrao).toBe('en-US');
  });

  it('a leitura é do TENANT e só de quem tem idioma próprio', async () => {
    const sb = mockDe({ padrao: 'pt-BR' });
    await carregarIdiomasDaEmpresa(sb.client, 'emp-1');
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    expect(sb.chamadas.find((c) => c.tabela === 'colaboradores' && c.metodo === 'eq')?.args).toEqual(['empresa_id', 'emp-1']);
    expect(sb.usou('colaboradores', 'not', 'locale')).toBe(true);
    // sem `.in(ids)`: a lista de ids estoura a URL em empresa grande
    expect(sb.usou('colaboradores', 'in')).toBe(false);
  });

  it('🔴 passa do corte de 1.000 linhas do PostgREST: lê a segunda página e ninguém cai no idioma da empresa por engano', async () => {
    const pessoas = Array.from({ length: 1003 }, (_, n) => ({ id: `p${n}`, locale: 'en-US' }));
    const sb = mockDe({ padrao: 'pt-BR', pessoas });
    const i = await carregarIdiomasDaEmpresa(sb.client, 'emp-1');
    expect(i.falhou).toBe(false);
    expect(i.de('p0')).toBe('en-US');
    expect(i.de('p999')).toBe('en-US');
    expect(i.de('p1002')).toBe('en-US'); // a 1.003ª pessoa, da segunda página
    const janelas = sb.chamadas.filter((c) => c.tabela === 'colaboradores' && c.metodo === 'range').map((c) => c.args);
    expect(janelas).toEqual([[0, 999], [1000, 1999]]);
    expect(sb.usou('colaboradores', 'order', 'id')).toBe(true);
  });

  it('página exatamente cheia: pede a próxima e para na vazia', async () => {
    const pessoas = Array.from({ length: 1000 }, (_, n) => ({ id: `p${n}`, locale: 'es-ES' }));
    const sb = mockDe({ pessoas });
    const i = await carregarIdiomasDaEmpresa(sb.client, 'emp-1');
    expect(i.de('p999')).toBe('es-ES');
    expect(sb.chamadas.filter((c) => c.tabela === 'colaboradores' && c.metodo === 'range')).toHaveLength(2);
  });
});

describe('carregarIdiomasDaEmpresa: falha de leitura não lança e não é silenciosa', () => {
  it('falha na leitura de colaboradores: segue com o idioma da empresa e diz que falhou', async () => {
    const sb = mockDe({ padrao: 'es-ES', pessoas: [{ id: 'a', locale: 'en-US' }] });
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    const i = await carregarIdiomasDaEmpresa(sb.client, 'emp-1');
    expect(i.falhou).toBe(true);
    expect(i.motivo).toBe('colaboradores: timeout no pool');
    expect(i.de('a')).toBe('es-ES');
  });

  it('falha na leitura da empresa: as pessoas com idioma próprio mantêm o delas, as demais caem em pt-BR', async () => {
    const sb = mockDe({ padrao: 'es-ES', pessoas: [{ id: 'a', locale: 'en-US' }] });
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' });
    const i = await carregarIdiomasDaEmpresa(sb.client, 'emp-1');
    expect(i.falhou).toBe(true);
    expect(i.motivo).toBe('empresas: timeout no pool');
    expect(i.padrao).toBeNull();
    expect(i.de('a')).toBe('en-US');
    expect(i.de('b')).toBe('pt-BR');
  });

  it('um client que LANÇA (rede caiu) também vira `falhou`, nunca exceção', async () => {
    const quebrado = { from: () => { throw new Error('conexão perdida'); } };
    const i = await carregarIdiomasDaEmpresa(quebrado, 'emp-1');
    expect(i.falhou).toBe(true);
    expect(i.motivo).toBe('empresas: conexão perdida');
    expect(i.de('x')).toBe('pt-BR');
  });

  it('a degradação tem tipo próprio no registro', () => {
    expect(DEGRADACAO.IDIOMA_DO_EMAIL_INDISPONIVEL).toBe('idioma-do-email-indisponivel');
  });
});
