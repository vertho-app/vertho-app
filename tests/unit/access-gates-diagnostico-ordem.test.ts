import { describe, expect, it } from 'vitest';
import { canAccessDiagnosticoNaOrdem, gateDiagnosticoDaPessoa } from '@/lib/access-gates';
import { criarSupabaseMock } from '../helpers/supabase-mock';

describe('ordem Perfil → Diagnóstico (por pessoa)', () => {
  it('sem perfil e sem resposta: bloqueia com código e caminho', () => {
    const r = canAccessDiagnosticoNaOrdem({}, { perfil_dominante: null }, false);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('PERFIL_PESSOAL_PENDENTE');
    expect(r.remediation).toMatch(/perfil-comportamental/);
  });

  it('perfil_dominante vazio ("") conta como sem perfil', () => {
    expect(canAccessDiagnosticoNaOrdem({}, { perfil_dominante: '' }, false).allowed).toBe(false);
  });

  it('com perfil libera', () => {
    expect(canAccessDiagnosticoNaOrdem({}, { perfil_dominante: 'DI' }, false).allowed).toBe(true);
  });

  it('quem já respondeu cenário não é trancado no meio', () => {
    expect(canAccessDiagnosticoNaOrdem({}, { perfil_dominante: null }, true).allowed).toBe(true);
  });

  it('empresa com fonte externa de perfil fica fora da regra (senão os cenários ficam inalcançáveis)', () => {
    expect(canAccessDiagnosticoNaOrdem({ perfil_externo_fonte: 'opq32' }, { perfil_dominante: null }, false).allowed).toBe(true);
  });
});

describe('gateDiagnosticoDaPessoa (lê o banco)', () => {
  const montar = (opts: { perfil?: string | null; respostas?: number }) =>
    criarSupabaseMock({
      resolver: (tabela) => (tabela === 'colaboradores' ? { perfil_dominante: opts.perfil ?? null } : null),
      contagem: (tabela) => (tabela === 'respostas' ? (opts.respostas ?? 0) : null),
    });

  it('sem perfil e sem respostas: bloqueia', async () => {
    const sb = montar({});
    const r = await gateDiagnosticoDaPessoa(sb.client, 'emp1', 'col1', {});
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('PERFIL_PESSOAL_PENDENTE');
  });

  it('sem perfil mas com respostas: libera', async () => {
    const sb = montar({ respostas: 2 });
    expect((await gateDiagnosticoDaPessoa(sb.client, 'emp1', 'col1', {})).allowed).toBe(true);
  });

  it('com perfil: libera sem nem consultar respostas', async () => {
    const sb = montar({ perfil: 'SC' });
    expect((await gateDiagnosticoDaPessoa(sb.client, 'emp1', 'col1', {})).allowed).toBe(true);
    expect(sb.chamadas.some((c) => c.tabela === 'respostas')).toBe(false);
  });

  it('fonte externa: libera sem ler nada', async () => {
    const sb = montar({});
    expect((await gateDiagnosticoDaPessoa(sb.client, 'emp1', 'col1', { perfil_externo_fonte: 'hogan' })).allowed).toBe(true);
    expect(sb.chamadas.length).toBe(0);
  });

  it('filtra por empresa_id nas duas leituras', async () => {
    const sb = montar({});
    await gateDiagnosticoDaPessoa(sb.client, 'emp1', 'col1', {});
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('respostas', 'eq', 'empresa_id')).toBe(true);
  });

  it('falha de leitura do colaborador NÃO libera em silêncio', async () => {
    const sb = montar({ perfil: 'D' });
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout' });
    const r = await gateDiagnosticoDaPessoa(sb.client, 'emp1', 'col1', {});
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('ORDEM_INDISPONIVEL');
  });

  it('falha de leitura das respostas NÃO libera em silêncio', async () => {
    const sb = montar({ respostas: 3 });
    sb.falharEm({ tabela: 'respostas', op: 'select', mensagem: 'timeout' });
    const r = await gateDiagnosticoDaPessoa(sb.client, 'emp1', 'col1', {});
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('ORDEM_INDISPONIVEL');
  });
});
