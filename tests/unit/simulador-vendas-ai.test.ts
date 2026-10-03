import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { estado, semViolacao } from '../fixtures/simulador-vendas';
import type { Contexto } from '@/lib/simulador-vendas/access';
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => 'gpt-5.4-2026-03-05') }));
import { callAI } from '@/actions/ai-client';
import { tenantDb } from '@/lib/tenant-db';
import { gerador } from '@/lib/simulador-vendas/ai';
import { hashPrompt } from '@/lib/simulador-vendas/prompts';
import { maskColaborador } from '@/lib/pii-masker';
const req = '20000000-0000-4000-8000-000000000002';
const ctx = () =>
  ({
    empresaId: 'empresa-a',
    colaboradorId: 'colab-a',
    auth: { isPlatformAdmin: false },
    tdb: tenantDb('empresa-a'),
  }) as Contexto;
describe('checkpoint dos agentes PACE', () => {
  beforeEach(() => {
    sb = criarSupabaseMock({
      resolver: (tabela) =>
        tabela === 'sim_vendas_config'
          ? { habilitado: true, periodo_inicio: '2020-01-01T00:00:00Z', periodo_fim: '2099-01-01T00:00:00Z' }
          : null,
    });
    vi.mocked(callAI).mockReset().mockResolvedValue(JSON.stringify(semViolacao));
  });
  it('registra antes de pagar; falha de insert impede a chamada', async () => {
    sb.falharEm({ tabela: 'sim_vendas_tentativas', op: 'insert', mensagem: 'indisponível' });
    await expect(gerador(ctx(), estado(), req)('moderador', {})).rejects.toMatchObject({ status: 503 });
    expect(callAI).not.toHaveBeenCalled();
  });
  it('reutiliza saída aceita e aplica de novo a validação sem gastar IA', async () => {
    sb = criarSupabaseMock({
      lista: () => [
        {
          tentativa: 1,
          prompt_hash: hashPrompt('PROMPT_PRIVADO'),
          modelo: 'gpt-5.4-2026-03-05',
          status: 'aceita',
          resultado: semViolacao,
        },
      ],
    });
    const validar = vi.fn();
    expect(await gerador(ctx(), estado(), req)('moderador', {}, validar)).toEqual(semViolacao);
    expect(validar).toHaveBeenCalledOnce();
    expect(callAI).not.toHaveBeenCalled();
    expect(sb.chamadas).toContainEqual({
      tabela: 'sim_vendas_tentativas',
      metodo: 'eq',
      args: ['empresa_id', 'empresa-a'],
    });
  });
  it('mesmo request com prompt diferente é conflito antes do provedor', async () => {
    sb = criarSupabaseMock({
      lista: () => [
        {
          tentativa: 1,
          prompt_hash: 'outro',
          modelo: 'gpt-5.4-2026-03-05',
          status: 'aceita',
          resultado: semViolacao,
        },
      ],
    });
    await expect(gerador(ctx(), estado(), req)('moderador', {})).rejects.toMatchObject({ status: 409 });
    expect(callAI).not.toHaveBeenCalled();
  });
  it('chamada aceita carrega tenant, correlação e snapshot; checkpoint precede retorno', async () => {
    vi.mocked(callAI).mockImplementation(async () => {
      expect(sb.escritas).toHaveLength(1);
      expect(sb.escritas[0].payload).toMatchObject({ empresa_id: 'empresa-a', request_id: req });
      return JSON.stringify(semViolacao);
    });
    await gerador(ctx(), estado(), req)('moderador', {});
    expect(callAI).toHaveBeenCalledWith(
      '',
      'PROMPT_PRIVADO',
      { model: 'gpt-5.4-2026-03-05' },
      2500,
      expect.objectContaining({
        empresaId: 'empresa-a',
        colaboradorId: 'colab-a',
        correlationId: sb.escritas[0].payload.id,
        maxRetries: 0,
      }),
    );
    expect(sb.escritas.at(-1)?.payload).toMatchObject({ status: 'aceita', resultado: semViolacao });
  });
  it('falha ao salvar nunca retorna sucesso nem refaz chamada paga automaticamente', async () => {
    sb.falharEm({
      tabela: 'sim_vendas_tentativas',
      op: 'update',
      quando: (p) => p.status === 'aceita',
      mensagem: 'timeout',
    });
    await expect(gerador(ctx(), estado(), req)('moderador', {})).rejects.toMatchObject({ status: 503 });
    expect(callAI).toHaveBeenCalledOnce();
  });
  it('JSON inválido tem uma regeneração; falha de rede não tem retry automático', async () => {
    vi.mocked(callAI).mockResolvedValueOnce('não JSON');
    expect(await gerador(ctx(), estado(), req)('moderador', {})).toEqual(semViolacao);
    expect(callAI).toHaveBeenCalledTimes(2);
    vi.mocked(callAI).mockReset().mockRejectedValue(new Error('fetch failed'));
    await expect(gerador(ctx(), estado(), req)('moderador', {})).rejects.toMatchObject({ status: 502 });
    expect(callAI).toHaveBeenCalledOnce();
  });
});

/**
 * R-44 (03/10/2026): o nome completo do vendedor ia ao provedor como
 * `{{username}}` e, guardado no cenário, voltava em toda etapa seguinte. Agora
 * os valores vão mascarados e a saída volta com o nome antes de validar.
 */
describe('o nome do vendedor não vai à IA', () => {
  const NOME = 'Ana Beatriz Souza';
  const TEXTO = 'VENDEDOR: {{username}} DIZ: {{input_vendedor}}';
  const comPrompt = (nomeVendedor = NOME) => {
    const s = estado();
    s.nomeVendedor = nomeVendedor;
    s.prompts.moderador = { ...s.prompts.moderador, texto: TEXTO, hash: hashPrompt(TEXTO) };
    return s;
  };
  beforeEach(() => {
    sb = criarSupabaseMock({
      resolver: (tabela) =>
        tabela === 'sim_vendas_config'
          ? { habilitado: true, periodo_inicio: '2020-01-01T00:00:00Z', periodo_fim: '2099-01-01T00:00:00Z' }
          : null,
    });
  });

  it('valores vão com o identificador; a saída validada e gravada volta com o nome', async () => {
    const alias = maskColaborador({ id: 'colab-a', nome_completo: NOME }).masked!.nome;
    vi.mocked(callAI).mockReset().mockResolvedValue(JSON.stringify({ ...semViolacao, motivo: `${alias} citou o preço` }));
    const validar = vi.fn();
    const r = await gerador(ctx(), comPrompt(), req)('moderador', {
      username: NOME,
      input_vendedor: 'Oi, aqui é a Ana Beatriz, meu e-mail é ana@loja.com',
    }, validar);
    const enviado = String(vi.mocked(callAI).mock.calls[0][1]);
    expect(enviado).toBe(`VENDEDOR: ${alias} DIZ: Oi, aqui é a ${alias}, meu e-mail é [email]`);
    expect(r.motivo).toBe(`${NOME} citou o preço`);
    expect(validar).toHaveBeenCalledWith(expect.objectContaining({ motivo: `${NOME} citou o preço` }));
    expect(sb.escritas.at(-1)?.payload.resultado.motivo).toBe(`${NOME} citou o preço`);
  });

  it('admin treinando ("Vendedor"): nada a mascarar, a palavra continua no texto', async () => {
    vi.mocked(callAI).mockReset().mockResolvedValue(JSON.stringify(semViolacao));
    const admin = { ...ctx(), colaboradorId: null } as unknown as Contexto;
    await gerador(admin, comPrompt('Vendedor'), req)('moderador', { username: 'Vendedor', input_vendedor: 'o vendedor responde' });
    expect(String(vi.mocked(callAI).mock.calls[0][1])).toBe('VENDEDOR: Vendedor DIZ: o vendedor responde');
  });
});
