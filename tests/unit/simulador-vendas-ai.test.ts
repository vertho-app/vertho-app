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
