/**
 * `lib/pdf-locale.ts`: em que idioma sai o PDF e como o arquivo guardado diz o idioma em que nasceu.
 *
 *  - o nome do arquivo carrega o idioma (`.pt-PT.pdf`...), e o pt-BR segue exatamente como era
 *    (todo PDF anterior à onda D é pt-BR, e o formato do caminho não muda para ele);
 *  - o idioma é o da PESSOA (`colaboradores.locale`, senão `empresas.default_locale`, senão pt-BR);
 *  - leitura que falha NUNCA derruba o PDF: cai no próximo da cadeia e avisa.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  colaborador: { data: null as any, error: null as any, lanca: false },
  empresa: { data: null as any, error: null as any, lanca: false },
  consultas: [] as string[],
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantDb: (empresaId: string) => ({
    from: (tabela: string) => ({
      select: () => ({
        eq: (coluna: string, valor: string) => ({
          maybeSingle: async () => {
            estado.consultas.push(`${empresaId}:${tabela}:${coluna}=${valor}`);
            if (estado.colaborador.lanca) throw new Error('rede caiu');
            return { data: estado.colaborador.data, error: estado.colaborador.error };
          },
        }),
      }),
    }),
    raw: {
      from: (tabela: string) => ({
        select: () => ({
          eq: (coluna: string, valor: string) => ({
            maybeSingle: async () => {
              estado.consultas.push(`raw:${tabela}:${coluna}=${valor}`);
              if (estado.empresa.lanca) throw new Error('rede caiu');
              return { data: estado.empresa.data, error: estado.empresa.error };
            },
          }),
        }),
      }),
    },
  }),
}));

import { caminhoDoPdf, idiomaDaPessoa, idiomaDoCaminhoPdf, idiomaDoLeitor } from '@/lib/pdf-locale';

beforeEach(() => {
  estado.colaborador = { data: null, error: null, lanca: false };
  estado.empresa = { data: null, error: null, lanca: false };
  estado.consultas = [];
});

describe('o idioma no nome do arquivo guardado', () => {
  it('pt-BR continua como era; os outros três levam o idioma antes da extensão', () => {
    expect(caminhoDoPdf('emp', 'individual', 'ana-souza', 'pt-BR', 123)).toBe('emp/individual-ana-souza-123.pdf');
    expect(caminhoDoPdf('emp', 'individual', 'ana-souza', 'pt-PT', 123)).toBe('emp/individual-ana-souza-123.pt-PT.pdf');
    expect(caminhoDoPdf('emp', 'gestor', 'acme-joao', 'es-ES', 123)).toBe('emp/gestor-acme-joao-123.es-ES.pdf');
    expect(caminhoDoPdf('emp', 'rh', 'acme', 'en-US', 123)).toBe('emp/rh-acme-123.en-US.pdf');
  });

  it('ida e volta: o idioma que entra no nome é o que sai dele', () => {
    for (const l of ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const) {
      expect(idiomaDoCaminhoPdf(caminhoDoPdf('emp', 'individual', 'ana', l, 1))).toBe(l);
    }
  });

  it('arquivo antigo (sem marca), nome qualquer e ausente são pt-BR', () => {
    expect(idiomaDoCaminhoPdf('emp/individual-ana-1759000000000.pdf')).toBe('pt-BR');
    expect(idiomaDoCaminhoPdf('rel.pdf')).toBe('pt-BR');
    expect(idiomaDoCaminhoPdf(null)).toBe('pt-BR');
    expect(idiomaDoCaminhoPdf(undefined)).toBe('pt-BR');
  });

  it('o nome da pessoa não finge ser idioma: o slug (só [a-z0-9-]) nunca produz ".en-US.pdf"', () => {
    // `storageSlug` devolve minúsculas e hífens; o idioma tem ponto e maiúscula
    expect(idiomaDoCaminhoPdf(caminhoDoPdf('emp', 'individual', 'ana-en-us', 'pt-BR', 1))).toBe('pt-BR');
    expect(idiomaDoCaminhoPdf('emp/individual-ana.en-us.pdf')).toBe('pt-BR');
  });
});

describe('idiomaDaPessoa: a pessoa, senão a empresa, senão pt-BR', () => {
  it('o idioma da pessoa vence o da empresa', async () => {
    estado.colaborador.data = { locale: 'es-ES' };
    estado.empresa.data = { default_locale: 'en-US' };
    expect(await idiomaDaPessoa('emp-1', 'col-1')).toBe('es-ES');
  });

  it('sem idioma na pessoa, vale o da empresa', async () => {
    estado.colaborador.data = { locale: null };
    estado.empresa.data = { default_locale: 'pt-PT' };
    expect(await idiomaDaPessoa('emp-1', 'col-1')).toBe('pt-PT');
  });

  it('sem nenhum dos dois, pt-BR; valor fora dos quatro idiomas também', async () => {
    expect(await idiomaDaPessoa('emp-1', 'col-1')).toBe('pt-BR');
    estado.colaborador.data = { locale: 'fr-FR' };
    estado.empresa.data = { default_locale: 'de' };
    expect(await idiomaDaPessoa('emp-1', 'col-1')).toBe('pt-BR');
  });

  it('a leitura da pessoa é DENTRO do tenant e por id (nunca por e-mail)', async () => {
    estado.colaborador.data = { locale: 'en-US' };
    await idiomaDaPessoa('emp-1', 'col-1');
    expect(estado.consultas).toContain('emp-1:colaboradores:id=col-1');
    expect(estado.consultas).toContain('raw:empresas:id=emp-1');
  });

  it('sem pessoa (admin da plataforma, gestor sem cadastro), só a empresa é lida', async () => {
    estado.empresa.data = { default_locale: 'es-ES' };
    expect(await idiomaDaPessoa('emp-1', null)).toBe('es-ES');
    expect(estado.consultas.some((c) => c.includes('colaboradores'))).toBe(false);
  });

  it('empresa já lida pelo chamador: a leitura não se repete (nem com null)', async () => {
    estado.colaborador.data = { locale: null };
    expect(await idiomaDaPessoa('emp-1', 'col-1', { localeDaEmpresa: 'en-US' })).toBe('en-US');
    expect(await idiomaDaPessoa('emp-1', 'col-1', { localeDaEmpresa: null })).toBe('pt-BR');
    expect(estado.consultas.some((c) => c.startsWith('raw:empresas'))).toBe(false);
  });

  it('🔴 leitura que falha (erro do supabase ou exceção) cai no próximo da cadeia e AVISA, sem derrubar o PDF', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      estado.colaborador.error = { message: 'permission denied' };
      estado.empresa.data = { default_locale: 'en-US' };
      expect(await idiomaDaPessoa('emp-1', 'col-1')).toBe('en-US');
      estado.colaborador.error = null;
      estado.colaborador.lanca = true;
      expect(await idiomaDaPessoa('emp-1', 'col-1')).toBe('en-US');
      estado.empresa.lanca = true;
      expect(await idiomaDaPessoa('emp-1', 'col-1')).toBe('pt-BR');
      expect(aviso).toHaveBeenCalled();
    } finally {
      aviso.mockRestore();
    }
  });
});

describe('idiomaDoLeitor: quem BAIXA', () => {
  it('o cadastro do leitor no tenant do relatório decide', async () => {
    estado.colaborador.data = { locale: 'en-US' };
    const auth = { colaborador: { id: 'rh-1', empresa_id: 'emp-1' } };
    expect(await idiomaDoLeitor(auth, 'emp-1')).toBe('en-US');
    expect(estado.consultas).toContain('emp-1:colaboradores:id=rh-1');
  });

  it('🔴 cadastro do leitor em OUTRA empresa não vale (admin com cadastro em duas empresas): vale o da empresa do relatório', async () => {
    estado.colaborador.data = { locale: 'en-US' };
    estado.empresa.data = { default_locale: 'es-ES' };
    const auth = { colaborador: { id: 'admin-na-outra', empresa_id: 'emp-OUTRA' } };
    expect(await idiomaDoLeitor(auth, 'emp-1')).toBe('es-ES');
    expect(estado.consultas.some((c) => c.includes('colaboradores'))).toBe(false);
  });

  it('admin da plataforma sem cadastro: o idioma da empresa do relatório; sem sessão útil, pt-BR', async () => {
    estado.empresa.data = { default_locale: 'pt-PT' };
    expect(await idiomaDoLeitor({ colaborador: null }, 'emp-1')).toBe('pt-PT');
    expect(await idiomaDoLeitor(undefined, 'emp-1')).toBe('pt-PT');
    estado.empresa.data = null;
    expect(await idiomaDoLeitor(null, 'emp-1')).toBe('pt-BR');
  });
});
