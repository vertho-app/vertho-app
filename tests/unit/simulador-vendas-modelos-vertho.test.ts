import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  model: vi.fn(async () => 'gpt-5.4-2026-03-05'),
  archive: vi.fn(async () => 'prompt-id'),
}));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: mocks.model }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({}) }));
vi.mock('@/lib/simulador-vendas/catalogo', () => ({
  arquivarPrompt: mocks.archive,
}));
import { snapshotPrompts } from '@/lib/simulador-vendas/ai';
import { VERTHO_TREINO_EMPRESA_ID } from '@/lib/simulador-vendas/vertho';
import { esforcoPadraoPace, gerenteComConferencia, modeloPaceCompativel } from '@/lib/simulador-vendas/modelos';

describe('modelos por dificuldade no treinamento comercial', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([1, 2, 3] as const)(
    'nível %s congela modelo e esforço de cada agente',
    async (nivel) => {
      const s = await snapshotPrompts(VERTHO_TREINO_EMPRESA_ID, true, nivel);
      expect(s.criador).toMatchObject({
        modelo: 'global.moonshotai.kimi-k3',
        esforco: 'low',
      });
      expect(s.cliente).toMatchObject({
        modelo: 'global.moonshotai.kimi-k3',
        esforco: 'low',
      });
      expect(s.gerente).toMatchObject({
        modelo: 'claude-sonnet-5-5',
        esforco: 'medium',
      });
      // 08/10/2026: moderador e intenção migraram do Gemini 3.8 Flash para o Haiku 5.5. O MODERADOR roda em `medium`: sem raciocínio
      // (`none`) o Haiku subestima a severidade (18 de 26 violações contra 23 de 26) e a severidade vira penalidade na nota.
      // A INTENÇÃO fica em `none` (decisão binária, 35 de 35 nos dois): o Haiku raciocina por padrão mesmo em `low`.
      expect(s.moderador, '`none` no moderador subestima a severidade (medido em 08/10/2026)').toMatchObject({ modelo: 'claude-haiku-5-5', esforco: 'medium' });
      expect(s.intencao).toMatchObject({ modelo: 'claude-haiku-5-5', esforco: 'none' });
      expect(s.criador.versao).toMatch(/-comercial-3$/);
      expect(s.cliente.versao).toMatch(/-comercial-3$/);
      const textos = mocks.archive.mock.calls as unknown as Array<unknown[]>;
      const criador = textos.find((args) => args[1] === 'criador');
      const cliente = textos.find((args) => args[1] === 'cliente');
      const gerente = textos.find((args) => args[1] === 'gerente');
      expect(gerente?.[3]).toContain('Nunca devolva nivel=1 com evidencias=[]');
      if (nivel === 1) {
        expect(criador?.[3]).toContain('0 objeções profundas');
        expect(cliente?.[3]).toContain('Não exija simultaneamente');
      } else {
        expect(criador?.[3]).not.toContain('Calibração Vertho');
        expect(cliente?.[3]).not.toContain('Calibração Vertho');
      }
      expect(mocks.model).not.toHaveBeenCalled();
      for (const agent of Object.values(s))
        expect(modeloPaceCompativel(agent.modelo)).toBe(true);
    },
  );
  it('preserva a configuração dos simuladores de outras empresas', async () => {
    const s = await snapshotPrompts('outra-empresa', false, 3);
    expect(mocks.model).toHaveBeenCalledTimes(5);
    expect(s.cliente.modelo).toBe('gpt-5.4-2026-03-05');
    expect(s.cliente).not.toHaveProperty('esforco');
    const textos = mocks.archive.mock.calls as unknown as Array<unknown[]>;
    expect(textos.find((args) => args[1] === 'gerente')?.[3]).not.toContain(
      'Conferência final de evidências PACE',
    );
  });
  it('recusa usar o perfil Vertho em outro tenant antes de arquivar', async () => {
    await expect(
      snapshotPrompts('outra-empresa', true, 2),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.archive).not.toHaveBeenCalled();
  });
  it('mantém compatibilidade de snapshots legados e reconhece Kimi Bedrock validado', () => {
    expect(modeloPaceCompativel('gpt-5.4-mini-2026-03-17')).toBe(true);
    expect(modeloPaceCompativel('global.moonshotai.kimi-k3')).toBe(true);
    expect(modeloPaceCompativel('claude-sonnet-5-5')).toBe(true);
    expect(modeloPaceCompativel('claude-haiku-5-5')).toBe(true);
    // O Gemini 3.8 SAIU do perfil Vertho mas segue compatível: sessão aberta antes da troca tem o snapshot
    // dele congelado, e `snapshotPrompts` recusaria o treino se `modeloPaceCompativel` o negasse.
    expect(modeloPaceCompativel('gemini-3.8-flash')).toBe(true);
    expect(modeloPaceCompativel('kimi-k3')).toBe(false);
    expect(modeloPaceCompativel('claude-sonnet-4-6')).toBe(false);
  });
});

// Gerente do PACE fora do Vertho: Sonnet 5.5 no lugar do GPT 5.4 (08/10/2026, decisão do dono). `Medido` nas mesmas conversas: o acordo
// por descritor é de 60,9% entre os dois contra 90,5% e 86,3% de cada um consigo mesmo. Sem a conferência de evidências no prompt, o
// Sonnet falhou na validação em 6 de 6 chamadas de uma sessão real ("Nível sem evidência observável").
describe('gerente do PACE em Claude fora do treino Vertho', () => {
  const REGRA = 'Nunca devolva nivel=1 com evidencias=[]';
  const texto = (etapa: string) =>
    ((mocks.archive.mock.calls as unknown as Array<unknown[]>).find((args) => args[1] === etapa)?.[3] as string) ?? '';
  const versao = (etapa: string) =>
    (mocks.archive.mock.calls as unknown as Array<unknown[]>).find((args) => args[1] === etapa)?.[2] as string;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.model.mockImplementation((async (_e: unknown, tarefa: string) =>
      tarefa === 'sim_vendas_gerente' ? 'claude-sonnet-5-5' : 'gpt-5.4-2026-03-05') as any);
  });

  it('roda em esforço medium (o medido) e leva a conferência de evidências com versão própria', async () => {
    const s = await snapshotPrompts('outra-empresa', false, 2);
    expect(s.gerente).toMatchObject({ modelo: 'claude-sonnet-5-5', esforco: 'medium' });
    expect(s.gerente.versao, 'o texto que roda tem de ser o arquivado: versão própria, não a genérica').toMatch(/-conferencia-1$/);
    expect(versao('gerente')).toBe(s.gerente.versao);
    expect(texto('gerente'), 'sem esta regra o Sonnet devolve nível sem evidência').toContain(REGRA);
    expect(texto('gerente'), 'o parágrafo do nível fácil é do Vertho').not.toContain('nível fácil');
  });

  it('os outros agentes ficam como eram: GPT, sem esforço e na versão genérica', async () => {
    const s = await snapshotPrompts('outra-empresa', false, 2);
    for (const e of ['criador', 'cliente', 'moderador', 'intencao'] as const) {
      expect(s[e].modelo).toBe('gpt-5.4-2026-03-05');
      expect(s[e]).not.toHaveProperty('esforco');
      expect(s[e].versao).not.toMatch(/conferencia/);
      expect(texto(e)).not.toContain(REGRA);
    }
  });

  it('o gerente em GPT segue exatamente como rodava: sem esforço, sem conferência, versão genérica', async () => {
    mocks.model.mockImplementation((async () => 'gpt-5.4-2026-03-05') as any);
    const s = await snapshotPrompts('outra-empresa', false, 2);
    expect(s.gerente).not.toHaveProperty('esforco');
    expect(s.gerente.versao).not.toMatch(/conferencia/);
    expect(texto('gerente')).not.toContain(REGRA);
  });

  it('o treino Vertho não muda: Sonnet 5.5 medium com o texto do comercial-3, sem a conferência genérica', async () => {
    const s = await snapshotPrompts(VERTHO_TREINO_EMPRESA_ID, true, 1);
    expect(s.gerente).toMatchObject({ modelo: 'claude-sonnet-5-5', esforco: 'medium' });
    expect(s.gerente.versao).toMatch(/-comercial-3$/);
    expect(texto('gerente')).toContain(REGRA);
    expect(texto('gerente').split('## Conferência final de evidências PACE').length - 1, 'a conferência não pode entrar duas vezes').toBe(1);
  });

  it('o helper só dá esforço a modelo Claude, e a conferência é só do gerente', () => {
    expect(esforcoPadraoPace('gerente', 'claude-sonnet-5-5')).toBe('medium');
    expect(esforcoPadraoPace('gerente', 'gpt-5.4-2026-03-05')).toBeUndefined();
    expect(gerenteComConferencia('gerente', 'claude-opus-5-5')).toBe(true);
    expect(gerenteComConferencia('cliente', 'claude-sonnet-5-5')).toBe(false);
    expect(gerenteComConferencia('gerente', 'gemini-3.8-flash')).toBe(false);
  });
});

// Criador, cliente, moderador e intenção fora do Vertho em Claude (08/10/2026, decisão do dono). `Medido` pelo `executarCore` +
// `gerador` reais: criador Sonnet `medium` 28 s contra 33 s do GPT; cliente Sonnet `low` p50 2,5 s contra 2,8 s (13 de 13 turnos
// válidos); moderador Haiku `medium` 23 de 26 na severidade (`none` subestima); intenção Haiku `none` 35 de 35.
describe('esforço dos simuladores PACE em Claude fora do treino Vertho', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.model.mockImplementation((async (_e: unknown, tarefa: string) =>
      tarefa === 'sim_vendas_moderador' || tarefa === 'sim_vendas_intencao' ? 'claude-haiku-5-5' : 'claude-sonnet-5-5') as any);
  });

  it('cada agente roda no esforço medido e o snapshot grava o modelo e o esforço', async () => {
    const s = await snapshotPrompts('outra-empresa', false, 2);
    expect(s.criador).toMatchObject({ modelo: 'claude-sonnet-5-5', esforco: 'medium' });
    expect(s.cliente).toMatchObject({ modelo: 'claude-sonnet-5-5', esforco: 'low' });
    expect(s.moderador).toMatchObject({ modelo: 'claude-haiku-5-5', esforco: 'medium' });
    expect(s.intencao).toMatchObject({ modelo: 'claude-haiku-5-5', esforco: 'none' });
    expect(s.gerente).toMatchObject({ modelo: 'claude-sonnet-5-5', esforco: 'medium' });
  });

  it('a conferência de evidências continua só no gerente (não vaza para os outros agentes)', async () => {
    const s = await snapshotPrompts('outra-empresa', false, 2);
    for (const e of ['criador', 'cliente', 'moderador', 'intencao'] as const) expect(s[e].versao).not.toMatch(/conferencia/);
  });

  it('o helper por etapa: Sonnet recusa `none` (400), então a intenção fora do Haiku roda em low; GPT e Gemini seguem sem esforço', () => {
    expect(esforcoPadraoPace('criador', 'claude-sonnet-5-5')).toBe('medium');
    expect(esforcoPadraoPace('cliente', 'claude-sonnet-5-5')).toBe('low');
    expect(esforcoPadraoPace('moderador', 'claude-haiku-5-5')).toBe('medium');
    expect(esforcoPadraoPace('intencao', 'claude-haiku-5-5')).toBe('none');
    expect(esforcoPadraoPace('intencao', 'claude-sonnet-5-5')).toBe('low');
    for (const etapa of ['criador', 'cliente', 'moderador', 'intencao', 'gerente'])
      for (const modelo of ['gpt-5.4-2026-03-05', 'gpt-5.4-mini', 'gemini-3.8-flash'])
        expect(esforcoPadraoPace(etapa, modelo), `${etapa} em ${modelo}`).toBeUndefined();
  });
});
