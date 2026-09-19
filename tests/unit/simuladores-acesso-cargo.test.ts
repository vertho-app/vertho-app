import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { acessoDoCargo, ACESSO_ATUAL, SEM_ACESSO, chaveCargo, idDoCargo, mapaDeCargos } from '@/lib/simuladores/acesso-cargo';
import type { AuthenticatedContext } from '@/lib/auth/request-context';

let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/permissions', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/lib/auth/request-context', () => ({ requireUser: vi.fn(async () => new Response('', { status: 401 })) }));
import { acessoSimuladoresDoColaborador } from '@/lib/simuladores/acesso';
import { contexto } from '@/lib/simulador-vendas/access';
import { contextoRecepcao } from '@/lib/recepcao/access';

const cargoId = '20000000-0000-4000-8000-000000000001';
const auth = { email: 'pessoa@example.test', empresaId: 'empresa-a', isPlatformAdmin: false, role: 'colaborador',
  colaborador: { id: 'c1', empresa_id: 'empresa-a', nome_completo: 'Pessoa', cargo: 'Consultor' } } as AuthenticatedContext;
let regra: unknown;
let regrasExtras: Record<string, unknown>;
let cargosDaEmpresa: Array<{ id: string; nome: string }>;

describe('liberação dos simuladores por cargo', () => {
  beforeEach(() => {
    regra = { vendas: true, atendimento: false, lideranca: false };
    regrasExtras = {};
    cargosDaEmpresa = [{ id: cargoId, nome: 'Consultor' }];
    sb = criarSupabaseMock({
      resolver: tabela => tabela === 'empresas'
        ? { id: 'empresa-a', nome: 'Empresa', sys_config: { simuladores_por_cargo: { [cargoId]: regra, ...regrasExtras } } }
        : tabela === 'platform_admins' ? { id: 'admin' } : { habilitado: true },
      lista: tabela => tabela === 'cargos_empresa' ? cargosDaEmpresa : [],
    });
  });
  it('preserva a liberação atual enquanto não houver regra para o cargo', () => {
    expect(acessoDoCargo({}, cargoId)).toEqual(ACESSO_ATUAL);
    expect(acessoDoCargo({ simuladores_por_cargo: {} }, cargoId)).toEqual(ACESSO_ATUAL);
    expect(acessoDoCargo({ simuladores_por_cargo: {} }, null)).toEqual(ACESSO_ATUAL);
  });
  it('regra explícita pode liberar qualquer combinação, inclusive nenhum', () => {
    for (let n = 0; n < 8; n++) {
      const acesso = { vendas: !!(n & 1), atendimento: !!(n & 2), lideranca: !!(n & 4) };
      expect(acessoDoCargo({ simuladores_por_cargo: { [cargoId]: acesso } }, cargoId)).toEqual(acesso);
    }
  });
  it('regras corrompidas, incompletas e valores truthy não concedem acesso', () => {
    for (const valor of [null, [], 'true', { vendas: 'true', atendimento: 1 }])
      expect(acessoDoCargo({ simuladores_por_cargo: { [cargoId]: valor } }, cargoId)).toEqual(SEM_ACESSO);
    expect(acessoDoCargo({ simuladores_por_cargo: null }, cargoId)).toEqual(SEM_ACESSO);
  });
  it('resolve o cargo dentro da empresa do cadastro autenticado', async () => {
    expect(await acessoSimuladoresDoColaborador(auth.colaborador)).toEqual(regra);
    expect(sb.chamadas).toContainEqual({ tabela: 'cargos_empresa', metodo: 'eq', args: ['empresa_id', 'empresa-a'] });
    expect(sb.chamadas).toContainEqual({ tabela: 'empresas', metodo: 'eq', args: ['id', 'empresa-a'] });
  });
  describe('nome do cargo no cadastro da pessoa (19/09/2026)', () => {
    const pessoa = (cargo: string) => ({ ...auth.colaborador, cargo });

    it('🔴 caixa, acento e espaço diferentes acham o cargo e aplicam a regra dele, não a liberação padrão', async () => {
      cargosDaEmpresa = [{ id: cargoId, nome: 'Coordenação Pedagógica' }];
      // Antes o gate comparava o nome exato: sem achar o cargo, liberava os três simuladores.
      for (const grafia of ['coordenacao pedagogica', ' COORDENAÇÃO  Pedagógica ', 'Coordenação Pedagógica'])
        expect(await acessoSimuladoresDoColaborador(pessoa(grafia))).toEqual(regra);
    });

    it('o nome exato vence o normalizado; na colisão vale o menor id, em qualquer ordem', async () => {
      const outro = '10000000-0000-4000-8000-000000000009';
      regrasExtras = { [outro]: SEM_ACESSO };
      for (const ordem of [[{ id: cargoId, nome: 'Consultor' }, { id: outro, nome: 'consultor' }], [{ id: outro, nome: 'consultor' }, { id: cargoId, nome: 'Consultor' }]]) {
        cargosDaEmpresa = ordem;
        expect(await acessoSimuladoresDoColaborador(pessoa('Consultor'))).toEqual(regra);
        expect(await acessoSimuladoresDoColaborador(pessoa('consultor'))).toEqual(SEM_ACESSO);
        expect(await acessoSimuladoresDoColaborador(pessoa('CONSULTOR'))).toEqual(SEM_ACESSO);
      }
    });

    it('cargo que não existe na empresa segue na liberação padrão, como antes', async () => {
      expect(await acessoSimuladoresDoColaborador(pessoa('Cargo novo'))).toEqual(ACESSO_ATUAL);
    });

    it('índice puro: sem nome não há cargo', () => {
      const indice = mapaDeCargos([{ id: 'x', nome: 'Analista  Sênior' }, { id: 'y', nome: null }]);
      expect(idDoCargo(indice, 'analista senior')).toBe('x');
      expect(idDoCargo(indice, '')).toBeNull();
      expect(idDoCargo(indice, null)).toBeNull();
      expect(chaveCargo('  Ânálise   de  Crédito ')).toBe('analise de credito');
    });
  });
  it.each(['empresas', 'cargos_empresa'])('erro de leitura em %s fecha os acessos', async tabela => {
    sb.falharEm({ tabela, op: 'select', mensagem: 'timeout' });
    expect(await acessoSimuladoresDoColaborador(auth.colaborador)).toEqual(SEM_ACESSO);
    expect(sb.escritas).toHaveLength(0);
  });
  it('cadastro ausente nunca recebe acesso', async () => {
    expect(await acessoSimuladoresDoColaborador(null)).toEqual(SEM_ACESSO);
    expect(sb.chamadas).toHaveLength(0);
  });
  it('a API de atendimento recusa o cargo mesmo com módulo habilitado', async () => {
    await expect(contextoRecepcao(new Request('https://app.vertho.ai/api'), null, true, auth)).rejects.toThrow('cargo');
    expect(sb.escritas).toHaveLength(0);
  });
  it('a API de vendas permite o cargo autorizado e bloqueia leitura e escrita após revogação', async () => {
    await expect(contexto(new Request('https://app.vertho.ai/api'), null, true, auth)).resolves.toMatchObject({ empresaId: 'empresa-a' });
    regra = SEM_ACESSO;
    for (const escrita of [false, true])
      await expect(contexto(new Request('https://app.vertho.ai/api'), null, escrita, auth)).rejects.toThrow('cargo');
    expect(sb.escritas).toHaveLength(0);
  });
  describe('gestor e RH só acompanham atendimento e vendas (17/09/2026)', () => {
    const req = () => new Request('https://app.vertho.ai/api');

    it.each(['gestor', 'rh'])('%s: treinar é recusado nas duas APIs, mesmo com o cargo liberado', async (role) => {
      regra = { vendas: true, atendimento: true, lideranca: true };
      const pessoa = { ...auth, role } as AuthenticatedContext;
      await expect(contextoRecepcao(req(), null, true, pessoa)).rejects.toThrow('quem treina é quem atende');
      await expect(contexto(req(), null, true, pessoa)).rejects.toThrow('quem treina é quem vende');
      expect(sb.escritas).toHaveLength(0);
    });

    it.each(['gestor', 'rh'])('%s: a leitura (o acompanhamento) abre mesmo com o cargo SEM liberação', async (role) => {
      regra = SEM_ACESSO;
      const pessoa = { ...auth, role } as AuthenticatedContext;
      await expect(contextoRecepcao(req(), null, false, pessoa)).resolves.toMatchObject({ empresaId: 'empresa-a', soAcompanha: true });
      await expect(contexto(req(), null, false, pessoa)).resolves.toMatchObject({ empresaId: 'empresa-a', soAcompanha: true });
    });

    it('colaborador continua dependendo da liberação do cargo, e treinando quando liberado', async () => {
      regra = SEM_ACESSO;
      await expect(contextoRecepcao(req(), null, false, auth)).rejects.toThrow('cargo');
      await expect(contexto(req(), null, false, auth)).rejects.toThrow('cargo');
      regra = { vendas: true, atendimento: true, lideranca: false };
      await expect(contextoRecepcao(req(), null, true, auth)).resolves.toMatchObject({ soAcompanha: false });
      await expect(contexto(req(), null, true, auth)).resolves.toMatchObject({ soAcompanha: false });
    });
  });

  it('admin da plataforma mantém preview independente do cargo', async () => {
    regra = SEM_ACESSO;
    const admin = { ...auth, isPlatformAdmin: true };
    await expect(contexto(new Request('https://app.vertho.ai/api'), null, true, admin)).resolves.toMatchObject({ ownerKey: 'admin:admin' });
    await expect(contextoRecepcao(new Request('https://app.vertho.ai/api'), null, true, admin)).resolves.toMatchObject({ ownerKey: 'admin:admin' });
  });
});
